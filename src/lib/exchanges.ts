import { sameStudents, sectionOf } from "./clashes";
import { getFacultyStatus } from "./data";
import { createClient } from "./supabase/server";
import { addDays, slotStarted, todayIST } from "./time";
import type { Slot } from "./types";

/** A class exchange: one faculty member asks a free colleague to take one of their classes (migration 0029). */
export type ExchangeRow = {
  id: number;
  room_id: string;
  date: string;
  slot_id: number;
  subject: string | null;
  new_subject: string | null;
  requester_email: string;
  requester_name: string;
  requester_initials: string | null;
  target_initials: string;
  target_email: string;
  target_name: string;
  note: string;
  status: "pending" | "accepted" | "declined" | "approved" | "rejected" | "withdrawn";
  response_note: string | null;
  responded_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

/** Where an exchange stands, with "expired" for one still open when the class started. */
export type ExchangeStage = ExchangeRow["status"] | "expired";

export function stageOf(x: ExchangeRow, slotById: Map<number, Slot>): ExchangeStage {
  const slot = slotById.get(x.slot_id);
  if ((x.status === "pending" || x.status === "accepted") && slot && slotStarted(x.date, slot)) return "expired";
  return x.status;
}

/** Still waiting on someone: the colleague (pending) or an admin (accepted). */
export const isOpenStage = (s: ExchangeStage) => s === "pending" || s === "accepted";

/**
 * Exchanges the signed-in person asked for or was asked to take, newest class first, plus
 * whether the table exists yet (null before migration 0029).
 */
export async function getMyExchanges(email: string): Promise<{ sent: ExchangeRow[]; received: ExchangeRow[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_exchanges")
    .select("*")
    .or(`requester_email.eq."${email}",target_email.eq."${email}"`)
    .gte("date", addDays(todayIST(), -30))
    .order("date", { ascending: false })
    .order("slot_id", { ascending: false })
    .limit(100);
  if (error) return null;
  const rows = (data ?? []) as ExchangeRow[];
  return { sent: rows.filter((r) => r.requester_email === email), received: rows.filter((r) => r.target_email === email) };
}

export type Candidate = {
  initials: string;
  name: string;
  /** Their own subject for this class, e.g. MML-3A, when they teach it. */
  teaches?: string;
  /** Slots they are already busy that day. */
  load: number;
  cluster: "A" | "B" | null;
  /** On the sign-in list, so they can accept a request. */
  canAccept: boolean;
};

type TimetableCell = { room_id: string; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };

/**
 * Who could take a class: everyone free in that slot that day, split into those who teach the
 * same class (the students know them, and they can teach their own subject) and everyone else.
 * Each list is ordered by the lightest day first.
 */
export async function exchangeCandidates(date: string, slotId: number, subject: string | null, me: string | null) {
  const supabase = await createClient();
  const [status, all, signed] = await Promise.all([
    getFacultyStatus(date),
    supabase.rpc("get_timetable_all", { p_date: addDays(todayIST(), 1) }),
    supabase.rpc("signed_up_initials"),
  ]);
  const section = sectionOf(subject);
  const teaches = new Map<string, string[]>();
  for (const t of (all.data ?? []) as TimetableCell[]) {
    if (t.is_department) continue;
    for (const ini of t.faculty_initials) teaches.set(ini, [...(teaches.get(ini) ?? []), t.subject]);
  }
  // Before migration 0029 nobody can be told apart, so everyone is offered
  const accounts = signed.error ? null : new Set(((signed.data ?? []) as (string | { signed_up_initials: string })[]).map((x) => (typeof x === "string" ? x : x.signed_up_initials)));
  const load = new Map<string, number>();
  for (const f of status ?? []) if (f.busy) load.set(f.initials, (load.get(f.initials) ?? 0) + 1);

  const free: Candidate[] = (status ?? [])
    .filter((f) => f.slot_id === slotId && !f.busy && f.initials !== me)
    .map((f) => {
      const own = section ? (teaches.get(f.initials) ?? []).filter((s) => sectionOf(s) && sameStudents(sectionOf(s)!, section)) : [];
      // Prefer a theory class over a lab for the same students
      const pick = own.sort((a, b) => Number(/\(P\)/.test(a)) - Number(/\(P\)/.test(b)) || a.localeCompare(b))[0];
      return { initials: f.initials, name: f.name, teaches: pick, load: load.get(f.initials) ?? 0, cluster: f.cluster, canAccept: accounts ? accounts.has(f.initials) : true };
    })
    .sort((a, b) => Number(b.canAccept) - Number(a.canAccept) || a.load - b.load || a.name.localeCompare(b.name));
  return { section, sameClass: free.filter((c) => c.teaches), others: free.filter((c) => !c.teaches), ready: !!status };
}
