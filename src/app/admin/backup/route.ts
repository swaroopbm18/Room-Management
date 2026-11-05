import { getPerson } from "@/lib/auth";
import { getSlots } from "@/lib/data";
import { DAY_NAMES } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIST } from "@/lib/time";
import { buildWorkbook, type Cell, type Sheet } from "@/lib/xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, unknown>;
type Client = Awaited<ReturnType<typeof createClient>>;

/** Every row of a table, 1000 at a time (the API's page size). Missing tables give []. */
async function all(supabase: Client, table: string, order: string, ascending = true, cap = 50000): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").order(order, { ascending }).range(from, from + 999);
    if (error || !data?.length) break;
    out.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

const v = (x: unknown): Cell => (x == null ? "" : typeof x === "number" ? x : typeof x === "boolean" ? (x ? "Yes" : "No") : Array.isArray(x) ? x.join(", ") : typeof x === "object" ? JSON.stringify(x) : String(x));
const time = (ts: unknown) => (ts ? new Date(String(ts)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "");
/** A sheet from rows, with the given columns: [header, key or a function of the row]. */
const sheet = (name: string, rows: Row[], cols: [string, string | ((r: Row) => unknown), number?][]): Sheet => ({
  name,
  rows: [cols.map(([h]) => h), ...rows.map((r) => cols.map(([, k]) => v(typeof k === "function" ? k(r) : r[k])))],
  widths: cols.map(([, , w]) => w ?? 16),
});

/** Everything on the site in one Excel workbook, for admins: a copy to keep, e.g. at the end of a semester. */
export async function GET() {
  const person = await getPerson().catch(() => null);
  if (person?.role !== "admin") return new Response("Admins only", { status: 403 });
  const supabase = await createClient();
  const tomorrow = addDays(todayIST(), 1);
  const [slots, tt, rooms, people, directory, clusters, duties, subjects, requests, allotments, holidays, notices, swaps, leave, equipment, eqBookings, activity] = await Promise.all([
    getSlots(),
    supabase.rpc("get_timetable_all", { p_date: tomorrow }),
    all(supabase, "rooms", "sort_order"),
    all(supabase, "people", "email"),
    all(supabase, "faculty_directory", "initials"),
    all(supabase, "faculty_clusters", "initials"),
    all(supabase, "faculty_duties", "initials"),
    all(supabase, "faculty_subjects", "email"),
    all(supabase, "requests", "created_at"),
    all(supabase, "allotments", "id"),
    all(supabase, "holidays", "date"),
    all(supabase, "notices", "starts_on"),
    all(supabase, "day_orders", "date"),
    all(supabase, "faculty_leave", "starts_on"),
    all(supabase, "equipment", "name"),
    all(supabase, "equipment_bookings", "id"),
    all(supabase, "activity_log", "id", false, 20000),
  ]);
  const slot = new Map(slots.map((s) => [s.id, s.label]));
  const day = (w: unknown) => DAY_NAMES[Number(w) - 1] ?? "";
  const eqName = new Map(equipment.map((e) => [e.id, e.name]));
  const timetable = ((tt.data ?? []) as Row[]).sort(
    (a, b) => String(a.room_id).localeCompare(String(b.room_id)) || Number(a.weekday) - Number(b.weekday) || Number(a.slot_id) - Number(b.slot_id),
  );

  const sheets: Sheet[] = [
    sheet(`Timetable from ${tomorrow}`, timetable, [["Room", "room_id", 14], ["Day", (r) => day(r.weekday), 12], ["Time", (r) => slot.get(Number(r.slot_id)), 22], ["Subject", "subject", 22], ["Faculty initials", "faculty_initials", 18], ["Department slot", "is_department", 10]]),
    sheet("Rooms", rooms, [["Room", "id", 14], ["Seats", "capacity", 8], ["Kind", "kind", 12], ["Projector", "projector", 10], ["Notes", "notes", 30]]),
    sheet("Sign-in list", people, [["Email", "email", 30], ["Name", "full_name", 26], ["Title", "title", 8], ["Initials", "initials", 10], ["Role", "role", 10], ["Can sign in", "active", 10], ["Added", (r) => time(r.created_at), 20]]),
    sheet("Faculty names", directory, [["Initials", "initials", 10], ["Title", "title", 8], ["Full name", "full_name", 28], ["Cluster", (r) => clusters.find((c) => c.initials === r.initials)?.cluster, 9]]),
    sheet("Other duties", duties, [["Initials", "initials", 10], ["Day", (r) => day(r.weekday), 12], ["Time", (r) => slot.get(Number(r.slot_id)), 22], ["Duty", "activity", 26], ["Set by", "updated_by", 26]]),
    sheet("Subjects", subjects, [["Email", "email", 30], ["Subject", "subject", 18], ["From", "source", 10], ["Added by", "created_by", 26]]),
    sheet("Requests", requests, [["Date", "date", 12], ["Time", (r) => slot.get(Number(r.slot_id)), 22], ["Room", "room_id", 12], ["Requested by", "requester_name", 24], ["Email", "requester_email", 28], ["Type", "type", 8], ["Subject", "subject", 14], ["Description", "description", 40], ["Status", "status", 10], ["Decided by", "decided_by", 26], ["Decided", (r) => time(r.decided_at), 20], ["Note", "decision_note", 30], ["Sent", (r) => time(r.created_at), 20]]),
    sheet("Bookings & changes", allotments, [["Date", "date", 12], ["Time", (r) => slot.get(Number(r.slot_id)), 22], ["Room", "room_id", 12], ["Kind", "kind", 14], ["Title", "title", 24], ["Faculty", "faculty_name", 24], ["Reason", "reason", 36], ["By", "created_by", 26], ["When", (r) => time(r.created_at), 20]]),
    sheet("Holidays", holidays, [["Date", "date", 12], ["Holiday", "name", 30], ["Added by", "created_by", 26]]),
    sheet("Day swaps", swaps, [["Date", "date", 12], ["Follows", (r) => day(r.follows), 12], ["Note", "note", 30]]),
    sheet("Notices", notices, [["From", "starts_on", 12], ["To", "ends_on", 12], ["Message", "message", 60], ["By", "created_by", 26]]),
    sheet("Leave", leave, [["Initials", "initials", 10], ["From", "starts_on", 12], ["To", "ends_on", 12], ["Reason", "reason", 30], ["Added by", "created_by", 26]]),
    sheet("Equipment bookings", eqBookings, [["Equipment", (r) => eqName.get(r.equipment_id), 22], ["Date", "date", 12], ["Time", (r) => slot.get(Number(r.slot_id)), 22], ["Room", "room_id", 12], ["Booked by", "booked_name", 24], ["Purpose", "purpose", 30], ["Cancelled", (r) => time(r.cancelled_at), 20]]),
    sheet("Activity log", activity, [["When", (r) => time(r.at), 20], ["Who", "actor", 28], ["Table", "tbl", 18], ["Change", "op", 9], ["Before", "old", 60], ["After", "new", 60]]),
  ];
  return new Response(Buffer.from(buildWorkbook(sheets)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="room-management-backup-${todayIST()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
