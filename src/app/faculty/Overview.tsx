import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { headers } from "next/headers";
import CalendarLink from "@/components/CalendarLink";
import { IconCalendar, IconCalendarCheck, IconInbox, IconMinusCircle, IconRestore, IconSwap } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import type { Person } from "@/lib/types";
import { classBlocks, isOpenStage, slotRange, slotsOf, stageOf, type ExchangeRow } from "@/lib/exchanges";
import { getDaySchedule, getHolidays, getMySchedule, getSlots } from "@/lib/data";
import { getWeekFor } from "@/lib/faculty";
import { findSubstitutes } from "@/lib/substitutes";
import Substitutes from "@/components/Substitutes";
import WeekTable from "@/components/WeekTable";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, slotStarted, todayIST, workingDay } from "@/lib/time";
import { dropClass, resetCalendarLink, undoDrop } from "../actions";

/** The dashboard's first tab: KPIs, my classes (drop or exchange), dropped classes, calendar link and my week. */
export default async function Overview({ person, pending, waitingOnMe, sent }: { person: Person; pending: number; waitingOnMe: number; sent: ExchangeRow[] }) {
  const supabase = await createClient();
  const today = todayIST();

  await getHolidays(); // also loads make-up Sundays
  const [slots, schedule, todayRows, week, { data: dropData }, calRes, hdrs] = await Promise.all([
    getSlots(),
    getMySchedule(today, addDays(today, 6)),
    getDaySchedule(workingDay(today)),
    person.initials ? getWeekFor(person.initials) : null,
    supabase.from("allotments").select("id, room_id, date, slot_id, reason").eq("kind", "drop").eq("created_by", person.email).gte("date", today),
    supabase.rpc("my_calendar_token"),
    headers(),
  ]);
  // The private calendar link, on this site's own address
  const calToken = typeof calRes.data === "string" ? calRes.data : null;
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const calUrl = calToken && host ? `${hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}/cal/${calToken}.ics` : null;
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const mine = schedule.filter((r) => !r.ended);
  // Classes I dropped that can still be brought back: nothing has happened in the slot since, and it hasn't started
  type Drop = { id: number; room_id: string; date: string; slot_id: number; reason: string };
  const drops = (dropData ?? []) as Drop[];
  const latestRes = drops.length
    ? await supabase.from("allotments").select("id, room_id, date, slot_id").in("date", [...new Set(drops.map((d) => d.date))]).order("id", { ascending: false })
    : { data: [] };
  const latest = new Map<string, number>();
  for (const a of (latestRes.data ?? []) as Drop[]) if (!latest.has(`${a.room_id}|${a.date}|${a.slot_id}`)) latest.set(`${a.room_id}|${a.date}|${a.slot_id}`, a.id);
  const undoable = drops
    .filter((d) => latest.get(`${d.room_id}|${d.date}|${d.slot_id}`) === d.id && !slotStarted(d.date, slotById.get(d.slot_id)!))
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot_id - b.slot_id);
  const subs = await findSubstitutes(undoable, person.initials);
  const freeToday = todayRows.filter((r) => r.status === "free" && !r.ended).length;
  // Exchange requests still open for a class, to show instead of the Exchange button
  const asked = new Map(sent.filter((x) => isOpenStage(stageOf(x, slotById))).flatMap((x) => slotsOf(x).map((id) => [`${x.room_id}|${x.date}|${id}`, x] as const)));
  // Back-to-back slots of the same class (a lab or a double class) are one line, exchanged or dropped together
  const blocks = classBlocks(mine, slots);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Free slots today" value={freeToday} href="/free" linkText="Explore free slots" tone="navy" icon={<IconCalendarCheck />} />
        <KpiCard label="My classes, next 7 days" value={blocks.length} icon={<IconCalendar />} />
        {waitingOnMe > 0 ? (
          <KpiCard label="Exchanges waiting on me" value={waitingOnMe} href="/faculty?tab=exchange" linkText="Accept or decline" tone="ink" icon={<IconSwap />} />
        ) : (
          <KpiCard label="My pending requests" value={pending} href="/faculty?tab=requests" linkText="See my requests" tone="ink" icon={<IconInbox />} />
        )}
      </section>

      {calUrl && (
        <section className="card space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-2 font-semibold">
                <IconCalendar className="h-5 w-5 text-brand-500" /> Your classes in your own calendar
              </h2>
              <p className="muted text-sm">
                Add this link once and your classes, room bookings, substitute classes and make-up Sundays show in Google Calendar, Outlook or your phone, and stay up to date by
                themselves. Keep the link to yourself: anyone with it can see your classes.
              </p>
            </div>
            <form action={resetCalendarLink}>
              <input type="hidden" name="back" value="/faculty" />
              <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Making a new link…" message="Making a new calendar link…" confirm="Make a new link? The old one stops working, so you'll need to add the new one to your calendar.">
                New link
              </SubmitButton>
            </form>
          </div>
          <CalendarLink url={calUrl} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">My upcoming classes</h2>
        {mine.length === 0 ? (
          <div className="card muted p-6 text-sm">
            No classes in the next 7 days.
            {!person.initials && " Your timetable initials are not set yet, so regular classes can't be matched to you. Ask an admin to add them."}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-cards w-full sm:min-w-[760px]">
              <thead className="thead-ink">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Slot</th>
                  <th className="th">Room</th>
                  <th className="th">Subject</th>
                  <th className="th text-right">Drop or hand over</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
                {blocks.map((r) => (
                  <tr key={`${r.date}-${r.slot_id}-${r.room_id}`}>
                    <td data-label="Date" className="td whitespace-nowrap">{formatDate(r.date)}</td>
                    <td data-label="Slot" className="td whitespace-nowrap">
                      {slotRange(r.slotIds, slotById)}
                      {r.slotIds.length > 1 && <span className="muted block text-xs">{r.slotIds.length} slots back to back</span>}
                    </td>
                    <td data-label="Room" className="td font-medium">{r.room_name}</td>
                    <td data-label="Subject" className="td">
                      {r.subject}
                      {r.status === "booked" && <span className="muted"> · your booking</span>}
                    </td>
                    <td data-label="Drop or hand over" className="td">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {(() => {
                          const x = r.slotIds.map((id) => asked.get(`${r.room_id}|${r.date}|${id}`)).find(Boolean);
                          if (x)
                            return (
                              <Link href="/faculty?tab=requests" className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200">
                                {x.status === "pending" ? `Asked ${x.target_initials} · waiting` : `${x.target_initials} accepted · admin to approve`}
                              </Link>
                            );
                          return (
                            <Link
                              href={`/faculty/exchange?room=${encodeURIComponent(r.room_id)}&date=${r.date}&slots=${r.slotIds.join(",")}`}
                              className="btn-secondary py-1.5"
                              title={r.slotIds.length > 1 ? `Ask a colleague free for all ${r.slotIds.length} slots to take this class` : "Ask a free colleague to take this class"}
                            >
                              <IconSwap className="h-4 w-4" /> Exchange
                            </Link>
                          );
                        })()}
                        <form action={dropClass} className="flex gap-2">
                          <input type="hidden" name="room" value={r.room_id} />
                          <input type="hidden" name="date" value={r.date} />
                          <input type="hidden" name="slot" value={r.slot_id} />
                          <input type="hidden" name="slots" value={r.slotIds.join(",")} />
                          <input type="hidden" name="back" value="/faculty" />
                          <input name="reason" required placeholder="Reason" className="input w-32 py-1.5" />
                          <SubmitButton className="btn-danger py-1.5" pendingText="Dropping…" message="Dropping the class…">
                            <IconMinusCircle className="h-4 w-4" /> Drop
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {undoable.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Classes I dropped</h2>
          <p className="muted mb-3 text-sm">
            Dropped one by mistake? Bring it back any time before it starts, as long as nobody has been given the room. Faculty free then are listed, those who teach the
            course or class first, in case someone can take it.
          </p>
          <div className="card divide-y divide-brand-100 dark:divide-brand-900">
            {undoable.map((d) => (
              <form key={d.id} action={undoDrop} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <input type="hidden" name="room" value={d.room_id} />
                <input type="hidden" name="date" value={d.date} />
                <input type="hidden" name="slot" value={d.slot_id} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{formatDate(d.date)}</span> · {slotById.get(d.slot_id)?.label} · Room {d.room_id}
                  {subs.get(`${d.room_id}|${d.date}|${d.slot_id}`)?.subject && <> · {subs.get(`${d.room_id}|${d.date}|${d.slot_id}`)!.subject}</>}
                  <span className="muted block text-xs">Dropped: {d.reason}</span>
                  <Substitutes people={subs.get(`${d.room_id}|${d.date}|${d.slot_id}`)?.people ?? []} />
                </span>
                <SubmitButton className="btn-secondary py-1.5" pendingText="Bringing back…" message="Bringing the class back…">
                  <IconRestore className="h-4 w-4" /> Undo drop
                </SubmitButton>
              </form>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">My week</h2>
        <p className="muted mb-3 text-sm">Your regular timetable from tomorrow, Monday to Saturday. One-off bookings and dropped classes are in the list above.</p>
        {week ? (
          <div className="card overflow-hidden">
            <WeekTable week={week} slots={slots} />
          </div>
        ) : (
          <div className="card muted p-6 text-sm">Your timetable initials are not set yet, so your timetable can&apos;t be shown. Ask an admin to add them.</div>
        )}
      </section>

    </div>
  );
}

