import PageHeader from "@/components/PageHeader";
import { getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { AllotmentRow } from "@/lib/types";
import { addDays, DATE_RE, formatDate, formatDateTime, todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

const KIND: Record<AllotmentRow["kind"], string> = {
  class_request: "Class (approved request)",
  event_request: "Event (approved request)",
  cie: "CIE",
  event: "College event",
  drop: "Class dropped",
  restore: "Restored to timetable",
};

export default async function History({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; room?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : addDays(today, -30);
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : addDays(today, 28);
  const supabase = await createClient();
  let q = supabase.from("allotments").select("*").gte("date", from).lte("date", to).order("id", { ascending: false }).limit(1000);
  if (sp.room) q = q.eq("room_id", sp.room);
  const [slots, { data }] = await Promise.all([getSlots(), q]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const rows = (data ?? []) as AllotmentRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allotment history"
        subtitle="Every change to the timetable, newest first. This record is permanent: entries cannot be edited or deleted by anyone."
      />
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" type="date" name="to" defaultValue={to} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="room">Room</label>
          <input id="room" name="room" defaultValue={sp.room} placeholder="All rooms" className="input w-36" />
        </div>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-brand-50 dark:bg-brand-950">
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
            {rows.length === 0 && (
              <tr>
                <td className="td muted" colSpan={7}>No changes in this range. Rooms followed the timetable.</td>
              </tr>
            )}
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="td whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                <td className="td whitespace-nowrap">
                  {formatDate(a.date)}
                  <div className="muted text-xs">{slotById.get(a.slot_id)?.label}</div>
                </td>
                <td className="td font-medium">{a.room_id}</td>
                <td className="td">
                  {KIND[a.kind]}
                  {a.title && !["Class", "Event"].includes(a.title) && <div className="muted text-xs">{a.title}</div>}
                </td>
                <td className="td">{a.faculty_name}</td>
                <td className="td max-w-xs">{a.reason}</td>
                <td className="td text-xs">{a.created_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
