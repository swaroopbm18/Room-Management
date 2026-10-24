import GetForm from "@/components/GetForm";
import PageHeader from "@/components/PageHeader";
import { getRooms, getSlots } from "@/lib/data";
import { groupRequests } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import type { AllotmentRow, RequestRow } from "@/lib/types";
import { addDays, DATE_RE, formatDate, formatDateTime, todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

const KIND: Record<AllotmentRow["kind"], string> = {
  class_request: "Class (approved request)",
  event_request: "Event (approved request)",
  cie: "CIE",
  event: "College event",
  drop: "Class dropped or removed",
  restore: "Restored to timetable",
};

const SHOW = {
  all: "Everything",
  approved: "Approved requests",
  rejected: "Rejected requests",
  allotted: "CIE and events allotted by admins",
  dropped: "Dropped or removed classes",
  restored: "Restored to timetable",
} as const;
type Show = keyof typeof SHOW;

const KINDS_FOR: Record<Exclude<Show, "all" | "rejected">, AllotmentRow["kind"][]> = {
  approved: ["class_request", "event_request"],
  allotted: ["cie", "event"],
  dropped: ["drop"],
  restored: ["restore"],
};

type Entry = { key: string; at: string; date: string; slot: string; room: string; change: string; sub?: string | null; faculty: string | null; description: string; by: string | null; rejected?: boolean };

export default async function History({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; room?: string; show?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : addDays(today, -30);
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : addDays(today, 28);
  const show: Show = sp.show && sp.show in SHOW ? (sp.show as Show) : "all";
  const supabase = await createClient();

  let changes = supabase.from("allotments").select("*").gte("date", from).lte("date", to).order("id", { ascending: false }).limit(1000);
  if (sp.room) changes = changes.eq("room_id", sp.room);
  if (show !== "all" && show !== "rejected") changes = changes.in("kind", KINDS_FOR[show]);
  let rejected = supabase.from("requests").select("*").eq("status", "rejected").gte("date", from).lte("date", to).order("decided_at", { ascending: false }).limit(1000);
  if (sp.room) rejected = rejected.eq("room_id", sp.room);

  const [slots, rooms, changeRes, rejectedRes] = await Promise.all([
    getSlots(),
    getRooms(),
    show === "rejected" ? Promise.resolve({ data: [] }) : changes,
    show === "all" || show === "rejected" ? rejected : Promise.resolve({ data: [] }),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const entries: Entry[] = [
    ...((changeRes.data ?? []) as AllotmentRow[]).map((a) => ({
      key: `a${a.id}`,
      at: a.created_at,
      date: a.date,
      slot: slotById.get(a.slot_id)?.label ?? "",
      room: a.room_id,
      change: KIND[a.kind],
      sub: a.title && !["Class", "Event"].includes(a.title) ? a.title : null,
      faculty: a.faculty_name,
      description: a.reason,
      by: a.created_by,
    })),
    ...groupRequests((rejectedRes.data ?? []) as RequestRow[], slotById).map((g) => ({
      key: `r${g.group_id}`,
      at: g.first.decided_at ?? g.first.created_at,
      date: g.first.date,
      slot: g.range,
      room: g.first.room_id,
      change: `${g.first.type === "event" ? "Event" : "Class"} request rejected`,
      sub: g.first.decision_note,
      faculty: g.first.requester_name,
      description: g.first.description,
      by: g.first.decided_by,
      rejected: true,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allotment history"
        subtitle="Every change to the timetable and every rejected request, newest first. This record is permanent: entries cannot be edited or deleted by anyone."
      />
      <GetForm className="card flex flex-wrap items-end gap-3 p-4" message="Loading history…">
        <div>
          <label className="label" htmlFor="show">Show</label>
          <select id="show" name="show" defaultValue={show} className="input w-auto">
            {Object.entries(SHOW).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="room">Room</label>
          <select id="room" name="room" defaultValue={sp.room ?? ""} className="input w-auto">
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" type="date" name="to" defaultValue={to} className="input" />
        </div>
        <button className="btn-primary">Filter</button>
        <span className="muted ml-auto self-center text-sm">{entries.length === 1 ? "1 entry" : `${entries.length} entries`}</span>
      </GetForm>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="thead-ink">
            <tr>
              <th className="th">Changed at</th>
              <th className="th">Date & slot</th>
              <th className="th">Room</th>
              <th className="th">Change</th>
              <th className="th">Faculty</th>
              <th className="th">Description</th>
              <th className="th">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
            {entries.length === 0 && (
              <tr>
                <td className="td muted" colSpan={7}>Nothing matches these filters.</td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.key}>
                <td className="td whitespace-nowrap">{formatDateTime(e.at)}</td>
                <td className="td whitespace-nowrap">
                  {formatDate(e.date)}
                  <div className="muted text-xs">{e.slot}</div>
                </td>
                <td className="td font-medium">{e.room}</td>
                <td className="td">
                  <span className={e.rejected ? "text-red-700 dark:text-red-400" : ""}>{e.change}</span>
                  {e.sub && <div className="muted text-xs">{e.sub}</div>}
                </td>
                <td className="td">{e.faculty}</td>
                <td className="td max-w-xs">{e.description}</td>
                <td className="td text-xs">{e.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
