import type { ExchangeRow, ExchangeStage } from "@/lib/exchanges";
import { formatDateTime } from "@/lib/time";

const first = (name: string) => name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/, "").split(" ")[0];

/**
 * The three steps of a class exchange, each ticked as it happens: sent, the colleague's answer,
 * the admin's decision. A step that ended it (declined, rejected, withdrawn, expired) shows in red or grey.
 */
export default function ExchangeStatus({ x, stage }: { x: ExchangeRow; stage: ExchangeStage }) {
  type Step = { label: string; state: "done" | "now" | "todo" | "stop"; at?: string | null };
  const who = first(x.target_name);
  const answered = ["accepted", "approved", "rejected"].includes(x.status) && x.responded_at;
  const steps: Step[] = [
    { label: "Sent", state: "done", at: x.created_at },
    x.status === "declined"
      ? { label: `${who} declined`, state: "stop", at: x.responded_at }
      : answered
        ? { label: `${who} accepted`, state: "done", at: x.responded_at }
        : { label: `${who} to accept`, state: stage === "pending" ? "now" : "todo" },
    x.status === "approved"
      ? { label: "Admin approved", state: "done", at: x.decided_at }
      : x.status === "rejected"
        ? { label: "Admin denied · original class stays", state: "stop", at: x.decided_at }
        : { label: "Admin approval", state: stage === "accepted" ? "now" : "todo" },
  ];
  const dot = {
    done: "bg-brand-600 text-white dark:bg-brand-500 dark:text-black",
    now: "bg-amber-400 text-black ring-4 ring-amber-200 dark:ring-amber-900",
    todo: "bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
    stop: "bg-red-600 text-white",
  };
  const ended = stage === "withdrawn" ? "Withdrawn" : stage === "expired" ? "Expired: the class started before it was approved" : null;
  return (
    <div className="space-y-1.5">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs" aria-label="Exchange status">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span className={`h-px w-4 ${s.state === "todo" ? "bg-neutral-300 dark:bg-neutral-700" : "bg-brand-400"}`} aria-hidden />}
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${dot[ended && s.state !== "done" ? "todo" : s.state]}`} aria-hidden>
              {s.state === "stop" ? "×" : s.state === "done" ? "✓" : i + 1}
            </span>
            <span className={s.state === "now" && !ended ? "font-semibold" : s.state === "todo" || ended ? "muted" : ""} title={s.at ? formatDateTime(s.at) : undefined}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      {ended && <div className="muted text-xs">{ended}</div>}
      {x.response_note && <div className="text-xs"><span className="muted">{who}:</span> {x.response_note}</div>}
      {x.decision_note && <div className="text-xs"><span className="muted">Admin:</span> {x.decision_note}</div>}
    </div>
  );
}
