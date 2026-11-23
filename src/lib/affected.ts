import { classesOf } from "./classTimetable";
import { movedFromRoom } from "./classDay";
import type { FacultySlotStatus } from "./data";
import { isLabRoom, needsLab, type DayCell } from "./skillLab";
import type { Room, ScheduleRow, Slot } from "./types";

/**
 * Classes affected: regular classes whose room was taken (by an event, a skill lab, a CIE or SEE,
 * or a booking) and that have not been moved, and where each could go instead. A suggestion needs a free room
 * (a practical in a lab, or else a classroom), the class's sections free, and its faculty free then and
 * in the slot just before and just after.
 */

export type Day = { date: string; schedule: ScheduleRow[]; timetable: DayCell[]; status: FacultySlotStatus[] };

export type Affected = {
  date: string;
  room: string;
  slots: number[];
  subject: string;
  faculty: string[];
  facultyName: string | null;
  /** What took the room, e.g. "Skill Lab - 3B/3D" */
  takenBy: string;
  takenKind: string;
  /** Why: an event or skill lab comes first */
  cause: Cause;
};

/** `classroom`: a practical in a classroom, offered alongside the labs */
export type Suggestion = { date: string; room: string; slots: number[]; sameTime: boolean; sameDay: boolean; classroom?: boolean };

const key = (room: string, slot: number) => `${room}|${slot}`;

/** "8:00 AM – 9:50 AM" */
export function slotRange(slots: Slot[], ids: number[]): string {
  const a = slots.find((s) => s.id === ids[0]);
  const b = slots.find((s) => s.id === ids[ids.length - 1]);
  return a && b ? `${a.label.split(" – ")[0]} – ${b.label.split(" – ")[1]}` : "";
}

export const shortDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Where a class was, as a moved class's description names it: with the day when it moves to another day. */
export function fromText(a: Pick<Affected, "room" | "date" | "slots">, to: Pick<Suggestion, "date" | "slots">, slots: Slot[]): string {
  if (a.date !== to.date) return `${a.room}, ${shortDay(a.date)}, ${slotRange(slots, a.slots)}`;
  if (a.slots.join() === to.slots.join()) return a.room;
  return `${a.room}, ${slotRange(slots, a.slots)}`;
}

/** Who is busy when on one day: rooms, sections and faculty. */
export class DayState {
  readonly date: string;
  readonly cell: Map<string, ScheduleRow>;
  readonly roomBusy = new Set<string>();
  readonly sectionBusy = new Set<string>();
  readonly facultyBusy = new Set<string>();
  readonly initialsOf = new Map<string, string>();
  private readonly tt: Map<string, DayCell>;

  constructor(
    day: Day,
    private readonly sectionsOf: (subject: string) => string[],
  ) {
    this.date = day.date;
    this.cell = new Map(day.schedule.map((r) => [key(r.room_id, r.slot_id), r]));
    this.tt = new Map(day.timetable.map((c) => [key(c.room_id, c.slot_id), c]));
    for (const r of day.schedule) {
      if (r.status !== "free") this.roomBusy.add(key(r.room_id, r.slot_id));
      if ((r.status === "class" || r.status === "booked") && r.subject) for (const k of sectionsOf(r.subject)) this.sectionBusy.add(`${k}|${r.slot_id}`);
    }
    for (const f of day.status) {
      this.initialsOf.set(f.name, f.initials);
      if (f.busy) this.facultyBusy.add(`${f.initials}|${f.slot_id}`);
    }
  }

  facultyAt(room: string, slot: number): string[] {
    const r = this.cell.get(key(room, slot));
    const t = this.tt.get(key(room, slot));
    if (t && !t.is_department) return t.faculty_initials;
    return (r?.faculty_name ?? "")
      .split(", ")
      .map((n) => this.initialsOf.get(n.trim()))
      .filter((x): x is string => !!x);
  }

  sectionsOfSubject(subject: string) {
    return this.sectionsOf(subject);
  }

  timetableAt(room: string, slot: number) {
    return this.tt.get(key(room, slot));
  }

  /** A class is no longer in its own slots: its sections and faculty are free then. */
  vacate(a: Pick<Affected, "subject" | "slots" | "faculty">) {
    for (const s of a.slots) {
      for (const k of this.sectionsOf(a.subject)) this.sectionBusy.delete(`${k}|${s}`);
      for (const f of a.faculty) this.facultyBusy.delete(`${f}|${s}`);
    }
  }
}

export function makeSectionsOf(semesterSections: Record<string, string[]>) {
  return (subject: string): string[] =>
    classesOf(subject).flatMap((k) => (k.length === 1 ? (semesterSections[k]?.length ? semesterSections[k] : [k]) : [k]));
}

/** Why a class lost its room, most urgent first: an event or skill lab, then a CIE or SEE, then any other booking. */
export type Cause = "event" | "exam" | "booking";
export const CAUSE_ORDER: Record<Cause, number> = { event: 0, exam: 1, booking: 2 };
export const CAUSE_LABEL: Record<Cause, string> = { event: "Event", exam: "CIE / SEE", booking: "Booking" };

/** Sections named in a description, e.g. "Skill lab for 3B and 3D" gives ["3B", "3D"]. */
export const sectionsInText = (text: string | null | undefined) => [...new Set((text ?? "").match(/\b\d[A-Z]\b/g) ?? [])];

const isSkillLab = (title: string | null | undefined) => /skill\s*lab/i.test(title ?? "");

/** What a booking is, for Classes affected and Upcoming events. */
export function causeOf(r: Pick<ScheduleRow, "status" | "subject" | "reason">): Cause {
  if (r.status === "event" || isSkillLab(r.subject)) return "event";
  if (r.status === "cie") return "exam";
  // A booking for several sections at once (a skill lab or a workshop booked as a class), or an
  // approved event request (it names no class)
  if (r.status === "booked" && !movedFromRoom(r.reason) && (classesOf(r.subject ?? "").length > 1 || !classesOf(r.subject ?? "").length)) return "event";
  return "booking";
}

/**
 * Who is somewhere else in each slot of a day, so their own class is not affected when its room
 * is taken: the sections a booking is for (named in its name, e.g. "Skill Lab - 3B/3D", or, for an
 * event or skill lab, in its description), the sections whose classes were released for one ("3B at
 * Skill Lab"), and every section of a semester whose classes were cancelled for a CIE or SEE.
 */
export function attendance(day: Day, sectionsOf: (subject: string) => string[]) {
  const at = new Map<number, Set<string>>();
  const add = (slot: number, secs: string[]) => {
    const set = at.get(slot) ?? new Set<string>();
    for (const k of secs) set.add(k);
    at.set(slot, set);
  };
  const semesters = new Set<string>();
  for (const r of day.schedule) {
    if (["booked", "event", "event_request", "cie"].includes(r.status) && r.subject) {
      add(r.slot_id, sectionsOf(r.subject));
      if (!classesOf(r.subject).length && causeOf(r) === "event") add(r.slot_id, sectionsInText(r.reason));
    }
    if (r.status === "free" && r.reason) {
      // "Class dropped: 3B, 3D at Skill Lab"
      const released = /^Class dropped: ([\dA-Z,/ ]+) at /.exec(r.reason);
      if (released) add(r.slot_id, sectionsInText(released[1]));
      // "Class dropped: Cancelled for CIE: CIE-2, semester 3, 5"
      const exam = /^Class dropped: Cancelled for (?:CIE|SEE): .*semester ([\d, ]+)$/.exec(r.reason);
      if (exam) for (const x of exam[1].split(/[, ]+/)) if (x) semesters.add(x);
    }
  }
  /** Whether every section of a class is elsewhere in a slot (at an event, a skill lab, an exam or another class). */
  return (subject: string, slot: number) => {
    const secs = sectionsOf(subject);
    if (!secs.length) return false;
    if (secs.every((k) => semesters.has(k[0]))) return true;
    const here = at.get(slot);
    return !!here && secs.every((k) => here.has(k) || (k.length === 1 && [...here].some((x) => x[0] === k)));
  };
}

/**
 * The regular classes whose room is taken on a day (by an event, a skill lab, a CIE or SEE, or a
 * booking) and that have not been moved. A class is not affected when all its sections are
 * elsewhere then: at the event or skill lab that took the room, at another one, at a class booked
 * for them, or off for a CIE or SEE of their semester. A class whose room went to a class moved there
 * (its section is at a skill lab) is not affected either.
 */
export function affectedOn(state: DayState, day: Day, slots: Slot[], movedAway: (a: Affected) => boolean, started: (slot: number) => boolean): Affected[] {
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const out: Affected[] = [];
  const away = attendance(day, (x) => state.sectionsOfSubject(x));
  for (const c of [...day.timetable].sort((a, b) => a.room_id.localeCompare(b.room_id) || (order.get(a.slot_id) ?? 0) - (order.get(b.slot_id) ?? 0))) {
    if (c.is_department || started(c.slot_id) || !classesOf(c.subject).length) continue;
    const r = state.cell.get(key(c.room_id, c.slot_id));
    if (!r || !["booked", "event", "event_request", "cie"].includes(r.status)) continue;
    if (away(c.subject, c.slot_id)) continue; // its students are at the booking, another event or an exam
    if (r.status === "booked" && movedFromRoom(r.reason)) continue; // its room went to a moved class: its section was released
    const last = out[out.length - 1];
    const prev = last ? last.slots[last.slots.length - 1] : -1;
    if (last && last.room === c.room_id && last.subject === c.subject && last.takenBy === (r.subject ?? last.takenBy) && (order.get(prev) ?? -9) + 1 === order.get(c.slot_id)) {
      last.slots.push(c.slot_id);
      continue;
    }
    out.push({
      date: day.date,
      room: c.room_id,
      slots: [c.slot_id],
      subject: c.subject,
      faculty: c.faculty_initials,
      facultyName: r.original_faculty ?? null,
      takenBy: r.subject ?? (r.status === "event" ? "Event" : r.status === "cie" ? "CIE" : "Booking"),
      takenKind: r.status,
      cause: causeOf(r),
    });
  }
  // Moved the same day: a moved class names this room
  const movedHere = day.schedule.filter((x) => x.status === "booked" && movedFromRoom(x.reason));
  return out.filter((a) => !movedHere.some((m) => m.subject === a.subject && movedFromRoom(m.reason) === a.room) && !movedAway(a));
}

/** Events and skill labs first, then CIEs and SEEs, then other bookings; by day and time within each. */
export const byPriority = (slots: Slot[]) => {
  const order = new Map(slots.map((s, i) => [s.id, i]));
  return (x: Affected, y: Affected) =>
    CAUSE_ORDER[x.cause] - CAUSE_ORDER[y.cause] || x.date.localeCompare(y.date) || (order.get(x.slots[0]) ?? 0) - (order.get(y.slots[0]) ?? 0) || x.room.localeCompare(y.room);
};

/**
 * Where an affected class could go, best first: the same time in another room, then another time
 * that day (nearest first), then the next days. One room per time, at most `limit`; a practical gets
 * a lab and a classroom per time (the lab first), so it can be taught in a classroom when labs are full.
 */
export function suggest(
  a: Affected,
  states: DayState[],
  rooms: Room[],
  slots: Slot[],
  sectionsOf: (subject: string) => string[],
  started: (date: string, slot: number) => boolean,
  limit = 4,
): Suggestion[] {
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const from = rooms.find((r) => r.id === a.room);
  const lab = needsLab(a.subject);
  const n = a.slots.length;
  const out: Suggestion[] = [];
  const roomsFor = (st: DayState, ids: number[], classroom = false) =>
    rooms
      .filter((r) => (lab ? isLabRoom(r) !== classroom : true) && ids.every((s) => !st.roomBusy.has(key(r.id, s)) && !started(st.date, s)))
      .sort((x, y) => Number(isLabRoom(y) === isLabRoom(from)) - Number(isLabRoom(x) === isLabRoom(from)) || x.sort_order - y.sort_order);
  const peopleFree = (st: DayState, ids: number[]) => {
    const i = order.get(ids[0]) ?? 0;
    const j = order.get(ids[ids.length - 1]) ?? 0;
    const around = [slots[i - 1]?.id, ...ids, slots[j + 1]?.id].filter((x): x is number => x != null);
    return ids.every((s) => sectionsOf(a.subject).every((k) => !st.sectionBusy.has(`${k}|${s}`))) && around.every((s) => a.faculty.every((f) => !st.facultyBusy.has(`${f}|${s}`)));
  };
  for (const st of states) {
    if (st.date < a.date) continue;
    const sameDay = st.date === a.date;
    const runs: number[][] = [];
    for (let i = 0; i + n <= slots.length; i++) runs.push(slots.slice(i, i + n).map((s) => s.id));
    const start = order.get(a.slots[0]) ?? 0;
    runs.sort((x, y) => Math.abs((order.get(x[0]) ?? 0) - start) - Math.abs((order.get(y[0]) ?? 0) - start) || (order.get(x[0]) ?? 0) - (order.get(y[0]) ?? 0));
    for (const ids of runs) {
      const sameTime = sameDay && ids.join() === a.slots.join();
      if (!sameTime && !peopleFree(st, ids)) continue;
      if (sameDay && !sameTime && ids.some((s) => a.slots.includes(s))) continue;
      // A practical: a free lab, and a free classroom too, so it can move to a classroom if need be
      for (const classroom of lab ? [false, true] : [false]) {
        const room = roomsFor(st, ids, classroom)[0];
        if (!room) continue;
        out.push({ date: st.date, room: room.id, slots: ids, sameTime, sameDay, ...(classroom ? { classroom } : {}) });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** Whether a manual move clashes: the room busy, the class's sections busy, or its faculty busy then or just before or after. */
export function clashes(a: Affected, st: DayState, room: string, ids: number[], slots: Slot[], sectionsOf: (subject: string) => string[]): string[] {
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const out: string[] = [];
  if (ids.some((s) => st.roomBusy.has(key(room, s)))) out.push(`${room} is not free then`);
  const busySections = [...new Set(ids.flatMap((s) => sectionsOf(a.subject).filter((k) => st.sectionBusy.has(`${k}|${s}`))))];
  if (busySections.length) out.push(`${busySections.join(", ")} ${busySections.length === 1 ? "has" : "have"} another class then`);
  const i = order.get(ids[0]) ?? 0;
  const j = order.get(ids[ids.length - 1]) ?? 0;
  const around = [slots[i - 1]?.id, ...ids, slots[j + 1]?.id].filter((x): x is number => x != null);
  const busyFaculty = [...new Set(a.faculty.filter((f) => around.some((s) => st.facultyBusy.has(`${f}|${s}`))))];
  if (busyFaculty.length) out.push(`${busyFaculty.join(", ")} not free then or in the slot before or after`);
  return out;
}

/** Put a moved class in its new place: the room, its sections and its faculty are busy then. */
export function occupy(st: DayState, a: Pick<Affected, "subject" | "faculty">, room: string, ids: number[]) {
  for (const s of ids) {
    st.roomBusy.add(key(room, s));
    for (const k of st.sectionsOfSubject(a.subject)) st.sectionBusy.add(`${k}|${s}`);
    for (const f of a.faculty) st.facultyBusy.add(`${f}|${s}`);
  }
}

/**
 * A plan to move many affected classes at once, in order: each takes its best suggestion given the
 * moves before it, so no two classes get the same room, and no section or faculty member is in two
 * places. A class with no suggestion left stays (`to` null). Changes `states`.
 */
export function planBulk(
  rows: Affected[],
  states: DayState[],
  rooms: Room[],
  slots: Slot[],
  sectionsOf: (subject: string) => string[],
  started: (date: string, slot: number) => boolean,
): { a: Affected; to: Suggestion | null }[] {
  return rows.map((a) => {
    const home = states.find((st) => st.date === a.date);
    if (!home) return { a, to: null };
    const snapshot = { s: new Set(home.sectionBusy), f: new Set(home.facultyBusy) };
    home.vacate(a);
    const to = suggest(a, states, rooms, slots, sectionsOf, started, 1)[0] ?? null;
    if (to) {
      occupy(states.find((st) => st.date === to.date)!, a, to.room, to.slots);
    } else {
      home.sectionBusy.clear();
      snapshot.s.forEach((x) => home.sectionBusy.add(x));
      home.facultyBusy.clear();
      snapshot.f.forEach((x) => home.facultyBusy.add(x));
    }
    return { a, to };
  });
}

/** An event or skill lab on a day: what it is called, its sections, and the rooms and times it took. */
export type Taker = { date: string; title: string; label: string; sections: string[]; slots: number[]; rooms: string[]; kind: string };

export const takerLabel = (title: string) => (classesOf(title).length ? title.slice(0, title.lastIndexOf("-")).trim() : title.trim());

/**
 * The events and skill labs on a day that sections could attend: every event, every skill lab, and
 * every booking not for a class that took a class's room (except classes moved there), plus any
 * booking named in `tookClassRooms`.
 */
export function takersOn(day: Day, tookClassRooms: string[]): Taker[] {
  const tookFrom = new Set(tookClassRooms);
  const classAt = new Set(day.timetable.filter((c) => !c.is_department && classesOf(c.subject).length).map((c) => key(c.room_id, c.slot_id)));
  for (const r of day.schedule) if (r.subject && classAt.has(key(r.room_id, r.slot_id)) && !classesOf(r.subject).length) tookFrom.add(r.subject);
  const by = new Map<string, Taker>();
  for (const r of day.schedule) {
    if (!r.subject || !(r.status === "event" || r.status === "booked")) continue;
    if (movedFromRoom(r.reason)) continue;
    if (r.status === "booked" && !/skill\s*lab/i.test(r.subject) && !tookFrom.has(r.subject)) continue;
    const t = by.get(r.subject) ?? { date: day.date, title: r.subject, label: takerLabel(r.subject), sections: classesOf(r.subject), slots: [], rooms: [], kind: r.status };
    if (!t.slots.includes(r.slot_id)) t.slots.push(r.slot_id);
    if (!t.rooms.includes(r.room_id)) t.rooms.push(r.room_id);
    by.set(r.subject, t);
  }
  return [...by.values()];
}

/**
 * The classes to release when sections join an event or skill lab: in its times, every class all of
 * whose sections now attend it, unless the event itself is in that room. A class shared with a
 * section that does not attend keeps its room.
 */
export function releasesFor(day: Day, t: Taker, attending: string[], added: string[], sectionsOf: (subject: string) => string[]) {
  const status = new Map(day.schedule.map((r) => [key(r.room_id, r.slot_id), r]));
  const out: { room: string; slot: number; section: string }[] = [];
  for (const c of day.timetable) {
    if (c.is_department || !t.slots.includes(c.slot_id)) continue;
    const secs = sectionsOf(c.subject);
    if (!secs.length || !secs.every((k) => attending.includes(k)) || !secs.some((k) => added.includes(k))) continue;
    if (status.get(key(c.room_id, c.slot_id))?.status !== "class") continue;
    out.push({ room: c.room_id, slot: c.slot_id, section: secs.filter((k) => added.includes(k)).join("/") });
  }
  return out;
}

/** Sort sections "3B" < "3D" < "5A". */
export const bySection = (x: string, y: string) => x.localeCompare(y, "en", { numeric: true });

/** The key of an affected class in a form: day, room and first slot. */
export const rowKey = (a: Pick<Affected, "date" | "room" | "slots">) => `${a.date}|${a.room}|${a.slots[0]}`;
