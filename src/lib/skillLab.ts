import { classesOf } from "./classTimetable";
import type { Room } from "./types";

/** A regular timetable cell for a day (from get_timetable). */
export type DayCell = { room_id: string; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };

export const isLabRoom = (r: Room | undefined) => !!r && (r.kind === "lab" || /\bLAB\b/i.test(r.id) || /\bLAB\b/i.test(r.name));
/** A practical or a skill lab: it needs a lab. */
export const needsLab = (subject: string) => /\(P\)|\bLAB\b/i.test(subject);

/**
 * An event's or skill lab's name with its sections, so each section's timetable lists it:
 * "Skill Lab - 3B/3D". Sections already in the name are replaced.
 */
export function skillLabTitle(title: string, sections: string[]): string {
  const t = title.trim() || "Skill Lab";
  const base = classesOf(t).length ? t.slice(0, t.lastIndexOf("-")).trim() : t;
  return sections.length ? `${base} - ${sections.join("/")}` : base;
}
