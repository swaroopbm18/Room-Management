import type { Slot } from "./types";
import { DAY_NAMES } from "./faculty";

// A class's (section's) week, built from the room timetable. Shared by the admin editor and
// the public class timetable.

/** One class taught in a slot (or a block of slots): where, what and by whom. */
export type ClassEntry = { room: string; subject: string; initials: string[]; wholeSemester: boolean };

/** A cell of the class timetable: one slot, or several in a row with the same classes. */
export type Span = { weekday: number; slotIds: number[]; entries: ClassEntry[] };

export type Cell = { room_id: string; weekday: number; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };

export const OTHER = "other";

/**
 * The classes a subject is taught to, from the part after its last "-":
 * "DBMS-3B" → ["3B"], "KDD-5" → ["5"] (the whole semester), "DBMS-3B/3C" → ["3B", "3C"].
 * A subject with no section (e.g. "SKILL") gives [].
 */
export function classesOf(subject: string): string[] {
  const tail = subject.includes("-") ? subject.slice(subject.lastIndexOf("-") + 1) : "";
  const keys = tail.split(/[/,&]/).map((x) => x.trim().toUpperCase());
  return keys.every((k) => /^\d[A-Z]?$/.test(k)) ? keys : [];
}

export const ordinal = (n: string) => `${n}${n === "1" ? "st" : n === "2" ? "nd" : n === "3" ? "rd" : "th"} semester`;

/** Every class in the timetable, the chosen one (from `requested`, else the first) and its week. */
export function buildClassTimetable(cells: Cell[], slots: Slot[], requested?: string) {
  // Every class with a section, by semester; a semester with only whole-semester subjects is a class of its own
  const sections = new Map<string, Set<string>>();
  const wholeSemester = new Set<string>();
  let hasOther = false;
  for (const c of cells) {
    if (c.is_department) continue;
    const keys = classesOf(c.subject);
    if (keys.length === 0) hasOther = true;
    for (const k of keys) {
      if (!sections.has(k[0])) sections.set(k[0], new Set());
      if (k.length > 1) sections.get(k[0])!.add(k);
      else wholeSemester.add(k);
    }
  }
  const semesters = [...sections.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sem, set]) => ({ sem, classes: set.size ? [...set].sort() : [sem] }));
  const allClasses = [...semesters.flatMap((s) => s.classes), ...(hasOther ? [OTHER] : [])];
  const chosen = allClasses.includes(String(requested ?? "").toUpperCase()) ? String(requested).toUpperCase() : requested === OTHER && hasOther ? OTHER : allClasses[0];
  const label = (k: string) => (k === OTHER ? "Other classes" : k.length === 1 ? `Semester ${k} (all sections)` : `Class ${k}`);

  const inClass = (c: Cell) => {
    if (c.is_department) return false;
    const keys = classesOf(c.subject);
    return chosen === OTHER ? keys.length === 0 : keys.includes(chosen) || keys.includes(chosen?.[0] ?? "");
  };
  const toEntry = (c: Cell): ClassEntry => ({
    room: c.room_id,
    subject: c.subject,
    initials: c.faculty_initials,
    wholeSemester: chosen !== OTHER && chosen.length > 1 && classesOf(c.subject).includes(chosen[0]),
  });

  // One span per class block: consecutive slots with the same classes and no break between them merge, like a lab
  const mine = new Map<string, ClassEntry[]>();
  for (const c of cells.filter(inClass)) {
    const k = `${c.weekday}|${c.slot_id}`;
    mine.set(k, [...(mine.get(k) ?? []), toEntry(c)]);
  }
  const sig = (es: ClassEntry[]) => es.map((e) => `${e.room}|${e.subject}|${e.initials.join(",")}`).sort().join(";");
  const days: Span[][] = DAY_NAMES.map((_, i) => {
    const weekday = i + 1;
    const spans: Span[] = [];
    slots.forEach((s, j) => {
      const entries = (mine.get(`${weekday}|${s.id}`) ?? []).sort((a, b) => a.subject.localeCompare(b.subject));
      const prev = spans[spans.length - 1];
      if (prev && entries.length > 0 && sig(prev.entries) === sig(entries) && slots[j - 1].ends === s.starts) prev.slotIds.push(s.id);
      else spans.push({ weekday, slotIds: [s.id], entries });
    });
    return spans;
  });

  // Subjects and faculty of this class, like the key under a printed class timetable
  const subjects = new Map<string, { initials: Set<string>; slots: number }>();
  for (const c of cells.filter(inClass)) {
    const s = subjects.get(c.subject) ?? { initials: new Set<string>(), slots: 0 };
    c.faculty_initials.forEach((x) => s.initials.add(x));
    s.slots++;
    subjects.set(c.subject, s);
  }

  return { semesters, hasOther, allClasses, chosen, label, days, wholeSemester, subjects };
}
