import { createClient } from "./supabase/server";
import { addDays, mondayOf } from "./time";
import type { ScheduleRow, SlotStatus } from "./types";

/** What fills a slot, for counting: a regular class, a booking, or a CIE / event / department slot. */
export type UseKind = "class" | "booked" | "other";

const KIND: Partial<Record<SlotStatus, UseKind>> = { class: "class", department: "other", booked: "booked", cie: "other", event: "other" };

export type RoomUsage = { id: string; name: string; open: number; used: number; class: number; booked: number; other: number };

export type WeekUsage = {
  monday: string;
  days: { date: string; holiday?: string }[];
  rooms: RoomUsage[];
  /** slot id → [used, open] across rooms and days */
  bySlot: Map<number, [number, number]>;
  /** "date|slot" → [used, open] across rooms */
  byCell: Map<string, [number, number]>;
  slots: { id: number; label: string; starts: string }[];
  open: number;
  used: number;
};

/**
 * How busy each room is in the Monday-to-Saturday week of `date`: of the slots a room is open
 * (not Saturday after 2 PM, not a holiday), how many hold a class, a booking or a CIE/event.
 */
export async function getWeekUsage(date: string): Promise<WeekUsage> {
  const monday = mondayOf(date);
  const dates = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const supabase = await createClient();
  const [holRes, ...days] = await Promise.all([
    supabase.from("holidays").select("date, name").gte("date", dates[0]).lte("date", dates[5]),
    ...dates.map((d) => supabase.rpc("get_day_schedule", { p_date: d })),
  ]);
  const holidays = new Map(((holRes.data ?? []) as { date: string; name: string }[]).map((h) => [h.date, h.name]));
  const rooms = new Map<string, RoomUsage>();
  const bySlot = new Map<number, [number, number]>();
  const byCell = new Map<string, [number, number]>();
  const slots = new Map<number, { id: number; label: string; starts: string }>();
  const bump = <K,>(m: Map<K, [number, number]>, k: K, used: boolean) => {
    const v = m.get(k) ?? [0, 0];
    m.set(k, [v[0] + (used ? 1 : 0), v[1] + 1]);
  };
  dates.forEach((d, i) => {
    for (const r of (days[i].data ?? []) as ScheduleRow[]) {
      slots.set(r.slot_id, { id: r.slot_id, label: r.slot_label, starts: r.starts });
      const room = rooms.get(r.room_id) ?? { id: r.room_id, name: r.room_name, open: 0, used: 0, class: 0, booked: 0, other: 0 };
      rooms.set(r.room_id, room);
      // A holiday counts only what an admin booked on it; Saturday afternoon only when used
      const kind = KIND[r.status];
      if (r.status === "closed" || (holidays.has(d) && !kind)) continue;
      room.open++;
      bump(bySlot, r.slot_id, !!kind);
      bump(byCell, `${d}|${r.slot_id}`, !!kind);
      if (kind) {
        room.used++;
        room[kind]++;
      }
    }
  });
  const list = [...rooms.values()];
  return {
    monday,
    days: dates.map((d) => ({ date: d, holiday: holidays.get(d) })),
    rooms: list,
    bySlot,
    byCell,
    slots: [...slots.values()].sort((a, b) => a.starts.localeCompare(b.starts)),
    open: list.reduce((n, r) => n + r.open, 0),
    used: list.reduce((n, r) => n + r.used, 0),
  };
}

export const pct = (used: number, open: number) => (open ? Math.round((100 * used) / open) : 0);
