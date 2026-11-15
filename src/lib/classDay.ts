import { classesOf, type Cell } from "./classTimetable";
import type { ScheduleRow, Slot } from "./types";

type DayCell = Omit<Cell, "weekday">;

/**
 * One line of a class's day: a class running as planned, cancelled, its room taken by an event
 * or CIE, taken by another faculty member (a substitute or class exchange), or an extra class.
 */
export type ClassLine = {
  slotIds: number[];
  subject: string;
  room: string;
  who: string | null;
  state: "on" | "cancelled" | "taken" | "changed" | "extra";
  note?: string;
};

export const LINE_STATE: Record<ClassLine["state"], { label: string; cls: string }> = {
  on: { label: "On", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  extra: { label: "Extra / moved", cls: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  changed: { label: "Faculty changed", cls: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200" },
  taken: { label: "Room taken", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

/** Every class at once, for the list of all changes. */
export const ALL_CLASSES = "*";

/** Whether a subject is taught to the class `chosen` ("3A", "3" for the whole semester, or ALL_CLASSES). */
export const forClass = (subject: string | null | undefined, chosen: string | undefined) =>
  !!subject && !!chosen && (chosen === ALL_CLASSES ? classesOf(subject).length > 0 : classesOf(subject).some((k) => k === chosen || k === chosen[0]));

/**
 * A class's day as it actually runs, from its regular timetable that day (`dayCells`, from
 * get_timetable) and what each room is doing (`schedule`, from get_day_schedule). Back-to-back
 * slots of the same class read as one line, like a lab.
 */
export function classDay(chosen: string | undefined, dayCells: DayCell[], schedule: ScheduleRow[], slots: Slot[]): ClassLine[] {
  const rowAt = new Map(schedule.map((r) => [`${r.room_id}|${r.slot_id}`, r]));
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const lines: ClassLine[] = [];
  for (const c of dayCells.filter((c) => !c.is_department && forClass(c.subject, chosen))) {
    const r = rowAt.get(`${c.room_id}|${c.slot_id}`);
    if (!r) continue;
    // A class booking for the same class in its own slot is the class taken by someone else
    const state: ClassLine["state"] =
      r.status === "class" ? "on" : r.status === "free" ? "cancelled" : r.status === "booked" && forClass(r.subject, chosen) ? "changed" : "taken";
    const note =
      state === "cancelled"
        ? (r.reason ?? undefined)
        : state === "taken"
          ? `${r.subject ?? "Booked"}${r.status === "cie" ? " (CIE)" : ""}`
          : state === "changed"
            ? `${r.subject !== c.subject ? `${r.subject} in place of ${c.subject}` : "Taken by another faculty member"}${r.reason?.startsWith("Class exchange:") ? " · class exchange" : ""}`
            : undefined;
    lines.push({ slotIds: [c.slot_id], subject: c.subject, room: c.room_id, who: state === "on" || state === "changed" ? r.faculty_name : null, state, note });
  }
  // Class bookings for this class in another room or slot
  for (const r of schedule.filter((r) => r.status === "booked" && forClass(r.subject, chosen))) {
    if (lines.some((l) => l.room === r.room_id && l.slotIds.includes(r.slot_id))) continue;
    lines.push({ slotIds: [r.slot_id], subject: r.subject!, room: r.room_id, who: r.faculty_name, state: "extra" });
  }
  lines.sort((a, b) => (order.get(a.slotIds[0]) ?? 0) - (order.get(b.slotIds[0]) ?? 0) || a.subject.localeCompare(b.subject));
  const merged: ClassLine[] = [];
  for (const l of lines) {
    const m = merged.find(
      (x) => x.subject === l.subject && x.room === l.room && x.state === l.state && x.note === l.note && (order.get(x.slotIds[x.slotIds.length - 1]) ?? -9) + 1 === order.get(l.slotIds[0]),
    );
    if (m) m.slotIds.push(...l.slotIds);
    else merged.push({ ...l, slotIds: [...l.slotIds] });
  }
  return merged;
}
