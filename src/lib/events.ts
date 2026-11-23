import { sectionsInText, shortDay, takerLabel, type Day } from "./affected";
import { classesOf } from "./classTimetable";
import { movedFromRoom } from "./classDay";
import { isSee } from "./status";
import type { Slot, UpcomingRow } from "./types";

/**
 * Upcoming events: every event, skill lab, CIE and SEE still to come, one card each however many
 * rooms, times and days it takes. They are read from the same bookings as the timetable, so an
 * edit here shows everywhere, and the classes they take rooms from are in Classes affected.
 */

export type EventKind = "event" | "skill_lab" | "cie" | "see" | "event_request";
export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  event: "College event",
  skill_lab: "Skill lab",
  cie: "CIE",
  see: "SEE",
  event_request: "Approved event request",
};

export type EventDay = { date: string; runs: { room: string; slots: number[] }[]; slots: number[] };

export type UpcomingEvent = {
  title: string;
  /** The name without its sections: "Skill Lab" */
  label: string;
  kind: EventKind;
  sections: string[];
  faculty: string | null;
  reason: string | null;
  days: EventDay[];
};

/** "Skill Lab - 3B/3D" -> "Skill Lab" (as the database's event_label); "CIE-2, 5th sem" stays. */
export const eventLabel = takerLabel;

/** Its sections: from its name ("Skill Lab - 3B/3D"), or for an event named without them, from its description. */
function sectionsOf(title: string, reason: string | null, kind: EventKind) {
  const named = classesOf(title).filter((x) => x.length > 1);
  return named.length || kind === "cie" || kind === "see" ? named : sectionsInText(reason);
}

function kindOf(r: UpcomingRow): EventKind | null {
  if (r.kind === "cie") return isSee(r.title) ? "see" : "cie";
  if (r.kind === "event") return /skill\s*lab/i.test(r.title ?? "") ? "skill_lab" : "event";
  if (r.kind === "event_request") return "event_request";
  // A class booking that is a skill lab, or for several sections at once (moved classes are left out)
  if (r.kind === "class_request" && (/skill\s*lab/i.test(r.title ?? "") || classesOf(r.title ?? "").length > 1)) return "skill_lab";
  return null;
}

/** The events in upcoming bookings, soonest first; back-to-back slots of a room are one run. */
export function groupEvents(rows: UpcomingRow[], slots: Slot[]): UpcomingEvent[] {
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const by = new Map<string, UpcomingEvent>();
  for (const r of rows) {
    const kind = kindOf(r);
    if (!kind || !r.title || movedFromRoom(r.reason)) continue;
    const k = `${kind}|${r.title}`;
    const e = by.get(k) ?? { title: r.title, label: eventLabel(r.title), kind, sections: sectionsOf(r.title, r.reason, kind), faculty: r.faculty_name, reason: r.reason, days: [] };
    let day = e.days.find((d) => d.date === r.date);
    if (!day) {
      day = { date: r.date, runs: [], slots: [] };
      e.days.push(day);
    }
    if (!day.slots.includes(r.slot_id)) day.slots.push(r.slot_id);
    const run = day.runs.find((x) => x.room === r.room_id && (order.get(x.slots[x.slots.length - 1]) ?? -9) + 1 === order.get(r.slot_id));
    if (run) run.slots.push(r.slot_id);
    else day.runs.push({ room: r.room_id, slots: [r.slot_id] });
    by.set(k, e);
  }
  const out = [...by.values()];
  for (const e of out) {
    e.days.sort((a, b) => a.date.localeCompare(b.date));
    for (const d of e.days) {
      d.slots.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      d.runs.sort((a, b) => (order.get(a.slots[0]) ?? 0) - (order.get(b.slots[0]) ?? 0) || a.room.localeCompare(b.room, "en", { numeric: true }));
    }
  }
  return out.sort((a, b) => a.days[0].date.localeCompare(b.days[0].date) || (order.get(a.days[0].slots[0]) ?? 0) - (order.get(b.days[0].slots[0]) ?? 0) || a.title.localeCompare(b.title));
}

/**
 * Every slot an event changed on its days, for renaming or cancelling it: its own rooms, the
 * classes released for it ("3B at Skill Lab"), the classes cancelled for it (a CIE or SEE) and the
 * classes moved for it, the same day or a later one. The database changes only the slots whose
 * latest change is still the event's.
 */
export function eventPlaces(title: string, eventDates: string[], days: Day[]) {
  const label = eventLabel(title);
  const on = new Set(eventDates);
  const out = new Map<string, { room: string; date: string; slots: number[] }>();
  const add = (room: string, date: string, slot: number) => {
    const k = `${date}|${room}`;
    const p = out.get(k) ?? { room, date, slots: [] };
    if (!p.slots.includes(slot)) p.slots.push(slot);
    out.set(k, p);
  };
  for (const d of days) {
    for (const r of d.schedule) {
      const reason = r.reason ?? "";
      if (on.has(d.date)) {
        if (r.subject === title && ["booked", "event", "event_request", "cie"].includes(r.status) && !movedFromRoom(reason)) add(r.room_id, d.date, r.slot_id);
        if (r.status === "free" && (reason.endsWith(` at ${label}`) || reason.startsWith(`Class dropped: Cancelled for CIE: ${title}, semester `) || reason.startsWith(`Class dropped: Cancelled for SEE: ${title}, semester `))) add(r.room_id, d.date, r.slot_id);
      }
      if (r.status === "booked" && movedFromRoom(reason) && reason.endsWith(` for ${label}`)) {
        // Moved the same day ("Moved from MEL-LAB-02 for …") or from one of the event's days ("Moved from MEL-LAB-02, Tue 24 Nov, …")
        const otherDay = /, [A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2}, /.test(reason);
        if (otherDay ? eventDates.some((x) => reason.includes(`, ${shortDay(x)}, `)) : on.has(d.date)) add(r.room_id, d.date, r.slot_id);
      }
    }
  }
  return [...out.values()];
}
