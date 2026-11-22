import { classesOf } from "./classTimetable";
import type { FacultySlotStatus } from "./data";
import type { Room, ScheduleRow, Slot } from "./types";

/**
 * Skill lab planner. For one day: the skill lab's sections leave their own classes (released, so
 * those rooms are free), the labs are booked, and every class of another section that loses its
 * lab is moved: to a free room at the same time (the released rooms first), else to a free time
 * the same day when the class, its faculty and a room are all free. Nothing is saved here.
 */

export type DayCell = { room_id: string; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };

export type Release = { room: string; date: string; slot: number; section: string; subject: string };
export type Move = {
  room: string;
  date: string;
  slots: number[];
  subject: string;
  faculty: string[];
  facultyName: string | null;
  from: string;
  fromSlots: number[];
  /** A released room (a skill lab section's own) */
  released: boolean;
  /** Another department's slot */
  department: boolean;
};
export type Unplaced = { date: string; room: string; slots: number[]; subject: string; facultyName: string | null; department: boolean };

export type DayPlan = {
  date: string;
  releases: Release[];
  moves: Move[];
  unplaced: Unplaced[];
  /** Events, CIEs and bookings in the labs that the skill lab overwrites */
  overwritten: string[];
  /** Classes shared with sections not at the skill lab, which stay */
  shared: string[];
  /** The skill lab's faculty busy elsewhere during it */
  facultyClashes: string[];
};

export type DayInput = {
  date: string;
  schedule: ScheduleRow[];
  timetable: DayCell[];
  status: FacultySlotStatus[];
  rooms: Room[];
  slots: Slot[];
  /** Sections at the skill lab, e.g. ["3B", "3D"] */
  sections: string[];
  /** Every section of each semester, e.g. { "3": ["3A", …, "3G"] } */
  semesterSections: Record<string, string[]>;
  labs: string[];
  slotIds: number[];
  /** The skill lab's faculty (initials) */
  faculty: string[];
  /** Slots that have started (today) and can't change */
  started: (slotId: number) => boolean;
};

export const isLabRoom = (r: Room | undefined) => !!r && (r.kind === "lab" || /\bLAB\b/i.test(r.id) || /\bLAB\b/i.test(r.name));
/** A practical or a skill lab: it needs a lab. */
export const needsLab = (subject: string) => /\(P\)|\bLAB\b/i.test(subject);

const key = (room: string, slot: number) => `${room}|${slot}`;

export function planSkillLabDay(inp: DayInput): DayPlan {
  const { date, schedule, timetable, status, rooms, slots, sections, semesterSections, labs, slotIds, faculty, started } = inp;
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const label = (ids: number[]) => {
    const a = slots.find((s) => s.id === ids[0]);
    const b = slots.find((s) => s.id === ids[ids.length - 1]);
    return a && b ? `${a.label.split(" – ")[0]} – ${b.label.split(" – ")[1] ?? ""}`.trim() : "";
  };
  const chosen = new Set(sections.map((s) => s.toUpperCase()));
  const labSet = new Set(labs);
  const inLab = new Set(slotIds);
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const cellAt = new Map(schedule.map((r) => [key(r.room_id, r.slot_id), r]));
  const ttAt = new Map(timetable.map((c) => [key(c.room_id, c.slot_id), c]));
  const sectionsOfSem = (sem: string) => semesterSections[sem] ?? [];

  // Every section a subject is taught to ("KDD-5" is every section of semester 5)
  const sectionsOf = (subject: string): string[] => classesOf(subject).flatMap((k) => (k.length === 1 ? (sectionsOfSem(k).length ? sectionsOfSem(k) : [k]) : [k]));
  const covers = (subject: string) => {
    const s = sectionsOf(subject);
    return s.length > 0 && s.every((k) => chosen.has(k));
  };
  const touches = (subject: string) => sectionsOf(subject).some((k) => chosen.has(k));
  const isClass = (r: ScheduleRow | undefined) => !!r && (r.status === "class" || (r.status === "booked" && classesOf(r.subject ?? "").length > 0));

  const plan: DayPlan = { date, releases: [], moves: [], unplaced: [], overwritten: [], shared: [], facultyClashes: [] };

  // Who is busy when: rooms, sections and faculty, as the day stands
  const roomBusy = new Set<string>();
  for (const r of schedule) if (r.status !== "free") roomBusy.add(key(r.room_id, r.slot_id));
  const sectionBusy = new Set<string>();
  const markSections = (subject: string, slot: number, on = true) => {
    for (const k of sectionsOf(subject)) {
      if (on) sectionBusy.add(`${k}|${slot}`);
      else sectionBusy.delete(`${k}|${slot}`);
    }
  };
  for (const r of schedule) if (isClass(r) && r.subject) markSections(r.subject, r.slot_id);
  const facultyBusy = new Set<string>();
  const nameOf = new Map<string, string>();
  const initialsOf = new Map<string, string>();
  for (const f of status) {
    nameOf.set(f.initials, f.name);
    initialsOf.set(f.name, f.initials);
    if (f.busy) facultyBusy.add(`${f.initials}|${f.slot_id}`);
  }
  const facultyFor = (r: ScheduleRow): string[] => {
    const tt = ttAt.get(key(r.room_id, r.slot_id));
    if (r.status === "class" && tt) return tt.faculty_initials;
    return (r.faculty_name ?? "")
      .split(", ")
      .map((n) => initialsOf.get(n.trim()))
      .filter((x): x is string => !!x);
  };

  // 1. The sections' own classes are released
  for (const slot of slotIds) {
    if (started(slot)) continue;
    for (const r of schedule.filter((x) => x.slot_id === slot)) {
      if (!isClass(r) || !r.subject) continue;
      if (covers(r.subject)) {
        markSections(r.subject, slot, false);
        // Its faculty are free, unless they have something else then
        for (const ini of facultyFor(r)) {
          const st = status.find((f) => f.initials === ini && f.slot_id === slot);
          if (!st?.activity || st.activity === r.subject) facultyBusy.delete(`${ini}|${slot}`);
        }
        if (labSet.has(r.room_id)) continue; // the skill lab takes this room anyway
        plan.releases.push({ room: r.room_id, date, slot, section: sectionsOf(r.subject).filter((k) => chosen.has(k)).join(", "), subject: r.subject });
        roomBusy.delete(key(r.room_id, slot));
      } else if (touches(r.subject)) {
        plan.shared.push(`${r.subject} in ${r.room_id} at ${label([slot])}: shared with sections not at the skill lab, so it stays`);
      }
    }
    // The sections are at the skill lab
    for (const k of chosen) sectionBusy.add(`${k}|${slot}`);
  }
  const released = new Set(plan.releases.map((r) => key(r.room, r.slot)));

  // 2. The skill lab's faculty
  for (const ini of faculty) {
    for (const slot of slotIds) {
      if (facultyBusy.has(`${ini}|${slot}`)) {
        const st = status.find((f) => f.initials === ini && f.slot_id === slot);
        plan.facultyClashes.push(`${nameOf.get(ini) ?? ini} has ${st?.activity ?? "something else"}${st?.room_id ? ` in ${st.room_id}` : ""} at ${label([slot])}`);
      }
      facultyBusy.add(`${ini}|${slot}`);
    }
  }

  // 3. What the labs had: classes of other sections to move, anything else overwritten
  type Displaced = { room: string; subject: string; slots: number[]; faculty: string[]; facultyName: string | null; department: boolean };
  const displaced: Displaced[] = [];
  for (const room of labs) {
    for (const slot of slotIds) {
      if (started(slot)) continue;
      const r = cellAt.get(key(room, slot));
      roomBusy.add(key(room, slot));
      if (!r || r.status === "free" || r.status === "closed") continue;
      if (isClass(r) && r.subject && covers(r.subject)) continue; // released above
      if (isClass(r) || r.status === "department") {
        const dept = r.status === "department";
        const subject = dept ? `${r.subject ?? "Other"} department` : (r.subject ?? "Class");
        const last = displaced[displaced.length - 1];
        const prev = last ? last.slots[last.slots.length - 1] : -1;
        if (last && last.room === room && last.subject === subject && (order.get(prev) ?? -9) + 1 === order.get(slot)) last.slots.push(slot);
        else displaced.push({ room, subject, slots: [slot], faculty: dept ? [] : facultyFor(r), facultyName: dept ? null : r.faculty_name, department: dept });
      } else {
        plan.overwritten.push(`${room} at ${label([slot])}: ${r.subject ?? r.status}${r.faculty_name ? ` (${r.faculty_name})` : ""}`);
      }
    }
  }

  // 4. Move each: practicals to a lab where one is free, else a classroom; the released rooms first, then the same kind of room
  const roomFree = (room: string, ids: number[]) => ids.every((s) => !roomBusy.has(key(room, s)) && !started(s) && cellAt.get(key(room, s))?.status !== "closed");
  // A practical can go to a classroom too when no lab is free (`classroom`), after the theory classes
  const candidates = (d: Displaced, ids: number[], classroom = false) => {
    const from = roomById.get(d.room);
    const lab = needsLab(d.subject) && !d.department;
    return rooms
      .filter((r) => !labSet.has(r.id) || !ids.some((s) => inLab.has(s)))
      .filter((r) => (lab ? isLabRoom(r) || classroom : true) && roomFree(r.id, ids))
      .map((r) => ({
        r,
        score:
          (ids.every((s) => released.has(key(r.id, s))) ? 8 : 0) +
          (isLabRoom(r) === isLabRoom(from) || (!lab && !isLabRoom(r)) ? 2 : 0) +
          (from?.capacity && r.capacity && r.capacity >= from.capacity ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.r.sort_order - b.r.sort_order)
      .map((x) => x.r);
  };
  // At a new time, the class's sections must be free, and its faculty free then and in the slot
  // just before and just after it, so nobody teaches three in a row because of the move
  const peopleFree = (d: Displaced, ids: number[]) => {
    if (d.department) return true;
    const i = order.get(ids[0]) ?? 0;
    const j = order.get(ids[ids.length - 1]) ?? 0;
    const around = [slots[i - 1]?.id, ...ids, slots[j + 1]?.id].filter((x): x is number => x != null);
    return ids.every((s) => sectionsOf(d.subject).every((k) => !sectionBusy.has(`${k}|${s}`))) && around.every((s) => d.faculty.every((f) => !facultyBusy.has(`${f}|${s}`)));
  };
  const take = (d: Displaced, room: Room, ids: number[]) => {
    for (const s of ids) {
      roomBusy.add(key(room.id, s));
      if (!d.department) {
        markSections(d.subject, s);
        for (const f of d.faculty) facultyBusy.add(`${f}|${s}`);
      }
    }
    plan.moves.push({
      room: room.id,
      date,
      slots: ids,
      subject: d.subject,
      faculty: d.faculty,
      facultyName: d.facultyName,
      from: d.room,
      fromSlots: d.slots,
      released: ids.every((s) => released.has(key(room.id, s))),
      department: d.department,
    });
  };

  // Labs first (fewer rooms fit them), longer classes first
  displaced.sort((a, b) => Number(needsLab(b.subject)) - Number(needsLab(a.subject)) || b.slots.length - a.slots.length);
  // The classes leave their own slots: their sections and faculty are free then, for another time
  for (const d of displaced) {
    if (d.department) continue;
    for (const s of d.slots) {
      markSections(d.subject, s, false);
      for (const f of d.faculty) facultyBusy.delete(`${f}|${s}`);
    }
  }
  // a) Same time, another room, for every class first: keeping the time matters most
  const waiting: Displaced[] = [];
  for (const d of displaced) {
    const same = candidates(d, d.slots)[0];
    if (same) take(d, same, d.slots);
    else waiting.push(d);
  }
  // A practical with no lab free then keeps its time in a classroom, once the theory classes have rooms
  const later: Displaced[] = [];
  for (const d of waiting) {
    const room = needsLab(d.subject) && !d.department ? candidates(d, d.slots, true)[0] : undefined;
    if (room) take(d, room, d.slots);
    else later.push(d);
  }
  // b) Another time the same day, nearest first (not another department's class)
  for (const d of later) {
    let placed = false;
    if (!d.department) {
      const n = d.slots.length;
      const start = order.get(d.slots[0]) ?? 0;
      const runs: number[][] = [];
      for (let i = 0; i + n <= slots.length; i++) {
        const ids = slots.slice(i, i + n).map((s) => s.id);
        if (ids.some((s) => d.slots.includes(s))) continue;
        runs.push(ids);
      }
      runs.sort((a, b) => Math.abs((order.get(a[0]) ?? 0) - start) - Math.abs((order.get(b[0]) ?? 0) - start) || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0));
      // A lab first; a practical goes to a classroom only when no lab is free at any of these times
      for (const classroom of needsLab(d.subject) ? [false, true] : [false]) {
        for (const ids of runs) {
          if (!peopleFree(d, ids)) continue;
          const room = candidates(d, ids, classroom)[0];
          if (room) {
            take(d, room, ids);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }
    if (!placed) plan.unplaced.push({ date, room: d.room, slots: d.slots, subject: d.subject, facultyName: d.facultyName, department: d.department });
  }
  plan.moves.sort((a, b) => (order.get(a.fromSlots[0]) ?? 0) - (order.get(b.fromSlots[0]) ?? 0) || a.from.localeCompare(b.from));
  return plan;
}

/** "MEL-LAB-02, 8:00 AM – 9:50 AM" for a move to another time, "MEL-LAB-02" for the same time. */
export function movedFrom(m: Pick<Move, "from" | "slots" | "fromSlots">, slots: Slot[]): string {
  if (m.slots.join() === m.fromSlots.join()) return m.from;
  const a = slots.find((s) => s.id === m.fromSlots[0]);
  const b = slots.find((s) => s.id === m.fromSlots[m.fromSlots.length - 1]);
  return a && b ? `${m.from}, ${a.label.split(" – ")[0]} – ${b.label.split(" – ")[1]}` : m.from;
}

/** The skill lab's name with its sections, so each section's timetable lists it: "Skill Lab - 3B/3D". */
export function skillLabTitle(title: string, sections: string[]): string {
  const base = (title.trim() || "Skill Lab").replace(/\s*-\s*\d[\dA-Z/,& ]*$/i, "");
  return sections.length ? `${base} - ${sections.join("/")}` : base;
}
