import SubmitButton from "@/components/SubmitButton";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { IconFlag, IconMinusCircle, IconRestore } from "@/components/Icons";
import ClosedDay from "@/components/ClosedDay";
import DayGrid from "@/components/DayGrid";
import Flash from "@/components/Flash";
import PageHeader from "@/components/PageHeader";
import { getDaySchedule, getHolidays, getRooms, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { AllotmentRow } from "@/lib/types";
import { bookableDates, DATE_RE, formatDate, formatDateTime, isSunday, slotEnded, todayIST, workingDay } from "@/lib/time";
import { adminFree, adminOverride, adminRestore } from "../../actions";
import SlotRange from "./SlotRange";

export const dynamic = "force-dynamic";


const KIND_LABEL: Record<AllotmentRow["kind"], string> = {
  class_request: "Approved class request",
  event_request: "Approved event request",
  cie: "CIE",
  event: "College event",
  drop: "Class dropped or removed",
  restore: "Restored",
};

export default async function Allot({ searchParams }: { searchParams: Promise<{ date?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const dates = bookableDates();
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : workingDay(todayIST());
  const supabase = await createClient();
  const [rooms, slots, day, holidays, { data: changes }] = await Promise.all([
    getRooms(),
    getSlots(),
    getDaySchedule(date),
    getHolidays(),
    supabase.from("allotments").select("*").gte("date", todayIST()).order("id", { ascending: false }).limit(500),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));

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
      <PageHeader title="Allot or free a room" subtitle="Pick a start and end time between 8:00 AM and 5:40 PM. This overrides the regular classes and bookings in those slots, and pending requests for them are declined." />
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
        <SlotRange slots={slots} />
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
          <SubmitButton pendingText="Allotting…" message="Allotting the room…">
            <IconFlag className="h-4 w-4" /> Allot room
          </SubmitButton>
        </div>
      </form>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Free up a room</h2>
        <p className="muted mb-3 text-sm">
          Removes a regular class, an approved request or a CIE/event booking from future slots, so the room shows as free and faculty can request it.
          Use Restore below to undo.
        </p>
        <form action={adminFree} className="card grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="back" value={`/admin/allot?date=${date}`} />
          <div>
            <label className="label" htmlFor="free-date">Date</label>
            <select id="free-date" name="date" defaultValue={date} className="input">
              {dates.map((d) => (
                <option key={d} value={d}>{formatDate(d)}</option>
              ))}
            </select>
          </div>
          <SlotRange slots={slots} idPrefix="free-" />
          <div>
            <label className="label" htmlFor="free-room">Room</label>
            <select id="free-room" name="room" className="input">
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="free-reason">Reason <span className="text-red-600">*</span></label>
            <input id="free-reason" name="reason" required minLength={5} className="input" placeholder="e.g. Class cancelled, faculty on leave" />
          </div>
          <div className="flex justify-end sm:col-span-2 lg:col-span-4">
            <SubmitButton className="btn-danger" pendingText="Freeing…" message="Freeing the room…">
              <IconMinusCircle className="h-4 w-4" /> Free room
            </SubmitButton>
          </div>
        </form>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Day at a glance · {formatDate(date, { weekday: "long" })}</h2>
          <AutoSubmitSelect name="date" label="Date" value={date} options={dates.map((d) => ({ value: d, label: `${formatDate(d)}${holidays.has(d) ? " · holiday" : ""}` }))} />
        </div>
        {/* A holiday with nothing allotted shows the holiday instead of a grid of free rooms. */}
        {holidays.has(date) && day.every((r) => r.status === "free") ? (
          <ClosedDay date={date} holiday={holidays.get(date)} />
        ) : (
          <DayGrid rooms={rooms} slots={slots} rows={day} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Upcoming changes to the timetable</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="thead-ink">
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
                      <SubmitButton className="btn-secondary py-1.5 whitespace-nowrap" pendingText="Restoring…" message="Restoring the timetable…">
                        <IconRestore className="h-4 w-4" /> Restore
                      </SubmitButton>
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
