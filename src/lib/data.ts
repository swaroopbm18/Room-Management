import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { semestersOf, type Cell } from "./classTimetable";
import { setMakeupSundays } from "./time";
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

/** Every room, archived ones included (for history, usage and the Room details page). */
export const getAllRooms = unstable_cache(async (): Promise<Room[]> => {
  const supabase = publicClient();
  const { data, error } = await supabase.from("rooms").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}, ["rooms"], { revalidate: 3600, tags: ["rooms"] });

/**
 * The semesters and their classes (3rd: 3A 3B 3C) in the timetable on a date, for the class
 * pickers on the home page, CIE week and Class changes. Cached for 10 minutes, since timetable
 * edits only take effect from the next day.
 */
export const getClassSemesters = unstable_cache(async (date: string) => {
  const { data, error } = await publicClient().rpc("get_timetable_all", { p_date: date });
  if (error) throw new Error(error.message);
  return semestersOf([...new Set(((data ?? []) as Cell[]).filter((c) => !c.is_department).map((c) => c.subject))]).semesters;
}, ["class-semesters"], { revalidate: 600 });

/** The rooms in use: archived rooms are left out of booking and schedule pages. */
export async function getRooms(): Promise<Room[]> {
  return (await getAllRooms()).filter((r) => !r.archived);
}

export async function getDaySchedule(date: string): Promise<ScheduleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_day_schedule", { p_date: date });
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduleRow[];
}

export type MyClass = Pick<ScheduleRow, "room_id" | "room_name" | "slot_id" | "slot_label" | "status" | "subject" | "ended"> & { date: string };

/**
 * The signed-in faculty member's classes and bookings from one date to another, in one call.
 */
export async function getMySchedule(from: string, to: string): Promise<MyClass[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_schedule", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (data ?? []) as MyClass[];
}

/** Upcoming events and bookings, or null if they can't be read. */
export async function getUpcomingBookings(days: number): Promise<UpcomingRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upcoming_bookings", { p_days: days });
  return error ? null : ((data ?? []) as UpcomingRow[]);
}

/**
 * Requests for one room (or every room, with null) from one date to another, readable by anyone.
 * Null if they can't be read.
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

/** Every faculty member, free or busy, in every slot of a date. Null if it can't be read. */
export async function getFacultyStatus(date: string): Promise<FacultySlotStatus[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("faculty_status", { p_date: date });
  return error ? null : ((data ?? []) as FacultySlotStatus[]);
}

export type Holiday = { date: string; name: string };

/**
 * Holidays from a week ago on (small list, read fresh so new holidays show at once). Also loads
 * the make-up Sundays into lib/time, so isClosedSunday(), workingDay() and the date lists treat
 * them as working days on every page that reads holidays. Read once per request.
 */
export const getHolidays = cache(async (): Promise<Map<string, string>> => {
  const supabase = publicClient();
  const [{ data }, orders] = await Promise.all([supabase.from("holidays").select("date, name").gte("date", recent()), getDayOrders()]);
  setMakeupSundays([...orders.values()].map((o) => [o.date, o.follows]));
  return new Map(((data ?? []) as Holiday[]).map((h) => [h.date, h.name]));
});

/** Two weeks back, so last week's holidays and swaps still show. */
const recent = () => new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);

export type DayOrder = { date: string; follows: number; note: string };

/** Days that run another weekday's timetable, from a week ago on Read once per request. */
export const getDayOrders = cache(async (): Promise<Map<string, DayOrder>> => {
  const supabase = publicClient();
  const { data } = await supabase.from("day_orders").select("date, follows, note").gte("date", recent());
  return new Map(((data ?? []) as DayOrder[]).map((o) => [o.date, o]));
});

export type Notice = { id: number; message: string; starts_on: string; ends_on: string };

/** Notices that haven't ended yet, soonest first. */
export async function getNotices(from: string): Promise<Notice[]> {
  const supabase = publicClient();
  const { data } = await supabase.from("notices").select("id, message, starts_on, ends_on").gte("ends_on", from).order("starts_on");
  return (data ?? []) as Notice[];
}
