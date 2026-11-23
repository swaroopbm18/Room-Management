import type { Substitute } from "@/lib/substitutes";
import { assignSubstitute } from "@/app/actions/faculty";
import SubmitButton from "./SubmitButton";

/** The class a substitute would take, for the one-click Assign buttons (admins only). */
export type AssignTarget = { room_id: string; date: string; slot_id: number; subject: string; absent: string; absentName: string; back: string };

const busyText = (n?: number) => (n === undefined ? "" : n === 0 ? "free all day" : `${n} slot${n === 1 ? "" : "s"} busy that day`);

/**
 * Faculty free when a class would have run, best fits first: same course or class, then the
 * lightest day. With `assign`, each one has a button that gives them the class.
 */
export default function Substitutes({ people, assign }: { people: Substitute[]; assign?: AssignTarget }) {
  if (!people.length) return <span className="muted mt-1.5 block text-xs">Nobody else is free then.</span>;
  const shown = people.slice(0, assign ? 6 : 8);
  if (assign) {
    return (
      <div className="mt-2 text-xs">
        <div className="muted">Free to take it, best fit first. Assign gives them the class:</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {shown.map((p) => (
            <form key={p.initials} action={assignSubstitute} className="inline-flex">
              <input type="hidden" name="room" value={assign.room_id} />
              <input type="hidden" name="date" value={assign.date} />
              <input type="hidden" name="slot" value={assign.slot_id} />
              <input type="hidden" name="subject" value={assign.subject} />
              <input type="hidden" name="absent" value={assign.absent} />
              <input type="hidden" name="absent_name" value={assign.absentName} />
              <input type="hidden" name="sub" value={p.initials} />
              <input type="hidden" name="sub_name" value={p.name} />
              <input type="hidden" name="back" value={assign.back} />
              <SubmitButton
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-left ${
                  p.why ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700 dark:border-brand-500 dark:bg-brand-500 dark:text-black" : "border-brand-200 bg-white text-brand-900 hover:bg-brand-50 dark:border-brand-800 dark:bg-ink dark:text-brand-100 dark:hover:bg-brand-950"
                }`}
                pendingText="Assigning…"
                message={`Giving the class to ${p.name}…`}
                confirm={`${p.name} takes ${assign.subject} in ${assign.room_id}? It shows as their class everywhere.`}
              >
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="opacity-80"> · {[p.why, busyText(p.load)].filter(Boolean).join(", ")}</span>
                </span>
                <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/15">Assign</span>
              </SubmitButton>
            </form>
          ))}
          {people.length > shown.length && <span className="muted self-center">and {people.length - shown.length} more free</span>}
        </div>
      </div>
    );
  }
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="muted">Free to take it:</span>
      {shown.map((p) => (
        <span
          key={p.initials}
          className={`rounded-md px-2 py-0.5 ${p.why ? "bg-brand-600 text-white dark:bg-brand-500 dark:text-black" : "bg-brand-100 text-brand-900 dark:bg-brand-900/70 dark:text-brand-100"}`}
          title={[p.why, busyText(p.load)].filter(Boolean).join(", ")}
        >
          {p.name}
          {p.why && <span className="opacity-80"> · {p.why}</span>}
        </span>
      ))}
      {people.length > shown.length && <span className="muted">and {people.length - shown.length} more</span>}
    </span>
  );
}
