import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import Flash from "@/components/Flash";
import PageHeader from "@/components/PageHeader";
import { getDaySchedule, getRooms, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { AllotmentRow, SlotStatus } from "@/lib/types";
import { bookableDates, DATE_RE, formatDate, formatDateTime, isSunday, slotEnded, todayIST, workingDay } from "@/lib/time";
import { adminOverride, adminRestore } from "../../actions";

export const dynamic = "force-dynamic";

const CELL: Record<SlotStatus, string> = {
  free: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  class: "bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200",
  department: "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400",
  booked: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  cie: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  event: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

const KIND_LABEL: Record<AllotmentRow["kind"], string> = {
  class_request: "Approved class request",
  event_request: "Approved event request",
  cie: "CIE",
  event: "College event",
  drop: "Class dropped",
  restore: "Restored",
};

export default async function Allot({ searchParams }: { searchParams: Promise<{ date?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const dates = bookableDates();
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : workingDay(todayIST());
  const supabase = await createClient();
  const [rooms, slots, day, { data: changes }] = await Promise.all([
    getRooms(),
    getSlots(),
    getDaySchedule(date),
    supabase.from("allotments").select("*").gte("date", todayIST()).order("id", { ascending: false }).limit(500),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const cell = new Map(day.map((r) => [`${r.room_id}|${r.slot_id}`, r]));

  // Latest change per room and slot, for future slots only
  const latest = new Map<string, AllotmentRow>();
  for (const a of (changes ?? []) as AllotmentRow[]) {
    const k = `${a.date}|${a.slot_id}|${a.room_id}`;
    if (!latest.has(k)) latest.set(k, a);
  }
  const active = [...latest.values()]
    .filter((a) => a.kind !== "restore" && !slotEnded(a.date, slotById.get(a.slot_id)!))
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot_id - b.slot_id || a.room_id.localeCompare(b.room_id));

  return (
    <div className="space-y-8">
      <PageHeader title="Allot a room for CIE or an event" subtitle="Overrides the regular class or booking for that one slot. Pending requests for it are declined." />
      <Flash msg={sp.msg} error={sp.error} />

      <form action={adminOverride} className="card grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="back" value={`/admin/allot?date=${date}`} />
        <div>
          <label className="label" htmlFor="date">Date</label>
          <select id="date" name="date" defaultValue={date} className="input">
            {dates.map((d) => (
              <option key={d} value={d}>{formatDate(d)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="slot">Slot</label>
          <select id="slot" name="slot" className="input">
            {slots.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="room">Room</label>
          <select id="room" name="room" className="input">
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="kind">Reason</label>
          <select id="kind" name="kind" className="input">
            <option value="cie">CIE (exam)</option>
            <option value="event">College event</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" className="input" placeholder="e.g. CIE-2 DBMS, 3rd sem" />
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label" htmlFor="reason">Description <span className="text-red-600">*</span></label>
          <input id="reason" name="reason" required minLength={5} className="input" placeholder="Shown on the timetable" />
        </div>
        <div className="flex justify-end sm:col-span-2 lg:col-span-3">
          <button className="btn-primary">Allot room</button>
        </div>
      </form>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Day at a glance · {formatDate(date, { weekday: "long" })}</h2>
          <AutoSubmitSelect name="date" label="Date" value={date} options={dates.map((d) => ({ value: d, label: formatDate(d) }))} />
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1000px] border-separate border-spacing-1 p-2 text-xs">
            <thead>
              <tr>
                <th className="th px-2">Room</th>
                {slots.map((s) => (
                  <th key={s.id} className="px-1 py-2 text-center font-medium text-brand-800 dark:text-brand-300">
                    {s.label.split(" – ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 font-medium whitespace-nowrap">{r.name}</td>
                  {slots.map((s) => {
                    const c = cell.get(`${r.id}|${s.id}`);
                    if (!c) return <td key={s.id} />;
                    return (
                      <td
                        key={s.id}
                        title={[c.subject, c.faculty_name, c.reason].filter(Boolean).join(" · ") || "Free"}
                        className={`rounded-md px-1.5 py-1.5 text-center ${CELL[c.status]} ${c.ended ? "opacity-50" : ""}`}
                      >
                        <div className="truncate">{c.status === "free" ? "Free" : c.status === "booked" ? c.faculty_name : c.subject}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Upcoming changes to the timetable</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-brand-50 dark:bg-brand-950">
              <tr>
                <th className="th">Date & slot</th>
                <th className="th">Room</th>
                <th className="th">Change</th>
                <th className="th">Faculty / by</th>
                <th className="th">Description</th>
                <th className="th text-right">Undo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
              {active.length === 0 && (
                <tr>
                  <td className="td muted" colSpan={6}>No upcoming changes. Every room follows the timetable.</td>
                </tr>
              )}
              {active.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">
                    {formatDate(a.date)}
                    <div className="muted text-xs">{slotById.get(a.slot_id)?.label}</div>
                  </td>
                  <td className="td font-medium whitespace-nowrap">{a.room_id}</td>
                  <td className="td">
                    {KIND_LABEL[a.kind]}
                    {a.title && <div className="muted text-xs">{a.title}</div>}
                  </td>
                  <td className="td">
                    {a.faculty_name}
                    <div className="muted text-xs">{formatDateTime(a.created_at)}</div>
                  </td>
                  <td className="td max-w-xs">{a.reason}</td>
                  <td className="td">
                    <form action={adminRestore} className="flex justify-end gap-2">
                      <input type="hidden" name="room" value={a.room_id} />
                      <input type="hidden" name="date" value={a.date} />
                      <input type="hidden" name="slot" value={a.slot_id} />
                      <input type="hidden" name="back" value={`/admin/allot?date=${date}`} />
                      <input name="reason" placeholder="Why (optional)" className="input w-36 py-1.5" />
                      <button className="btn-secondary py-1.5">Restore timetable</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
