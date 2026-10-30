import SubmitButton from "@/components/SubmitButton";
import Flash from "@/components/Flash";
import { IconAlert, IconCheck, IconChevronDown, IconChevronUp, IconClock, IconFile, IconHistory, IconInbox, IconUsers, IconX } from "@/components/Icons";
import PendingLink from "@/components/PendingLink";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import { getDaySchedule, getFacultyStatus, getSlots } from "@/lib/data";
import { clashText, findClashes, sectionRows } from "@/lib/clashes";
import { groupRequests, slotCount } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import type { RequestRow } from "@/lib/types";
import { formatDate, formatDateTime, slotEnded, todayIST } from "@/lib/time";
import { approveRequest, moveRequest, rejectRequest } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminRequests({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayIST();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const [slots, pendingRes, approvedRes] = await Promise.all([
    getSlots(),
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
    supabase.from("requests").select("group_id").eq("status", "approved").gte("decided_at", weekAgo),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const pending = groupRequests((pendingRes.data ?? []) as RequestRow[], slotById)
    .filter((g) => !slotEnded(g.first.date, slotById.get(g.first.slot_id)!))
    .sort((a, b) => a.first.priority - b.first.priority || a.first.created_at.localeCompare(b.first.created_at));
  const approvedThisWeek = new Set((approvedRes.data ?? []).map((r) => r.group_id)).size;
  const oldest = pending.reduce<string | null>((o, g) => (!o || g.first.created_at < o ? g.first.created_at : o), null);
  const waitingDays = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 864e5) : 0;

  const paths = pending.map((g) => g.first.pdf_path).filter((p): p is string => !!p);
  const signed = paths.length ? ((await supabase.storage.from("letters").createSignedUrls(paths, 60 * 30)).data ?? []) : [];
  const urlFor = new Map(signed.map((s) => [s.path ?? "", s.signedUrl]));

  // Clash warnings: what each requester, and the class's section, already has in those slots
  const dates = [...new Set(pending.map((g) => g.first.date))];
  const [peopleRes, statuses, days] = await Promise.all([
    supabase.from("people").select("email, initials"),
    Promise.all(dates.map((d) => getFacultyStatus(d))),
    Promise.all(dates.map((d) => getDaySchedule(d))),
  ]);
  const initialsOf = new Map(((peopleRes.data ?? []) as { email: string; initials: string | null }[]).map((p) => [p.email, p.initials]));
  const clashesFor = (g: (typeof pending)[number]) => {
    const i = dates.indexOf(g.first.date);
    const ini = initialsOf.get(g.first.requester_email);
    const busy = new Map((statuses[i] ?? []).filter((f) => ini && f.initials === ini && f.busy).map((f) => [f.slot_id, f]));
    return findClashes({ room: g.first.room_id, slotIds: g.slotIds, subject: g.first.type === "class" ? g.first.subject : null, busy, day: sectionRows(days[i]) });
  };
  const startOf = (id: number) => slotById.get(id)?.label.split(" – ")[0] ?? "";

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
      >
        <PendingLink href="/admin/history" className="btn-secondary">
          <IconHistory className="h-4 w-4" /> Decided requests
        </PendingLink>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard
          label="Pending requests"
          value={pending.length}
          hint={oldest ? `Oldest waiting since ${formatDateTime(oldest)}${waitingDays ? ` (${waitingDays} ${waitingDays === 1 ? "day" : "days"})` : ""}` : "Nothing waiting"}
          tone="navy"
          icon={<IconInbox />}
        />
        <KpiCard label="Rooms with competing requests" value={competing} icon={<IconUsers />} />
        <KpiCard label="Approved this week" value={approvedThisWeek} hint="In the last 7 days" tone="ink" icon={<IconClock />} />
      </section>

      {groups.size === 0 ? (
        <div className="card muted p-10 text-center">No pending requests.</div>
      ) : (
        <div className="space-y-4">
          {sortedGroups.map(([key, reqs]) => {
            const r0 = reqs[0].first;
            return (
              <section key={key} className="card overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-100 bg-gradient-to-r from-brand-100 to-white px-4 py-3 sm:px-5 dark:border-brand-900 dark:from-brand-950 dark:to-ink">
                  <div className="font-semibold">
                    Room {r0.room_id} · {formatDate(r0.date)}
                  </div>
                  <div className="muted text-sm">{reqs.length === 1 ? "1 request" : `${reqs.length} requests, highest priority first`}</div>
                </div>
                {/* One card per request: stacked on a phone, in a row from tablet width up */}
                <ol className="divide-y divide-brand-100 dark:divide-brand-900">
                  {reqs.map((g, i) => {
                    const r = g.first;
                    const clashes = clashesFor(g);
                    return (
                      <li key={g.group_id} className="flex flex-col gap-3 p-4 sm:px-5 md:flex-row md:items-start md:gap-5">
                        <div className="flex items-center gap-2 md:w-12 md:flex-col md:items-start md:gap-0.5">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 dark:bg-brand-900/70 dark:text-brand-100">{i + 1}</span>
                          {reqs.length > 1 && (
                            <div className="flex gap-1 md:flex-col">
                              {[
                                { dir: -1, label: <IconChevronUp className="h-4 w-4" />, show: i > 0 },
                                { dir: 1, label: <IconChevronDown className="h-4 w-4" />, show: i < reqs.length - 1 },
                              ].map((b) =>
                                b.show ? (
                                  <form key={b.dir} action={moveRequest}>
                                    <input type="hidden" name="id" value={g.group_id} />
                                    <input type="hidden" name="dir" value={b.dir} />
                                    <SubmitButton
                                      pendingText=""
                                      message="Changing priority…"
                                      className="rounded p-1 text-brand-600 hover:bg-brand-100 hover:text-brand-900 dark:text-brand-400 dark:hover:bg-brand-900"
                                      aria-label={b.dir < 0 ? "Move up" : "Move down"}
                                    >
                                      {b.label}
                                    </SubmitButton>
                                  </form>
                                ) : null,
                              )}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="font-semibold">{g.range}</span>
                            <span className="muted text-xs">{slotCount(g)}</span>
                            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-950 dark:text-brand-200">
                              {r.type === "event" ? "Event" : "Class"}
                              {r.subject && ` · ${r.subject}`}
                            </span>
                          </div>
                          <div className="text-sm">
                            {r.requester_name} <span className="muted text-xs break-all">· {r.requester_email} · Sent {formatDateTime(r.created_at)}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">{r.description}</p>
                          {r.pdf_path && urlFor.get(r.pdf_path) && (
                            <a
                              href={urlFor.get(r.pdf_path) ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 underline dark:text-brand-400"
                            >
                              <IconFile className="h-3.5 w-3.5" /> Approval letter (PDF)
                            </a>
                          )}
                          {r.type === "event" && !r.pdf_path && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-red-700 ring-1 ring-red-200 ring-inset dark:bg-red-950 dark:text-red-300 dark:ring-red-900">
                              <IconAlert className="h-3.5 w-3.5" /> No permission letter
                            </span>
                          )}
                          {clashes.map((c, k) => (
                            <div key={k} className="flex gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {clashText(c, r.requester_name, startOf(c.slot_id))}
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-2 md:w-72 md:items-end">
                          <form action={approveRequest}>
                            <input type="hidden" name="id" value={g.group_id} />
                            <SubmitButton className="btn-primary w-full py-2 md:w-auto md:py-1.5" pendingText="Approving…" message="Approving the request…">
                              <IconCheck className="h-4 w-4" /> Approve
                            </SubmitButton>
                          </form>
                          <form action={rejectRequest} className="flex gap-2">
                            <input type="hidden" name="id" value={g.group_id} />
                            <input name="note" placeholder="Reason (optional)" aria-label="Reason for rejecting" className="input min-w-0 flex-1 py-1.5 md:w-40 md:flex-none" />
                            <SubmitButton className="btn-danger py-1.5" pendingText="Rejecting…" message="Rejecting the request…">
                              <IconX className="h-4 w-4" /> Reject
                            </SubmitButton>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
