import { classesOf, type Cell } from "./classTimetable";
import { sameStudents } from "./clashes";
import { DAY_NAMES } from "./faculty";
import { slotOpen } from "./time";
import type { Slot } from "./types";

export type Problem = {
  kind: "faculty" | "section" | "unknown" | "nofaculty" | "closed" | "duty";
  /** "problem" must be fixed; "check" may be fine, e.g. lab batches of one class in two rooms */
  level: "problem" | "check";
  weekday: number;
  slotIds: number[];
  text: string;
  /** "Monday 8:00 AM" */
  when: string;
  /** a class key to open in the class timetable editor */
  cls?: string;
};

export const KINDS: Record<Problem["kind"], string> = {
  faculty: "Faculty in two rooms at once",
  section: "Class in two places at once",
  unknown: "Initials not on the faculty list",
  nofaculty: "Classes with no faculty",
  closed: "Classes on Saturday after 2 PM",
  duty: "Classes clashing with another duty",
};

type Duty = { initials: string; weekday: number; slot_id: number; activity: string };

/**
 * Everything odd in the week's timetable. Back-to-back slots with the same problem are merged,
 * so a 3-slot lab clash is one line, not three.
 */
export function checkTimetable(cells: Cell[], slots: Slot[], names: Record<string, string>, duties: Duty[]): Problem[] {
  const label = new Map(slots.map((s) => [s.id, s.label.split(" – ")[0]]));
  const order = new Map(slots.map((s, i) => [s.id, i]));
  type Raw = Omit<Problem, "slotIds" | "when"> & { slot: number };
  const raw: (Raw & { key: string })[] = [];
  const add = (p: Raw, key: string) => raw.push({ ...p, key });
  const teaching = cells.filter((c) => !c.is_department);
  const at = new Map<string, Cell[]>();
  for (const c of teaching) at.set(`${c.weekday}|${c.slot_id}`, [...(at.get(`${c.weekday}|${c.slot_id}`) ?? []), c]);
  const name = (ini: string) => (names[ini] ? `${names[ini]} (${ini})` : ini);
  const firstClass = (c: Cell) => classesOf(c.subject)[0];

  for (const [k, list] of at) {
    const [weekday, slot] = k.split("|").map(Number);
    // The same initials in two rooms
    const rooms = new Map<string, Cell[]>();
    for (const c of list) for (const ini of c.faculty_initials) rooms.set(ini, [...(rooms.get(ini) ?? []), c]);
    for (const [ini, cs] of rooms) {
      if (new Set(cs.map((c) => c.room_id)).size < 2) continue;
      add({ kind: "faculty", level: "problem", weekday, slot, text: `${name(ini)} has ${cs.map((c) => `${c.subject} in ${c.room_id}`).join(" and ")}`, cls: firstClass(cs[0]) }, `${ini}|${cs.map((c) => c.room_id).sort().join(",")}`);
    }
    // One section in two classes at once: its own and a whole-semester one, or two of its own.
    // Whole-semester electives side by side are normal, and so is one subject in two rooms (batches).
    const sections = new Set(list.flatMap((c) => classesOf(c.subject)).filter((x) => x.length > 1));
    for (const sec of sections) {
      const mine = list.filter((c) => classesOf(c.subject).some((x) => sameStudents(x, sec)));
      const own = mine.filter((c) => classesOf(c.subject).includes(sec));
      const subjects = new Set(mine.map((c) => c.subject));
      if (subjects.size < 2 || own.length === 0) continue;
      const practical = mine.every((c) => /\(P\)|LAB/i.test(c.subject));
      add(
        {
          kind: "section",
          level: practical ? "check" : "problem",
          weekday,
          slot,
          text: `${sec} has ${mine.map((c) => `${c.subject} in ${c.room_id}`).join(", ")}${practical ? ". Fine if these are lab batches." : ""}`,
          cls: sec,
        },
        `${sec}|${mine.map((c) => c.room_id + c.subject).sort().join(",")}`,
      );
    }
  }

  for (const c of teaching) {
    const unknown = c.faculty_initials.filter((x) => !names[x]);
    if (unknown.length) add({ kind: "unknown", level: "problem", weekday: c.weekday, slot: c.slot_id, text: `${unknown.join(", ")} in ${c.subject} (${c.room_id})`, cls: firstClass(c) }, `${unknown.join(",")}|${c.room_id}|${c.subject}`);
    if (!c.faculty_initials.length) add({ kind: "nofaculty", level: "check", weekday: c.weekday, slot: c.slot_id, text: `${c.subject} in ${c.room_id}`, cls: firstClass(c) }, `${c.room_id}|${c.subject}`);
    const s = slots.find((x) => x.id === c.slot_id);
    if (s && !slotOpen(c.weekday, s)) add({ kind: "closed", level: "check", weekday: c.weekday, slot: c.slot_id, text: `${c.subject} in ${c.room_id}`, cls: firstClass(c) }, `${c.room_id}|${c.subject}`);
  }

  for (const d of duties) {
    const c = at.get(`${d.weekday}|${d.slot_id}`)?.find((x) => x.faculty_initials.includes(d.initials));
    if (c) add({ kind: "duty", level: "problem", weekday: d.weekday, slot: d.slot_id, text: `${name(d.initials)} has ${c.subject} in ${c.room_id} and the duty "${d.activity}"`, cls: firstClass(c) }, `${d.initials}|${c.room_id}|${d.activity}`);
  }

  // Merge back-to-back slots of the same problem
  raw.sort((a, b) => a.kind.localeCompare(b.kind) || a.weekday - b.weekday || a.key.localeCompare(b.key) || (order.get(a.slot) ?? 0) - (order.get(b.slot) ?? 0));
  const out: (Problem & { key: string })[] = [];
  for (const r of raw) {
    const prev = out[out.length - 1];
    const last = prev?.slotIds[prev.slotIds.length - 1];
    if (prev && prev.kind === r.kind && prev.weekday === r.weekday && prev.key === r.key && (order.get(r.slot) ?? -9) === (order.get(last) ?? -9) + 1) {
      prev.slotIds.push(r.slot);
      continue;
    }
    out.push({ kind: r.kind, level: r.level, weekday: r.weekday, slotIds: [r.slot], text: r.text, cls: r.cls, key: r.key, when: `${DAY_NAMES[r.weekday - 1]} ${label.get(r.slot)}` });
  }
  return out.map((p) => ({ kind: p.kind, level: p.level, weekday: p.weekday, slotIds: p.slotIds, text: p.text, when: p.when, cls: p.cls }));
}
