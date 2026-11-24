import { sameStudents, sectionOf } from "./clashes";
import { getFacultyStatuses, getTimetables } from "./data";
import { createClient } from "./supabase/server";
import { addDays, todayIST } from "./time";

export type Substitute = { initials: string; name: string; why?: string; /** Slots they are already busy that day. */ load?: number };

type TimetableCell = { room_id: string; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };

/** "SML-5A" → "SML" */
const courseOf = (subject: string) => subject.split("-")[0].trim().toUpperCase();

/**
 * Who could take a dropped class: faculty free in that slot that day, those who teach the same
 * course or the same class first, then whoever has the lightest day. `classes` are the dropped
 * classes as room, date and slot.
 */
export async function findSubstitutes(classes: { room_id: string; date: string; slot_id: number }[], me?: string | null): Promise<Map<string, { subject: string | null; people: Substitute[] }>> {
  const out = new Map<string, { subject: string | null; people: Substitute[] }>();
  if (!classes.length) return out;
  const supabase = await createClient();
  const dates = [...new Set(classes.map((c) => c.date))];
  const [statuses, timetables, all] = await Promise.all([
    getFacultyStatuses(dates),
    getTimetables(dates),
    supabase.rpc("get_timetable_all", { p_date: addDays(todayIST(), 1) }),
  ]);
  // Who teaches what in the regular week
  const teaches = new Map<string, Set<string>>();
  for (const t of (all.data ?? []) as TimetableCell[]) {
    if (t.is_department) continue;
    for (const ini of t.faculty_initials) teaches.set(ini, (teaches.get(ini) ?? new Set()).add(t.subject));
  }
  // How many slots each faculty member is already busy on each date, to share the extra classes fairly
  const loads = statuses.map((rows) => {
    const m = new Map<string, number>();
    for (const f of rows ?? []) if (f.busy) m.set(f.initials, (m.get(f.initials) ?? 0) + 1);
    return m;
  });
  for (const c of classes) {
    const i = dates.indexOf(c.date);
    const cell = timetables[i].find((t) => t.room_id === c.room_id && t.slot_id === c.slot_id);
    const subject = cell?.subject ?? null;
    const section = sectionOf(subject);
    const course = subject ? courseOf(subject) : null;
    const people = (statuses[i] ?? [])
      .filter((f) => f.slot_id === c.slot_id && !f.busy && f.initials !== me)
      .map((f): Substitute & { rank: number; load: number } => {
        const theirs = [...(teaches.get(f.initials) ?? [])];
        const same = course ? theirs.find((x) => courseOf(x) === course) : undefined;
        const sec = section ? theirs.find((x) => sectionOf(x) && sameStudents(sectionOf(x)!, section)) : undefined;
        const load = loads[i].get(f.initials) ?? 0;
        return { initials: f.initials, name: f.name, why: same ? `teaches ${same}` : sec ? `teaches ${sec}` : undefined, load, rank: same ? 0 : sec ? 1 : 2 };
      })
      .sort((a, b) => a.rank - b.rank || a.load - b.load || a.name.localeCompare(b.name));
    out.set(`${c.room_id}|${c.date}|${c.slot_id}`, { subject, people });
  }
  return out;
}
