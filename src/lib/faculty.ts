import { createClient } from "./supabase/server";
import { displayName } from "./auth";
import { addDays, todayIST } from "./time";
import type { Person } from "./types";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The department's two groups of faculty, each under its own HoD. */
export const CLUSTERS = {
  A: { label: "Cluster A" },
  B: { label: "Cluster B" },
} as const;
export type ClusterKey = keyof typeof CLUSTERS;

/** The teaching day, 8:00 to 4:45 (Saturday ends at 2:00). */
export const DAY_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Saturday classes end at 2 PM: slot 7 (2:00 PM) onwards is never a free slot that day. */
export const SATURDAY_LAST_SLOT = 6;

/** Whether the slot runs at all on that weekday (Monday = 1 … Saturday = 6). */
export const isOpen = (weekday: number, slotId: number) => weekday !== 6 || slotId <= SATURDAY_LAST_SLOT;

export type FacultyMember = { initials: string; name: string; email?: string; cluster?: ClusterKey };

/** What keeps a faculty member busy in one slot of the week. */
export type Busy = { activity: string; room?: string; source: "timetable" | "duty" };

/** initials → "weekday|slot" → what they have then */
export type Weeks = Map<string, Map<string, Busy[]>>;

export const cellKey = (weekday: number, slotId: number) => `${weekday}|${slotId}`;

type TimetableCell = { room_id: string; weekday: number; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };
type Duty = { initials: string; weekday: number; slot_id: number; activity: string };

/**
 * Every faculty member and their week: the classes in the timetable that applies from
 * tomorrow (so a Word upload shows at once), plus the duties admins added.
 */
export async function getFacultyWeeks(): Promise<{ faculty: FacultyMember[]; weeks: Weeks; dutiesReady: boolean; clustersReady: boolean }> {
  const supabase = await createClient();
  const [peopleRes, dirRes, ttRes, dutyRes, clusterRes] = await Promise.all([
    supabase.from("people").select("*").not("initials", "is", null),
    supabase.from("faculty_directory").select("initials, title, full_name"),
    supabase.rpc("get_timetable_all", { p_date: addDays(todayIST(), 1) }),
    supabase.from("faculty_duties").select("initials, weekday, slot_id, activity"),
    supabase.from("faculty_clusters").select("initials, cluster"),
  ]);

  const names = new Map<string, FacultyMember>();
  for (const d of (dirRes.data ?? []) as { initials: string; title: string; full_name: string }[]) {
    // A directory entry with no name yet shows its initials
    names.set(d.initials, { initials: d.initials, name: d.full_name.trim() ? `${d.title} ${d.full_name}`.trim() : d.initials });
  }
  // A person on the list takes over the directory name for their initials
  for (const p of (peopleRes.data ?? []) as Person[]) {
    if (p.initials) names.set(p.initials, { initials: p.initials, name: displayName(p), email: p.email });
  }

  const weeks: Weeks = new Map();
  const add = (ini: string, weekday: number, slotId: number, b: Busy) => {
    if (!weeks.has(ini)) weeks.set(ini, new Map());
    const w = weeks.get(ini)!;
    const k = cellKey(weekday, slotId);
    w.set(k, [...(w.get(k) ?? []), b]);
  };
  for (const t of (ttRes.data ?? []) as TimetableCell[]) {
    if (t.is_department) continue;
    for (const ini of t.faculty_initials) add(ini, t.weekday, t.slot_id, { activity: t.subject, room: t.room_id, source: "timetable" });
  }
  for (const d of (dutyRes.data ?? []) as Duty[]) add(d.initials, d.weekday, d.slot_id, { activity: d.activity, source: "duty" });

  // Initials in the timetable that aren't in the directory still get a card
  for (const ini of weeks.keys()) if (!names.has(ini)) names.set(ini, { initials: ini, name: ini });

  const clusterOf = new Map(((clusterRes.data ?? []) as { initials: string; cluster: ClusterKey }[]).map((c) => [c.initials, c.cluster]));
  for (const f of names.values()) f.cluster = clusterOf.get(f.initials);

  // By name without the title; initials with no known name go last
  const unnamed = (f: FacultyMember) => (f.name === f.initials ? 1 : 0);
  const bare = (f: FacultyMember) => f.name.replace(/^(Dr|Prof)\.\s*/, "");
  const faculty = [...names.values()].sort((a, b) => unnamed(a) - unnamed(b) || bare(a).localeCompare(bare(b)));
  return { faculty, weeks, dutiesReady: !dutyRes.error, clustersReady: !clusterRes.error };
}

/** One faculty member's week from tomorrow: their classes and the duties they can read. */
export async function getWeekFor(initials: string): Promise<Map<string, Busy[]>> {
  const supabase = await createClient();
  const [ttRes, dutyRes] = await Promise.all([
    supabase.rpc("get_timetable_all", { p_date: addDays(todayIST(), 1) }),
    supabase.from("faculty_duties").select("weekday, slot_id, activity").eq("initials", initials),
  ]);
  const week = new Map<string, Busy[]>();
  const add = (weekday: number, slotId: number, b: Busy) => week.set(cellKey(weekday, slotId), [...(week.get(cellKey(weekday, slotId)) ?? []), b]);
  for (const t of (ttRes.data ?? []) as TimetableCell[]) {
    if (!t.is_department && t.faculty_initials.includes(initials)) add(t.weekday, t.slot_id, { activity: t.subject, room: t.room_id, source: "timetable" });
  }
  for (const d of (dutyRes.data ?? []) as Omit<Duty, "initials">[]) add(d.weekday, d.slot_id, { activity: d.activity, source: "duty" });
  return week;
}

export function isFree(weeks: Weeks, initials: string, weekday: number, slotId: number): boolean {
  return isOpen(weekday, slotId) && !weeks.get(initials)?.get(cellKey(weekday, slotId))?.length;
}
