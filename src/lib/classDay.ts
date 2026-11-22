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
  state: "on" | "cancelled" | "taken" | "changed" | "extra" | "exam";
  note?: string;
};

export const LINE_STATE: Record<ClassLine["state"], { label: string; cls: string }> = {
  on: { label: "On", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  extra: { label: "Extra / moved", cls: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  changed: { label: "Faculty changed", cls: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200" },
  taken: { label: "Room taken", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  exam: { label: "CIE / SEE", cls: "bg-ink text-white dark:bg-white dark:text-black" },
};

/** "CIE" or "SEE" when a class line is cancelled for an exam or its room is taken by one, else null. */
function examOf(l: ClassLine, status: string | undefined, title: string | null | undefined): "CIE" | "SEE" | null {
  // A CIE day's drop reads "Class dropped: Cancelled for CIE: SEE Maths, semester 5"
  const m = l.state === "cancelled" ? /^(?:Class dropped: )?Cancelled for (CIE|SEE)\b:?\s*(.*)$/.exec(l.note ?? "") : null;
  if (m) return m[1] === "SEE" || /^SEE\b/i.test(m[2]) ? "SEE" : "CIE";
  if (l.state === "taken" && status === "cie") return /^SEE\b/i.test((title ?? "").trim()) ? "SEE" : "CIE";
  return null;
}

/** The room a class was moved from for a skill lab ("Moved from MEL-LAB-02, 8:00 AM – 9:50 AM for Skill Lab"), else null. */
export function movedFromRoom(reason: string | null | undefined): string | null {
  return /^Moved from ([^,\s]+)/.exec(reason ?? "")?.[1] ?? null;
}

/**
 * Where the class a booking took the place of was moved to for a skill lab, from the day's
 * schedule: "MEL-CR-03" (same time) or "MEL-CR-03 at 2:00 PM"; null if it was not moved.
 */
export function movedTo(day: ScheduleRow[], row: Pick<ScheduleRow, "room_id" | "slot_id" | "original_subject">): string | null {
  if (!row.original_subject) return null;
  const moved = day.filter((x) => x.status === "booked" && x.subject === row.original_subject && movedFromRoom(x.reason) === row.room_id);
  const same = moved.find((x) => x.slot_id === row.slot_id);
  if (same) return same.room_id;
  const first = moved.sort((a, b) => a.starts.localeCompare(b.starts))[0];
  return first ? `${first.room_id} at ${first.slot_label.split(" – ")[0]}` : null;
}

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
    const sameClass = (subject: string | null) => forClass(subject, chosen) && classesOf(subject ?? "").some((k) => classesOf(c.subject).some((x) => x === k || x[0] === k || k[0] === x));
    // A class moved here for a skill lab took a room this class had released: its students are at the skill lab
    // …or this class's own room went to a booking for several sections, this one included (a skill lab)
    const groupBooking = r.status === "booked" && sameClass(r.subject) && classesOf(r.subject ?? "").length > 1 && r.subject !== c.subject;
    const gaveWay = (r.status === "booked" && !sameClass(r.subject) && !!movedFromRoom(r.reason)) || groupBooking;
    const state: ClassLine["state"] =
      r.status === "class" ? "on" : r.status === "free" || gaveWay ? "cancelled" : r.status === "booked" && sameClass(r.subject) ? "changed" : "taken";
    const lab = groupBooking ? r : gaveWay ? schedule.find((x) => x.slot_id === c.slot_id && x.status === "booked" && x !== r && sameClass(x.subject)) : undefined;
    const note =
      gaveWay
        ? lab ? `At ${lab.subject} (${lab.room_id})` : "Released"
        : state === "cancelled"
        ? (r.reason ?? undefined)
        : state === "taken"
          ? `${r.subject ?? "Booked"}${r.status === "cie" ? " (CIE)" : ""}`
          : state === "changed"
            ? `${r.subject !== c.subject ? `In place of ${c.subject}${r.original_faculty ? ` (${r.original_faculty})` : ""}` : `Taken by another faculty member${r.original_faculty ? ` in place of ${r.original_faculty}` : ""}`}${r.reason?.startsWith("Class exchange:") ? " · class exchange" : ""}`
            : undefined;
    // An exchange to a colleague's own subject shows the class as it now runs (COA-3E by them), with what it replaced
    const line: ClassLine = { slotIds: [c.slot_id], subject: state === "changed" && r.subject ? r.subject : c.subject, room: c.room_id, who: state === "on" || state === "changed" ? r.faculty_name : null, state, note };
    // Its lab taken for a skill lab and the class moved: to another room at the same time (one
    // line, in the new room), or to another time (said here, and listed at that time)
    if (state === "taken") {
      const moved = schedule.filter((x) => x.status === "booked" && x.subject === c.subject && movedFromRoom(x.reason) === c.room_id);
      const same = moved.find((x) => x.slot_id === c.slot_id);
      if (same) {
        Object.assign(line, { room: same.room_id, who: same.faculty_name, state: "extra", note: `Moved from ${c.room_id}` });
      } else if (moved.length) {
        const first = [...moved].sort((a, b) => (order.get(a.slot_id) ?? 0) - (order.get(b.slot_id) ?? 0))[0];
        line.note = `Moved to ${first.room_id} at ${first.slot_label.split(" – ")[0]}`;
      }
    }
    // A class cancelled for a CIE or SEE (or whose room the exam takes) is not listed on its own:
    // the class reads as one line, "CIE: classes cancelled"
    const exam = examOf(line, r.status, r.subject);
    if (exam) {
      const who = chosen && chosen !== ALL_CLASSES ? (chosen.length === 1 ? `Semester ${chosen}` : chosen) : `Semester ${[...new Set(classesOf(c.subject).map((k) => k[0]))].join(", ")}`;
      line.subject = who;
      line.room = "";
      line.state = "exam";
      line.note = `${exam}: classes cancelled`;
    }
    lines.push(line);
  }
  // Class bookings for this class in another room or slot
  for (const r of schedule.filter((r) => r.status === "booked" && forClass(r.subject, chosen))) {
    if (lines.some((l) => l.room === r.room_id && l.slotIds.includes(r.slot_id))) continue;
    lines.push({ slotIds: [r.slot_id], subject: r.subject!, room: r.room_id, who: r.faculty_name, state: "extra", note: movedFromRoom(r.reason) ? r.reason!.replace(/ for .*$/, "") : undefined });
  }
  lines.sort((a, b) => (order.get(a.slotIds[0]) ?? 0) - (order.get(b.slotIds[0]) ?? 0) || a.subject.localeCompare(b.subject));
  const merged: ClassLine[] = [];
  for (const l of lines) {
    const m = merged.find(
      (x) => x.subject === l.subject && x.room === l.room && x.state === l.state && x.note === l.note && (order.get(x.slotIds[x.slotIds.length - 1]) ?? -9) + 1 === order.get(l.slotIds[0]),
    );
    if (m) m.slotIds.push(...l.slotIds);
    else if (l.state === "exam") {
      // One exam line per class a day, from its first slot to its last
      const e = merged.find((x) => x.state === "exam" && x.subject === l.subject && x.note === l.note);
      if (e) e.slotIds = [...new Set([...e.slotIds, ...l.slotIds])].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      else merged.push({ ...l, slotIds: [...l.slotIds] });
    }
    else merged.push({ ...l, slotIds: [...l.slotIds] });
  }
  // A booking for several sections in several rooms (a skill lab) reads as one line, from its first slot to its last
  const out: ClassLine[] = [];
  for (const l of merged) {
    const g = l.state === "extra" && classesOf(l.subject).length > 1 ? out.find((x) => x.state === "extra" && x.subject === l.subject) : undefined;
    if (!g) {
      out.push(l);
      continue;
    }
    g.slotIds = [...new Set([...g.slotIds, ...l.slotIds])].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    g.room = [...new Set([...g.room.split(", "), l.room])].sort().join(", ");
  }
  return out;
}
