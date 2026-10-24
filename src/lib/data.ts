import { createClient } from "./supabase/server";
import type { Room, ScheduleRow, Slot } from "./types";

export async function getSlots(): Promise<Slot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("slots").select("*").order("starts");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ ...s, starts: s.starts.slice(0, 5), ends: s.ends.slice(0, 5) }));
}

export async function getRooms(): Promise<Room[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("rooms").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDaySchedule(date: string): Promise<ScheduleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_day_schedule", { p_date: date });
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduleRow[];
}
