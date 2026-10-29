import SubmitButton from "@/components/SubmitButton";
import Flash from "@/components/Flash";
import { IconAlert, IconCalendarCheck, IconCheck, IconChevronDown, IconChevronUp, IconFile, IconInbox, IconUsers, IconX } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import RequestStatus from "@/components/RequestStatus";
import { getDaySchedule, getSlots } from "@/lib/data";
import { groupRequests, slotCount } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import type { RequestRow } from "@/lib/types";
import { formatDate, formatDateTime, slotEnded, todayIST, workingDay } from "@/lib/time";
import { approveRequest, moveRequest, rejectRequest } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminRequests({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayIST();
  const [slots, todayRows, pendingRes, decidedRes] = await Promise.all([
    getSlots(),
    getDaySchedule(workingDay(today)),
    supabase
      .from("requests")
      .select("*")
      .eq("status", "pending")
      .gte("date", today)
      .order("date")
      .order("slot_id")
      .order("room_id")
      .order("priority")
      .order("created_at"),
    supabase.from("requests").select("*").neq("status", "pending").order("decided_at", { ascending: false }).limit(80),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const pending = groupRequests((pendingRes.data ?? []) as RequestRow[], slotById)
    .filter((g) => !slotEnded(g.first.date, slotById.get(g.first.slot_id)!))
    .sort((a, b) => a.first.priority - b.first.priority || a.first.created_at.localeCompare(b.first.created_at));
  const decided = groupRequests((decidedRes.data ?? []) as RequestRow[], slotById).slice(0, 20);

  const paths = pending.map((g) => g.first.pdf_path).filter((p): p is string => !!p);
  const signed = paths.length ? ((await supabase.storage.from("letters").createSignedUrls(paths, 60 * 30)).data ?? []) : [];
  const urlFor = new Map(signed.map((s) => [s.path ?? "", s.signedUrl]));

  // Requests for the same room on the same day share one priority order
  const groups = new Map<string, typeof pending>();
  for (const g of pending) {
    const k = `${g.first.date}|${g.first.room_id}`;
    groups.set(k, [...(groups.get(k) ?? []), g]);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const competing = sortedGroups.filter(([, gs]) => gs.some((g, i) => gs.some((h, j) => i !== j && g.slotIds.some((s) => h.slotIds.includes(s))))).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Room requests"
        subtitle="Approve in order of priority. A request covers all of its slots, and approving it declines the others that overlap."
      />
      <Flash msg={sp.msg} error={sp.error} />

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Pending requests" value={pending.length} tone="navy" icon={<IconInbox />} />
        <KpiCard label="Rooms with competing requests" value={competing} icon={<IconUsers />} />
        <KpiCard
          label="Free slots today"
          value={todayRows.filter((r) => r.status === "free" && !r.ended).length}
          href="/free"
          linkText="Explore free slots"
          tone="ink"
          icon={<IconCalendarCheck />}
        />
      </section>

      {groups.size === 0 ? (
        <div className="card muted p-10 text-center">No pending requests.</div>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([key, reqs]) => {
            const r0 = reqs[0].first;
            return (
              <section key={key} className="card overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-100 bg-gradient-to-r from-brand-100 to-white px-5 py-3 dark:border-brand-900 dark:from-brand-950 dark:to-ink">
                  <div className="font-semibold">
                    Room {r0.room_id} · {formatDate(r0.date)}
                  </div>
                  <div className="muted text-sm">{reqs.length === 1 ? "1 request" : `${reqs.length} requests, highest priority first`}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px]">
                    <thead className="thead-ink">
                      <tr>
                        <th className="th w-16">#</th>
                        <th className="th">Slots</th>
                        <th className="th">Faculty</th>
                        <th className="th">Type</th>
                        <th className="th">Description</th>
                        <th className="th text-right">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
                      {reqs.map((g, i) => {
                        const r = g.first;
                        return (
                          <tr key={g.group_id}>
                            <td className="td">
                              <div className="flex items-center gap-1">
                                <span className="w-4 font-medium">{i + 1}</span>
                                {reqs.length > 1 && (
                                  <div className="flex flex-col">
                                    {[
                                      {
                                        dir: -1,
                                        label: <IconChevronUp className="h-3.5 w-3.5" />,
                                        show: i > 0,
                                      },
                                      {
                                        dir: 1,
                                        label: <IconChevronDown className="h-3.5 w-3.5" />,
                                        show: i < reqs.length - 1,
                                      },
                                    ].map((b) =>
                                      b.show ? (
                                        <form key={b.dir} action={moveRequest}>
                                          <input type="hidden" name="id" value={g.group_id} />
                                          <input type="hidden" name="dir" value={b.dir} />
                                          <SubmitButton
                                            pendingText=""
                                            message="Changing priority…"
                                            className="rounded p-0.5 text-brand-600 hover:bg-brand-100 hover:text-brand-900 dark:text-brand-400 dark:hover:bg-brand-900"
                                            aria-label={b.dir < 0 ? "Move up" : "Move down"}
                                          >
                                            {b.label}
                                          </SubmitButton>
                                        </form>
                                      ) : (
                                        <span key={b.dir} className="h-[18px]" />
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="td whitespace-nowrap">
                              <span className="font-medium">{g.range}</span>
                              <div className="muted text-xs">{slotCount(g)}</div>
                            </td>
                            <td className="td">
                              {r.requester_name}
                              <div className="muted text-xs">{r.requester_email}</div>
                              <div className="muted text-xs">Sent {formatDateTime(r.created_at)}</div>
                            </td>
                            <td className="td">
                              {r.type === "event" ? "Event" : "Class"}
                              {r.subject && <div className="font-medium">{r.subject}</div>}
                              {r.pdf_path && urlFor.get(r.pdf_path) && (
                                <div>
                                  <a
                                    href={urlFor.get(r.pdf_path) ?? undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 underline dark:text-brand-400"
                                  >
                                    <IconFile className="h-3.5 w-3.5" /> Approval letter (PDF)
                                  </a>
                                </div>
                              )}
                              {r.type === "event" && !r.pdf_path && (
                                <div>
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-red-700 ring-1 ring-red-200 ring-inset dark:bg-red-950 dark:text-red-300 dark:ring-red-900">
                                    <IconAlert className="h-3.5 w-3.5" /> No permission letter
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="td max-w-sm whitespace-pre-wrap">{r.description}</td>
                            <td className="td">
                              <div className="flex flex-col items-end gap-2">
                                <form action={approveRequest}>
                                  <input type="hidden" name="id" value={g.group_id} />
                                  <SubmitButton className="btn-primary py-1.5" pendingText="Approving…" message="Approving the request…">
                                    <IconCheck className="h-4 w-4" /> Approve
                                  </SubmitButton>
                                </form>
                                <form action={rejectRequest} className="flex gap-2">
                                  <input type="hidden" name="id" value={g.group_id} />
                                  <input name="note" placeholder="Reason (optional)" className="input w-40 py-1.5" />
                                  <SubmitButton className="btn-danger py-1.5" pendingText="Rejecting…" message="Rejecting the request…">
                                    <IconX className="h-4 w-4" /> Reject
                                  </SubmitButton>
                                </form>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recently decided</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="thead-ink">
              <tr>
                <th className="th">Date & slot</th>
                <th className="th">Room</th>
                <th className="th">Faculty</th>
                <th className="th">Type</th>
                <th className="th">Description</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
              {decided.length === 0 && (
                <tr>
                  <td className="td muted" colSpan={6}>
                    Nothing yet.
                  </td>
                </tr>
              )}
              {decided.map((g) => {
                const r = g.first;
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
                    <td className="td">{r.requester_name}</td>
                    <td className="td">
                      {r.type === "event" ? "Event" : "Class"}
                      {r.subject && <div className="muted text-xs">{r.subject}</div>}
                    </td>
                    <td className="td max-w-xs">{r.description}</td>
                    <td className="td">
                      <RequestStatus status={r.status} />
                      <div className="muted mt-1 text-xs">
                        {r.decided_by} {r.decided_at && `· ${formatDateTime(r.decided_at)}`}
                      </div>
                      {r.decision_note && <div className="muted text-xs">{r.decision_note}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
