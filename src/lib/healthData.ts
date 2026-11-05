import { type Cell } from "./classTimetable";
import { getSlots } from "./data";
import { checkTimetable } from "./health";
import { createClient } from "./supabase/server";
import { addDays, todayIST } from "./time";

/** The timetable from tomorrow, run through the health check. Admins only. */
export async function loadHealth() {
  const tomorrow = addDays(todayIST(), 1);
  const supabase = await createClient();
  const [slots, ttRes, dirRes, peopleRes, dutyRes] = await Promise.all([
    getSlots(),
    supabase.rpc("get_timetable_all", { p_date: tomorrow }),
    supabase.from("faculty_directory").select("initials, title, full_name"),
    supabase.from("people").select("initials, title, full_name").not("initials", "is", null),
    supabase.from("faculty_duties").select("initials, weekday, slot_id, activity"),
  ]);
  const names: Record<string, string> = {};
  for (const p of [...(dirRes.data ?? []), ...(peopleRes.data ?? [])] as { initials: string; title: string | null; full_name: string }[]) {
    names[p.initials] = p.full_name.trim() ? `${p.title ? p.title + " " : ""}${p.full_name}` : (names[p.initials] ?? p.initials);
  }
  const cells = (ttRes.data ?? []) as Cell[];
  const problems = checkTimetable(cells, slots, names, (dutyRes.data ?? []) as { initials: string; weekday: number; slot_id: number; activity: string }[]);
  return { tomorrow, slots, cells, names, problems };
}
