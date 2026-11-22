import { affectedOn, DayState, makeSectionsOf, planBulk, shortDay, suggest, takersOn, type Affected, type Day, type Suggestion } from "@/lib/affected";
import { semestersOf } from "@/lib/classTimetable";
import { getHolidays, getRooms, getSlots, type FacultySlotStatus } from "@/lib/data";
import type { DayCell } from "@/lib/skillLab";
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

/** Every affected class over the days, each with its suggestions. */
export async function getAffected(dates: string[]) {
  const [{ days, semesterSections }, rooms, slots] = await Promise.all([loadDays(dates), getRooms(), getSlots()]);
  const sectionsOf = makeSectionsOf(semesterSections);
  const states = days.map((d) => new DayState(d, sectionsOf));
  const started = (date: string, id: number) => slotStarted(date, slots.find((s) => s.id === id) ?? { starts: "00:00" });
  // Moved to another day: a moved class names this room and day
  const movedReasons = days.flatMap((d) => d.schedule.filter((r) => r.status === "booked" && (r.reason ?? "").startsWith("Moved from ")).map((r) => `${r.subject}|${r.reason}`));
  const movedAway = (a: Affected) => movedReasons.some((m) => m.startsWith(`${a.subject}|Moved from ${a.room}, ${shortDay(a.date)},`));
  const rows: AffectedRow[] = [];
  days.forEach((d, i) => {
    for (const a of affectedOn(states[i], d, slots, movedAway, (s) => started(d.date, s))) {
      // Suggestions see the class gone from its own slots
      const st = states[i];
      const snapshot = { s: new Set(st.sectionBusy), f: new Set(st.facultyBusy) };
      st.vacate(a);
      rows.push({ ...a, suggestions: suggest(a, states, rooms, slots, sectionsOf, started) });
      st.sectionBusy.clear();
      snapshot.s.forEach((x) => st.sectionBusy.add(x));
      st.facultyBusy.clear();
      snapshot.f.forEach((x) => st.facultyBusy.add(x));
    }
  });
  // The bulk plan on its own copy of the days, so `states` stay as loaded
  const plan = planBulk(rows, days.map((d) => new DayState(d, sectionsOf)), rooms, slots, sectionsOf, started);
  const takers = days.flatMap((d) => takersOn(d, rows.filter((r) => r.date === d.date).map((r) => r.takenBy)));
  return { rows, rooms, slots, days, states, sectionsOf, plan, takers, semesterSections };
}
