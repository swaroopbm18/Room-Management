import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import ExchangeStatus from "@/components/ExchangeStatus";
import InlineEdit, { Field } from "@/components/InlineEdit";
import RequestStatus from "@/components/RequestStatus";
import SubmitButton from "@/components/SubmitButton";
import { IconInbox, IconSwap, IconX } from "@/components/Icons";
import { isOpenStage, stageOf, type ExchangeRow } from "@/lib/exchanges";
import { slotCount } from "@/lib/requests";
import type { RequestGroup, Slot } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/time";
import { editRequest, withdrawExchange, withdrawRequest } from "../actions";

/** Everything I asked for and where it stands: class exchanges first, then room requests. */
export default function MyRequests({
  groups,
  mySubjects,
  sent,
  slots,
  exchangesReady,
}: {
  groups: (RequestGroup & { ended: boolean })[];
  mySubjects: string[];
  sent: ExchangeRow[];
  slots: Slot[];
  exchangesReady: boolean;
}) {
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const openSent = sent.filter((x) => isOpenStage(stageOf(x, slotById)));
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="exchanges" className="scroll-mt-4 text-lg font-semibold">Class exchanges I asked for</h2>
            <p className="muted text-sm">
              {openSent.length ? `${openSent.length} waiting. ` : ""}Each one needs the colleague to accept and then an admin to approve; the timetable changes once approved.
            </p>
          </div>
          <Link href="/faculty" className="btn-secondary py-1.5 text-sm">
            <IconSwap className="h-4 w-4" /> Exchange a class
          </Link>
        </div>
        {!exchangesReady ? (
          <div className="card p-4 text-sm">Run supabase/migrations/0029_class_exchanges.sql in the Supabase SQL Editor to turn on class exchanges.</div>
        ) : sent.length === 0 ? (
          <EmptyState icon={<IconSwap />} title="No class exchanges yet">
            Can&apos;t take a class? Press Exchange next to it under My upcoming classes and ask a free colleague, those who teach the same class first.
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-brand-100 dark:divide-brand-900">
            {sent.map((x) => {
              const stage = stageOf(x, slotById);
              return (
                <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="text-sm">
                      <span className="font-semibold">{x.subject ?? "Class"}</span>
                      <span className="muted"> · {formatDate(x.date)} · {slotById.get(x.slot_id)?.label} · Room {x.room_id}</span>
                    </div>
                    <div className="text-sm">
                      Asked <span className="font-medium">{x.target_name}</span>
                      {x.new_subject && x.new_subject !== x.subject && <span className="muted"> to take it for {x.new_subject}</span>}
                      {x.note && <span className="muted"> · “{x.note}”</span>}
                    </div>
                    <ExchangeStatus x={x} stage={stage} />
                  </div>
                  {isOpenStage(stage) && (
                    <form action={withdrawExchange}>
                      <input type="hidden" name="id" value={x.id} />
                      <input type="hidden" name="back" value="/faculty?tab=requests" />
                      <SubmitButton className="btn-secondary py-1.5" pendingText="Withdrawing…" message="Withdrawing the exchange request…" confirm={`Withdraw your request to ${x.target_name}? You keep the class.`}>
                        <IconX className="h-4 w-4" /> Withdraw
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 id="rooms" className="mb-3 scroll-mt-4 text-lg font-semibold">Room requests</h2>
        {groups.length === 0 ? (
          <EmptyState icon={<IconInbox />} title="You haven't requested any rooms yet" action={{ href: "/free", label: "Find a free slot" }}>
            Need a room for an extra class or an event? Pick a free slot and send a request; you&apos;ll see its status here.
          </EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table-cards w-full sm:min-w-[720px]">
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
                      <td data-label="Date &amp; slot" className="td whitespace-nowrap">
                        {formatDate(r.date)}
                        <div className="muted text-xs">
                          {g.range}
                          {g.rows.length > 1 && <> · {slotCount(g)}</>}
                        </div>
                      </td>
                      <td data-label="Room" className="td font-medium">{r.room_id}</td>
                      <td data-label="Type" className="td">
                        {r.type === "event" ? "Event" : "Class"}
                        {r.subject && <div className="muted text-xs">{r.subject}</div>}
                      </td>
                      <td data-label="Description" className="td max-w-xs">
                        {r.description}
                        {r.status === "pending" && !ended && (
                          <InlineEdit action={editRequest} back="/faculty?tab=requests" title="Edit this request" message="Saving your request…" className="mt-1">
                            <input type="hidden" name="id" value={g.group_id} />
                            {r.type === "class" && mySubjects.length > 0 && (
                              <Field label="Subject">
                                <select name="subject" defaultValue={r.subject ?? ""} className="input py-1.5 font-normal">
                                  {!r.subject && <option value="">Pick a subject</option>}
                                  {[...new Set([...(r.subject ? [r.subject] : []), ...mySubjects])].map((x) => (
                                    <option key={x} value={x}>
                                      {x}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            )}
                            <Field label="Description" className="min-w-56 flex-1">
                              <textarea name="description" required minLength={5} maxLength={500} rows={2} defaultValue={r.description} className="input py-1.5 font-normal" />
                            </Field>
                          </InlineEdit>
                        )}
                      </td>
                      <td data-label="Status" className="td">
                        <RequestStatus status={r.status} expired={ended} />
                        {r.decision_note && <div className="muted mt-1 text-xs">{r.decision_note}</div>}
                        {r.decided_at && <div className="muted text-xs">{formatDateTime(r.decided_at)}</div>}
                      </td>
                      <td className="td text-right">
                        {r.status === "pending" && !ended && (
                          <form action={withdrawRequest}>
                            <input type="hidden" name="id" value={g.group_id} />
                            <input type="hidden" name="back" value="/faculty?tab=requests" />
                            <SubmitButton className="btn-secondary py-1.5" pendingText="Withdrawing…" message="Withdrawing your request…" confirm="Withdraw this request? You can request the room again later if it's still free.">
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
