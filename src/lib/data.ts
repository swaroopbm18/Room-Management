import { unstable_cache } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import type { Room, ScheduleRow, Slot } from "./types";

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

export type Holiday = { date: string; name: string };

/** Holidays from a week ago on (small list, read fresh so new holidays show at once). */
export async function getHolidays(): Promise<Map<string, string>> {
  const supabase = publicClient();
  const { data } = await supabase.from("holidays").select("date, name").gte("date", new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  return new Map(((data ?? []) as Holiday[]).map((h) => [h.date, h.name]));
}
