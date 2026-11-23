import type { FacultySlotStatus } from "../data";
import type { Room, ScheduleRow, Slot } from "../types";

/** A small day: four slots, a few rooms, and helpers to build schedule rows. */
export const SLOTS: Slot[] = [
  { id: 1, starts: "08:00", ends: "08:55", label: "8:00 AM – 8:55 AM" },
  { id: 2, starts: "08:55", ends: "09:50", label: "8:55 AM – 9:50 AM" },
  { id: 3, starts: "10:10", ends: "11:05", label: "10:10 AM – 11:05 AM" },
  { id: 4, starts: "11:05", ends: "12:00", label: "11:05 AM – 12:00 PM" },
];

export const ROOMS: Room[] = [
  { id: "LAB-1", name: "LAB-1", sort_order: 1, kind: "lab" },
  { id: "LAB-2", name: "LAB-2", sort_order: 2, kind: "lab" },
  { id: "CR-1", name: "CR-1", sort_order: 3, kind: "classroom" },
  { id: "CR-2", name: "CR-2", sort_order: 4, kind: "classroom" },
];

export const DATE = "2026-11-24"; // a Tuesday

export function row(room: string, slot: number, status: ScheduleRow["status"], subject: string | null = null, extra: Partial<ScheduleRow> = {}): ScheduleRow {
  const s = SLOTS.find((x) => x.id === slot)!;
  return {
    room_id: room,
    room_name: room,
    slot_id: slot,
    slot_label: s.label,
    starts: s.starts,
    ends: s.ends,
    status,
    subject,
    faculty_name: null,
    reason: null,
    is_mine: false,
    ended: false,
    ...extra,
  };
}

/** Every room free in every slot, with `over` rows replacing the matching ones. */
export function day(over: ScheduleRow[]): ScheduleRow[] {
  const at = new Map(over.map((r) => [`${r.room_id}|${r.slot_id}`, r]));
  return ROOMS.flatMap((r) => SLOTS.map((s) => at.get(`${r.id}|${s.id}`) ?? row(r.id, s.id, "free")));
}

export function free(initials: string[], busy: [string, number][] = []): FacultySlotStatus[] {
  return initials.flatMap((i) => SLOTS.map((s) => ({ initials: i, name: `Prof ${i}`, slot_id: s.id, busy: busy.some(([b, id]) => b === i && id === s.id), cluster: null, activity: null, room_id: null })));
}
