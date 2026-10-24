import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { IconCalendar, IconCalendarCheck, IconInbox, IconMinusCircle, IconPlus, IconX } from "@/components/Icons";
import Flash from "@/components/Flash";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import RequestStatus from "@/components/RequestStatus";
import { displayName, requireStaff } from "@/lib/auth";
import { getDaySchedule, getSlots } from "@/lib/data";
import { groupRequests, slotCount } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import type { RequestRow } from "@/lib/types";
import { addDays, formatDate, formatDateTime, isSunday, slotEnded, todayIST, workingDay } from "@/lib/time";
import { dropClass, withdrawRequest } from "../actions";

export const dynamic = "force-dynamic";

export default async function FacultyDashboard({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const person = await requireStaff();
  const supabase = await createClient();
  const today = todayIST();

  // My classes over the next 7 days
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i)).filter((d) => !isSunday(d));
  const [slots, schedules, { data: reqData }] = await Promise.all([
    getSlots(),
    Promise.all(days.map(async (d) => ({ date: d, rows: await getDaySchedule(d) }))),
    supabase.from("requests").select("*").eq("requester_email", person.email).order("created_at", { ascending: false }).limit(50),
  ]);
  const requests = (reqData ?? []) as RequestRow[];
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const mine = schedules.flatMap(({ date, rows }) => rows.filter((r) => r.is_mine && !r.ended).map((r) => ({ ...r, date })));
  const todayRows = schedules.find((s) => s.date === workingDay(today))?.rows ?? [];
  const freeToday = todayRows.filter((r) => r.status === "free" && !r.ended).length;
  // One entry per request, however many slots it covers. A request is over once its first slot ends.
  const groups = groupRequests(requests, slotById).map((g) => ({
    ...g,
    ended: slotEnded(g.first.date, slotById.get(g.first.slot_id)!),
  }));
  const pending = groups.filter((g) => g.first.status === "pending" && !g.ended).length;

  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome, ${displayName(person)}`} subtitle={person.email}>
        <Link href="/free" className="btn-primary">
          <IconPlus className="h-4 w-4" /> Request a free room
        </Link>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Free slots today" value={freeToday} href="/free" linkText="Explore free slots" tone="navy" icon={<IconCalendarCheck />} />
        <KpiCard label="My classes, next 7 days" value={mine.length} icon={<IconCalendar />} />
        <KpiCard label="My pending requests" value={pending} tone="ink" icon={<IconInbox />} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">My upcoming classes</h2>
        {mine.length === 0 ? (
          <div className="card muted p-6 text-sm">
            No classes in the next 7 days.
            {!person.initials && " Your timetable initials are not set yet, so regular classes can't be matched to you. Ask an admin to add them."}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="thead-ink">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Slot</th>
                  <th className="th">Room</th>
                  <th className="th">Subject</th>
                  <th className="th text-right">Drop this class</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
                {mine.map((r) => (
                  <tr key={`${r.date}-${r.slot_id}-${r.room_id}`}>
                    <td className="td whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="td whitespace-nowrap">{r.slot_label}</td>
                    <td className="td font-medium">{r.room_name}</td>
                    <td className="td">
                      {r.subject}
                      {r.status === "booked" && <span className="muted"> · your booking</span>}
                    </td>
                    <td className="td">
                      <form action={dropClass} className="flex justify-end gap-2">
                        <input type="hidden" name="room" value={r.room_id} />
                        <input type="hidden" name="date" value={r.date} />
                        <input type="hidden" name="slot" value={r.slot_id} />
                        <input type="hidden" name="back" value="/faculty" />
                        <input name="reason" required placeholder="Reason" className="input w-36 py-1.5" />
                        <SubmitButton className="btn-danger py-1.5" pendingText="Dropping…" message="Dropping the class…">
                          <IconMinusCircle className="h-4 w-4" /> Drop
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">My requests</h2>
        {requests.length === 0 ? (
          <div className="card muted p-6 text-sm">
            You haven&apos;t requested any rooms yet.{" "}
            <Link className="text-brand-600 underline" href="/free">
              Find a free slot
            </Link>
            .
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="thead-ink">
                <tr>
                  <th className="th">Date & slot</th>
                  <th className="th">Room</th>
                  <th className="th">Type</th>
                  <th className="th">Description</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
                {groups.map((g) => {
                  const r = g.first;
                  const ended = g.ended;
                  return (
                    <tr key={g.group_id}>
                      <td className="td whitespace-nowrap">
                        {formatDate(r.date)}
                        <div className="muted text-xs">
                          {g.range}
                          {g.rows.length > 1 && <> · {slotCount(g)}</>}
                        </div>
                      </td>
                      <td className="td font-medium">{r.room_id}</td>
                      <td className="td">
                        {r.type === "event" ? "Event" : "Class"}
                        {r.subject && <div className="muted text-xs">{r.subject}</div>}
                      </td>
                      <td className="td max-w-xs">{r.description}</td>
                      <td className="td">
                        <RequestStatus status={r.status} expired={ended} />
                        {r.decision_note && <div className="muted mt-1 text-xs">{r.decision_note}</div>}
                        {r.decided_at && <div className="muted text-xs">{formatDateTime(r.decided_at)}</div>}
                      </td>
                      <td className="td text-right">
                        {r.status === "pending" && !ended && (
                          <form action={withdrawRequest}>
                            <input type="hidden" name="id" value={g.group_id} />
                            <SubmitButton className="btn-secondary py-1.5" pendingText="Withdrawing…" message="Withdrawing your request…">
                              <IconX className="h-4 w-4" /> Withdraw
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
