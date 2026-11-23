import { affectedOn, byPriority, DayState, makeSectionsOf, planBulk, shortDay, suggest, type Affected, type Day, type Suggestion } from "@/lib/affected";
import { semestersOf } from "@/lib/classTimetable";
import { getHolidays, getRooms, getSlots, type FacultySlotStatus } from "@/lib/data";
import { needsLab, type DayCell } from "@/lib/skillLab";
import { createClient } from "@/lib/supabase/server";
import { addDays, isClosedSunday, slotStarted } from "@/lib/time";
import type { ScheduleRow } from "@/lib/types";

/** The working days from `start`, `count` of them at most within `span` calendar days. */
export async function workingDays(start: string, span: number): Promise<string[]> {
  const holidays = await getHolidays();
  const out: string[] = [];
  for (let d = start, i = 0; i < span; d = addDays(d, 1), i++) if (!isClosedSunday(d) && !holidays.has(d)) out.push(d);
  return out;
}

/** The working days from `start` to `end`, both included. */
export async function workingDaysBetween(start: string, end: string): Promise<string[]> {
  let span = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) span++;
  return workingDays(start, span);
}

export async function loadDays(dates: string[]): Promise<{ days: Day[]; semesterSections: Record<string, string[]> }> {
  const supabase = await createClient();
  let semesterSections: Record<string, string[]> = {};
  const days = await Promise.all(
    dates.map(async (date, i) => {
      const [sch, tt, st, all] = await Promise.all([
        supabase.rpc("get_day_schedule", { p_date: date }),
        supabase.rpc("get_timetable", { p_date: date }),
        supabase.rpc("faculty_status", { p_date: date }),
        i === 0 ? supabase.rpc("get_timetable_all", { p_date: date }) : Promise.resolve({ data: null }),
      ]);
      if (sch.error) throw new Error(sch.error.message);
      if (i === 0 && all.data) {
        semesterSections = Object.fromEntries(
          semestersOf((all.data as DayCell[]).filter((c) => !c.is_department).map((c) => c.subject)).semesters.map((x) => [x.sem, x.classes]),
        );
      }
      return { date, schedule: (sch.data ?? []) as ScheduleRow[], timetable: (tt.data ?? []) as DayCell[], status: (st.data ?? []) as FacultySlotStatus[] };
    }),
  );
  return { days, semesterSections };
}

export type AffectedRow = Affected & { suggestions: Suggestion[] };

/**
 * Every affected class over the days, each with its suggestions. Classes that lost their room to an
 * event or skill lab come first, then those that lost it to a CIE or SEE, then any other booking:
 * the bulk plan places them in that order, so they get the best rooms.
 */
export async function getAffected(dates: string[]) {
  const [{ days, semesterSections }, rooms, slots] = await Promise.all([loadDays(dates), getRooms(), getSlots()]);
  const sectionsOf = makeSectionsOf(semesterSections);
  const states = days.map((d) => new DayState(d, sectionsOf));
  const started = (date: string, id: number) => slotStarted(date, slots.find((s) => s.id === id) ?? { starts: "00:00" });
  // Moved to another day: a moved class names this room and day
  const movedReasons = days.flatMap((d) => d.schedule.filter((r) => r.status === "booked" && (r.reason ?? "").startsWith("Moved from ")).map((r) => `${r.subject}|${r.reason}`));
  const movedAway = (a: Affected) => movedReasons.some((m) => m.startsWith(`${a.subject}|Moved from ${a.room}, ${shortDay(a.date)},`));
  const found = days.flatMap((d, i) => affectedOn(states[i], d, slots, movedAway, (s) => started(d.date, s)).map((a) => ({ a, i }))).sort((x, y) => byPriority(slots)(x.a, y.a));
  const rows: AffectedRow[] = [];
  for (const { a, i } of found) {
    // Suggestions see the class gone from its own slots
    const st = states[i];
    const snapshot = { s: new Set(st.sectionBusy), f: new Set(st.facultyBusy) };
    st.vacate(a);
    rows.push({ ...a, suggestions: suggest(a, states, rooms, slots, sectionsOf, started, needsLab(a.subject) ? 6 : 4) });
    st.sectionBusy.clear();
    snapshot.s.forEach((x) => st.sectionBusy.add(x));
    st.facultyBusy.clear();
    snapshot.f.forEach((x) => st.facultyBusy.add(x));
  }
  // The bulk plan on its own copy of the days, so `states` stay as loaded
  const plan = planBulk(rows, days.map((d) => new DayState(d, sectionsOf)), rooms, slots, sectionsOf, started);
  return { rows, rooms, slots, days, states, sectionsOf, plan, semesterSections };
}

export type Place = { date: string; room: string; slots: number[] };
export type Release = { room: string; date: string; slot: number; section: string; subject: string };
export type Displaced = { date: string; room: string; slots: number[]; subject: string };

/**
 * What booking `places` does to the regular classes, before it is saved: the classes of the sections
 * attending (`sections`, e.g. ["3B", "3D"]) at its times are released, since those students are at
 * it; and the classes of other sections in its rooms lose their room, so they will be listed in
 * Classes affected. A class of a semester whose classes are cancelled (`semesters`, a CIE or SEE)
 * is neither. Only the first `maxDays` days are read.
 */
export async function classesHit(places: Place[], sections: string[], semesters: string[] = [], maxDays = 28) {
  const dates = [...new Set(places.map((p) => p.date))].sort().slice(0, maxDays);
  if (!dates.length) return { releases: [] as Release[], displaced: [] as Displaced[], read: 0 };
  const [{ days, semesterSections }, slots] = await Promise.all([loadDays(dates), getSlots()]);
  const sectionsOf = makeSectionsOf(semesterSections);
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const attending = new Set(sections);
  const releases: Release[] = [];
  const displaced: Displaced[] = [];
  for (const d of days) {
    const here = places.filter((p) => p.date === d.date);
    const taken = new Set(here.flatMap((p) => p.slots.map((s) => `${p.room}|${s}`)));
    const times = new Set(here.flatMap((p) => p.slots));
    const status = new Map(d.schedule.map((r) => [`${r.room_id}|${r.slot_id}`, r.status]));
    const cells = [...d.timetable].sort((a, b) => a.room_id.localeCompare(b.room_id) || (order.get(a.slot_id) ?? 0) - (order.get(b.slot_id) ?? 0));
    for (const c of cells) {
      if (c.is_department || !times.has(c.slot_id) || slotStarted(d.date, slots.find((s) => s.id === c.slot_id) ?? { starts: "00:00" })) continue;
      const secs = sectionsOf(c.subject);
      if (!secs.length || status.get(`${c.room_id}|${c.slot_id}`) !== "class") continue;
      if (secs.every((k) => semesters.includes(k[0]))) continue; // cancelled for the exam
      const all = secs.every((k) => attending.has(k));
      if (taken.has(`${c.room_id}|${c.slot_id}`)) {
        if (all) continue; // its students are at the event, in their own room
        const last = displaced[displaced.length - 1];
        if (last && last.date === d.date && last.room === c.room_id && last.subject === c.subject && (order.get(last.slots[last.slots.length - 1]) ?? -9) + 1 === order.get(c.slot_id)) last.slots.push(c.slot_id);
        else displaced.push({ date: d.date, room: c.room_id, slots: [c.slot_id], subject: c.subject });
      } else if (all) {
        releases.push({ room: c.room_id, date: d.date, slot: c.slot_id, section: secs.filter((k) => attending.has(k)).join(", "), subject: c.subject });
      }
    }
  }
  return { releases, displaced, read: dates.length };
}
