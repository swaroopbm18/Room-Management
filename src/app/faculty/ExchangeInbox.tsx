import EmptyState from "@/components/EmptyState";
import ExchangeStatus from "@/components/ExchangeStatus";
import SubmitButton from "@/components/SubmitButton";
import { IconCheck, IconSwap, IconX } from "@/components/Icons";
import { stageOf, type ExchangeRow, exchangeTime } from "@/lib/exchanges";
import type { Slot } from "@/lib/types";
import { formatDate } from "@/lib/time";
import { acceptExchange, declineExchange } from "../actions/exchanges";

/** Classes colleagues asked me to take: answer the new ones, and see where the rest stand. */
export default function ExchangeInbox({ received, slots, ready }: { received: ExchangeRow[]; slots: Slot[]; ready: boolean }) {
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const waiting = received.filter((x) => stageOf(x, slotById) === "pending").sort((a, b) => a.date.localeCompare(b.date) || a.slot_id - b.slot_id);
  const rest = received.filter((x) => !waiting.includes(x));
  if (!ready) return <div className="card p-4 text-sm">Class exchanges couldn&apos;t be read just now. Try again in a moment.</div>;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Waiting for your answer</h2>
        <p className="muted mb-3 text-sm">A colleague asked you to take one of their classes. Accept and an admin gives the final approval, then it shows as your class everywhere, in your calendar too.</p>
        {waiting.length === 0 ? (
          <EmptyState icon={<IconSwap />} title="Nothing to answer">
            When a colleague asks you to take a class, it shows here for you to accept or decline.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {waiting.map((x) => (
              <li key={x.id} className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-brand-700 dark:text-brand-300">{x.requester_name} asks you to take</div>
                    <div className="text-lg font-semibold">{x.new_subject ?? x.subject ?? "A class"}</div>
                    <div className="muted text-sm">
                      {formatDate(x.date)} · {exchangeTime(x, slotById)} · Room {x.room_id}
                    </div>
                    {x.new_subject && x.subject && x.new_subject !== x.subject && <div className="muted text-xs">in place of their {x.subject}</div>}
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">New</span>
                </div>
                {x.note && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm dark:bg-brand-950">“{x.note}”</p>}
                <form className="space-y-2">
                  <input type="hidden" name="id" value={x.id} />
                  <input type="hidden" name="back" value="/faculty?tab=exchange" />
                  <input name="note" maxLength={300} placeholder="Reply (optional)" aria-label="Reply" className="input py-1.5" />
                  <div className="flex flex-wrap justify-end gap-2">
                    <SubmitButton formAction={declineExchange} className="btn-secondary py-1.5" pendingText="Declining…" message="Declining…">
                      <IconX className="h-4 w-4" /> Decline
                    </SubmitButton>
                    <SubmitButton formAction={acceptExchange} className="btn-primary py-1.5" pendingText="Accepting…" message="Accepting…">
                      <IconCheck className="h-4 w-4" /> Accept
                    </SubmitButton>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Answered</h2>
          <ul className="card divide-y divide-brand-100 dark:divide-brand-900">
            {rest.map((x) => (
              <li key={x.id} className="space-y-1.5 px-4 py-3">
                <div className="text-sm">
                  <span className="font-semibold">{x.new_subject ?? x.subject ?? "Class"}</span>
                  <span className="muted">
                    {" "}
                    · {formatDate(x.date)} · {exchangeTime(x, slotById)} · Room {x.room_id} · from {x.requester_name}
                  </span>
                </div>
                <ExchangeStatus x={x} stage={stageOf(x, slotById)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
