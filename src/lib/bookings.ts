import type { Slot } from "./types";

type SlotRow = { date: string; room_id: string; slot_id: number };

/** Back-to-back slots of one booking, shown as a single record. */
export type Run<T> = { first: T; rows: T[]; slotIds: number[]; from: Slot; to: Slot; range: string };

/** "8:00 AM – 4:45 PM": from the start of the first slot to the end of the last. */
export function slotSpan(from: Slot, to: Slot): string {
  return `${from.label.split(" – ")[0]} – ${to.label.split(" – ")[1] ?? ""}`;
}

/**
 * Merges rows for the same room and day whose slots follow one another in the day's order and that
 * `same` says belong to one booking. A slot in between that isn't part of it (a gap) starts a new record.
 * Runs keep the order in which their first row appears.
 */
export function mergeRuns<T extends SlotRow>(rows: T[], slots: Slot[], same: (a: T, b: T) => boolean): Run<T>[] {
  const order = [...slots].sort((a, b) => a.starts.localeCompare(b.starts));
  const pos = new Map(order.map((s, i) => [s.id, i]));
  const slotOf = new Map(order.map((s) => [s.id, s]));
  const sorted = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => pos.has(r.slot_id))
    .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.r.room_id.localeCompare(b.r.room_id) || pos.get(a.r.slot_id)! - pos.get(b.r.slot_id)!);

  const runs: { run: Run<T>; at: number }[] = [];
  for (const { r, i } of sorted) {
    const p = pos.get(r.slot_id)!;
    const hit = runs.find(
      ({ run }) => run.first.date === r.date && run.first.room_id === r.room_id && pos.get(run.to.id)! + 1 === p && same(run.first, r),
    );
    if (hit) {
      hit.run.rows.push(r);
      hit.run.slotIds.push(r.slot_id);
      hit.run.to = slotOf.get(r.slot_id)!;
      hit.at = Math.min(hit.at, i);
    } else {
      const s = slotOf.get(r.slot_id)!;
      const entry = { run: { first: r, rows: [r], slotIds: [r.slot_id], from: s, to: s, range: "" }, at: i };
      runs.push(entry);
    }
  }
  return runs
    .sort((a, b) => a.at - b.at)
    .map(({ run }) => ({ ...run, range: slotSpan(run.from, run.to) }));
}
