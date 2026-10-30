import { sameStudents, sectionOf } from "./clashes";
import { getFacultyStatus } from "./data";
import { createClient } from "./supabase/server";
import { addDays, todayIST } from "./time";

export type Substitute = { initials: string; name: string; why?: string };

type TimetableCell = { room_id: string; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };

/** "SML-5A" → "SML" */
const courseOf = (subject: string) => subject.split("-")[0].trim().toUpperCase();

/**
 * Who could take a dropped class: faculty free in that slot that day, those who teach the same
 * course or the same class first. `classes` are the dropped classes as room, date and slot.
 */
export async function findSubstitutes(classes: { room_id: string; date: string; slot_id: number }[], me?: string | null): Promise<Map<string, { subject: string | null; people: Substitute[] }>> {
  const out = new Map<string, { subject: string | null; people: Substitute[] }>();
  if (!classes.length) return out;
  const supabase = await createClient();
  const dates = [...new Set(classes.map((c) => c.date))];
  const [statuses, timetables, all] = await Promise.all([
    Promise.all(dates.map((d) => getFacultyStatus(d))),
    Promise.all(dates.map((d) => supabase.rpc("get_timetable", { p_date: d }))),
    supabase.rpc("get_timetable_all", { p_date: addDays(todayIST(), 1) }),
  ]);
  // Who teaches what in the regular week
  const teaches = new Map<string, Set<string>>();
  for (const t of (all.data ?? []) as TimetableCell[]) {
    if (t.is_department) continue;
    for (const ini of t.faculty_initials) teaches.set(ini, (teaches.get(ini) ?? new Set()).add(t.subject));
  }
  for (const c of classes) {
    const i = dates.indexOf(c.date);
    const cell = ((timetables[i].data ?? []) as TimetableCell[]).find((t) => t.room_id === c.room_id && t.slot_id === c.slot_id);
    const subject = cell?.subject ?? null;
    const section = sectionOf(subject);
    const course = subject ? courseOf(subject) : null;
    const people = (statuses[i] ?? [])
      .filter((f) => f.slot_id === c.slot_id && !f.busy && f.initials !== me)
      .map((f): Substitute & { rank: number } => {
        const theirs = [...(teaches.get(f.initials) ?? [])];
        const same = course ? theirs.find((x) => courseOf(x) === course) : undefined;
        const sec = section ? theirs.find((x) => sectionOf(x) && sameStudents(sectionOf(x)!, section)) : undefined;
        return { initials: f.initials, name: f.name, why: same ? `teaches ${same}` : sec ? `teaches ${sec}` : undefined, rank: same ? 0 : sec ? 1 : 2 };
      })
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    out.set(`${c.room_id}|${c.date}|${c.slot_id}`, { subject, people });
  }
  return out;
}
