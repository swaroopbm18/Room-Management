import { unstable_cache } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import type { PublicRequest, Room, ScheduleRow, Slot, UpcomingRow } from "./types";

// Rooms and slots are public and almost never change, so they are cached for an hour
// instead of being fetched on every page.
const publicClient = () => createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export const getSlots = unstable_cache(async (): Promise<Slot[]> => {
  const supabase = publicClient();
  const { data, error } = await supabase.from("slots").select("*").order("starts");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ ...s, starts: s.starts.slice(0, 5), ends: s.ends.slice(0, 5) }));
}, ["slots"], { revalidate: 3600 });

export const getRooms = unstable_cache(async (): Promise<Room[]> => {
  const supabase = publicClient();
  const { data, error } = await supabase.from("rooms").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}, ["rooms"], { revalidate: 3600 });

export async function getDaySchedule(date: string): Promise<ScheduleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_day_schedule", { p_date: date });
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduleRow[];
}

export type MyClass = Pick<ScheduleRow, "room_id" | "room_name" | "slot_id" | "slot_label" | "status" | "subject" | "ended"> & { date: string };

/**
 * The signed-in faculty member's classes and bookings from one date to another, in one call.
 * Before migration 0018 it falls back to one call per day.
 */
export async function getMySchedule(from: string, to: string, dates: string[]): Promise<MyClass[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_schedule", { p_from: from, p_to: to });
  if (!error) return (data ?? []) as MyClass[];
  const days = await Promise.all(dates.map(async (d) => ({ date: d, rows: await getDaySchedule(d) })));
  return days.flatMap(({ date, rows }) => rows.filter((r) => r.is_mine).map((r) => ({ ...r, date })));
}

/** Upcoming events and bookings, or null if they can't be read (e.g. before migration 0009 is run). */
export async function getUpcomingBookings(days: number): Promise<UpcomingRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upcoming_bookings", { p_days: days });
  return error ? null : ((data ?? []) as UpcomingRow[]);
}

/**
 * Requests for one room (or every room, with null) from one date to another, readable by anyone.
 * Null if they can't be read (e.g. before migration 0010 is run).
 */
export async function getSlotRequests(room: string | null, from: string, to: string): Promise<PublicRequest[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("slot_requests", { p_room: room, p_from: from, p_to: to });
  return error ? null : ((data ?? []) as PublicRequest[]);
}

export type FacultySlotStatus = {
  initials: string;
  name: string;
  cluster: "A" | "B" | null;
  slot_id: number;
  busy: boolean;
  activity: string | null;
  room_id: string | null;
};

/** Every faculty member, free or busy, in every slot of a date. Null before migration 0016 is run. */
export async function getFacultyStatus(date: string): Promise<FacultySlotStatus[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("faculty_status", { p_date: date });
  return error ? null : ((data ?? []) as FacultySlotStatus[]);
}

export type Holiday = { date: string; name: string };

/** Holidays from a week ago on (small list, read fresh so new holidays show at once). */
export async function getHolidays(): Promise<Map<string, string>> {
  const supabase = publicClient();
  const { data } = await supabase.from("holidays").select("date, name").gte("date", new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  return new Map(((data ?? []) as Holiday[]).map((h) => [h.date, h.name]));
}
