import EmptyState from "@/components/EmptyState";
import ExchangeStatus from "@/components/ExchangeStatus";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { IconCheck, IconClock, IconLeave, IconRestore, IconSwap, IconUsers, IconX } from "@/components/Icons";
import PendingLink from "@/components/PendingLink";
import { mergeRuns } from "@/lib/bookings";
import { getSlots } from "@/lib/data";
import { stageOf, type ExchangeRow, exchangeTime } from "@/lib/exchanges";
import { createClient } from "@/lib/supabase/server";
import type { AllotmentRow } from "@/lib/types";
import { addDays, formatDate, formatDateTime, slotStarted, todayIST } from "@/lib/time";
import { approveExchange, rejectExchange, undoExchange } from "../../actions";

export const dynamic = "force-dynamic";

/**
 * Every class handed to someone else, in one place: class exchanges between faculty, from the
 * moment one is asked (approve once the colleague has accepted, or reject at any point), and the
 * classes an admin gave to a substitute or another faculty member.
 */
export default async function AdminExchanges() {
  const supabase = await createClient();
  const [slots, { data, error }, { data: allotData }] = await Promise.all([
    getSlots(),
    supabase.from("class_exchanges").select("*").gte("date", addDays(todayIST(), -14)).order("date").order("slot_id").limit(300),
    supabase.from("allotments").select("*").gte("date", todayIST()).order("id").limit(3000),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const rows = (data ?? []) as ExchangeRow[];
  const withStage = rows.map((x) => ({ x, stage: stageOf(x, slotById) }));
  const toApprove = withStage.filter((r) => r.stage === "accepted");
  const awaitingFaculty = withStage.filter((r) => r.stage === "pending");
  const decided = withStage.filter((r) => !["accepted", "pending"].includes(r.stage)).sort((a, b) => (b.x.decided_at ?? b.x.responded_at ?? b.x.created_at).localeCompare(a.x.decided_at ?? a.x.responded_at ?? a.x.created_at)).slice(0, 30);
  // Classes an admin gave to a named faculty member (a substitute for leave, or Allot with a
  // faculty member), still standing: no later change to the same slot
  const latest = new Map<string, AllotmentRow>();
  for (const a of (allotData ?? []) as AllotmentRow[]) latest.set(`${a.room_id}|${a.date}|${a.slot_id}`, a);
  const covered = mergeRuns(
    [...latest.values()].filter((a) => a.kind === "class_request" && !a.request_id && a.faculty_name && !a.reason.startsWith("Class exchange:")),
    slots,
    (a, b) => a.title === b.title && a.faculty_name === b.faculty_name && a.reason === b.reason,
  );
  const approvedThisWeek = rows.filter((x) => x.status === "approved" && x.decided_at && Date.now() - new Date(x.decided_at).getTime() < 7 * 864e5).length;

  const Card = ({ x, stage, approve }: { x: ExchangeRow; stage: ReturnType<typeof stageOf>; approve: boolean }) => (
    <li className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold">
            {x.subject ?? "Class"}
            {x.new_subject && x.new_subject !== x.subject && <span className="muted text-sm font-normal"> → {x.new_subject}</span>}
          </div>
          <div className="muted text-sm">
            {formatDate(x.date)} · {exchangeTime(x, slotById)} · Room {x.room_id}
          </div>
        </div>
        <div className="text-right text-sm">
          <div>
            <span className="font-medium">{x.requester_name}</span> <span className="muted">hands over to</span>
          </div>
          <div className="font-medium">{x.target_name}</div>
        </div>
      </div>
      {x.note && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm dark:bg-brand-950">“{x.note}”</p>}
      <ExchangeStatus x={x} stage={stage} />
      {x.status === "accepted" && (
        <p className="text-xs">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">Faculty mutually agreed</span>{" "}
          <span className="muted">Approve to change the timetable; deny and the original class stays as it is.</span>
        </p>
      )}
      <form className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={x.id} />
        <input name="note" maxLength={300} placeholder={approve ? "Note (optional)" : "Reason for denying (optional)"} aria-label="Note" className="input min-w-48 flex-1 py-1.5" />
        <SubmitButton
          formAction={rejectExchange}
          className="btn-secondary py-1.5"
          pendingText="Denying…"
          message="Denying the exchange…"
          confirm={`Deny ${x.requester_name}'s request? Nothing on the timetable changes: ${x.requester_name} keeps the class${x.status === "accepted" ? `, even though ${x.target_name} agreed` : ""}.`}
        >
          <IconX className="h-4 w-4" /> Deny
        </SubmitButton>
        {approve && (
          <SubmitButton formAction={approveExchange} className="btn-primary py-1.5" pendingText="Approving…" message="Approving the exchange…">
            <IconCheck className="h-4 w-4" /> Approve
          </SubmitButton>
        )}
      </form>
      <div className="muted text-xs">Asked {formatDateTime(x.created_at)}</div>
    </li>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Class cover" subtitle="Every class handed to someone else. Faculty ask a free colleague in a class exchange: you see it as soon as it is sent, approve it once the colleague accepts and the timetable changes for everyone, or deny it and the original classes stay as they are. Substitutes you assign for leave show at the end.">
        <PendingLink href="/admin/leave" className="btn-secondary">
          <IconLeave className="h-4 w-4" /> Assign a substitute
        </PendingLink>
      </PageHeader>

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Waiting for your approval" value={toApprove.length} tone="navy" icon={<IconSwap />} />
        <KpiCard label="Waiting for the colleague" value={awaitingFaculty.length} icon={<IconClock />} />
        <KpiCard label="Approved this week" value={approvedThisWeek} tone="ink" icon={<IconUsers />} />
      </section>

      {error && <div className="card p-4 text-sm">Class exchanges couldn&apos;t be read just now. Try again in a moment.</div>}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Accepted, waiting for your approval</h2>
        {toApprove.length === 0 ? (
          <EmptyState icon={<IconSwap />} title="Nothing to approve">
            When a faculty member accepts a colleague&apos;s request to take a class, it shows here for the final approval.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {toApprove.map(({ x, stage }) => (
              <Card key={x.id} x={x} stage={stage} approve />
            ))}
          </ul>
        )}
      </section>

      {awaitingFaculty.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Waiting for the colleague to accept</h2>
          <p className="muted mb-3 text-sm">You can approve these once they are accepted, or reject one now.</p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {awaitingFaculty.map(({ x, stage }) => (
              <Card key={x.id} x={x} stage={stage} approve={false} />
            ))}
          </ul>
        </section>
      )}

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent</h2>
          <ul className="card divide-y divide-brand-100 dark:divide-brand-900">
            {decided.map(({ x, stage }) => (
              <li key={x.id} className="space-y-1.5 px-4 py-3">
                <div className="text-sm">
                  <span className="font-semibold">{x.subject ?? "Class"}</span>
                  <span className="muted">
                    {" "}
                    · {formatDate(x.date)} · {exchangeTime(x, slotById)} · {x.requester_name} → {x.target_name}
                  </span>
                </div>
                <ExchangeStatus x={x} stage={stage} />
                {x.status === "approved" && slotById.get(x.slot_id) && !slotStarted(x.date, slotById.get(x.slot_id)!) && (
                  <form action={undoExchange} className="flex flex-wrap items-center gap-2 pt-1">
                    <input type="hidden" name="id" value={x.id} />
                    <input name="note" maxLength={300} placeholder="Reason (optional)" aria-label="Reason" className="input min-w-48 flex-1 py-1" />
                    <SubmitButton
                      className="btn-secondary py-1 text-xs"
                      pendingText="Taking back…"
                      message="Taking back the approval…"
                      confirm={`Take back this approval? ${x.requester_name} gets the class back in every slot and ${x.target_name} is freed.`}
                    >
                      <IconRestore className="h-3.5 w-3.5" /> Deny after all
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-lg font-semibold">Given by an admin</h2>
        <p className="muted mb-3 text-sm">Substitutes for faculty on leave and classes allotted to a named faculty member, from today on. Undo one from Allot / free rooms.</p>
        {covered.length === 0 ? (
          <EmptyState icon={<IconLeave />} title="No other cover arranged">
            Assign a substitute under Leave &amp; substitutes, or name a faculty member when you allot a room for a class.
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-brand-100 dark:divide-brand-900">
            {covered.map(({ first: a, range, slotIds }) => (
              <li key={`${a.id}-${slotIds.join()}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold">{a.title && a.title !== "Class" ? a.title : "Class"}</span>
                  <span className="muted">
                    {" "}
                    · {formatDate(a.date)} · {range} · {a.room_id} · {a.faculty_name}
                  </span>
                </span>
                <span className="muted text-xs">{a.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
