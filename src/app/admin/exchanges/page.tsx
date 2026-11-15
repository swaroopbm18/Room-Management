import EmptyState from "@/components/EmptyState";
import ExchangeStatus from "@/components/ExchangeStatus";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { IconCheck, IconClock, IconRestore, IconSwap, IconUsers, IconX } from "@/components/Icons";
import { getSlots } from "@/lib/data";
import { stageOf, type ExchangeRow, exchangeTime } from "@/lib/exchanges";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime, slotStarted, todayIST } from "@/lib/time";
import { approveExchange, rejectExchange, undoExchange } from "../../actions";

export const dynamic = "force-dynamic";

/**
 * Class exchanges between faculty, from the moment one is asked: approve once the colleague has
 * accepted (the class becomes theirs everywhere), or reject at any point.
 */
export default async function AdminExchanges() {
  const supabase = await createClient();
  const [slots, { data, error }] = await Promise.all([
    getSlots(),
    supabase.from("class_exchanges").select("*").gte("date", addDays(todayIST(), -14)).order("date").order("slot_id").limit(300),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const rows = (data ?? []) as ExchangeRow[];
  const withStage = rows.map((x) => ({ x, stage: stageOf(x, slotById) }));
  const toApprove = withStage.filter((r) => r.stage === "accepted");
  const awaitingFaculty = withStage.filter((r) => r.stage === "pending");
  const decided = withStage.filter((r) => !["accepted", "pending"].includes(r.stage)).sort((a, b) => (b.x.decided_at ?? b.x.responded_at ?? b.x.created_at).localeCompare(a.x.decided_at ?? a.x.responded_at ?? a.x.created_at)).slice(0, 30);
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
      <PageHeader title="Class exchanges" subtitle="Faculty asking a free colleague to take a class. You see each one as soon as it is sent; approve it once the colleague accepts, and the timetable changes for everyone. Deny it and the original classes stay exactly as they are." />

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Waiting for your approval" value={toApprove.length} tone="navy" icon={<IconSwap />} />
        <KpiCard label="Waiting for the colleague" value={awaitingFaculty.length} icon={<IconClock />} />
        <KpiCard label="Approved this week" value={approvedThisWeek} tone="ink" icon={<IconUsers />} />
      </section>

      {error && <div className="card p-4 text-sm">Run supabase/migrations/0029_class_exchanges.sql in the Supabase SQL Editor to turn on class exchanges.</div>}

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
    </div>
  );
}
