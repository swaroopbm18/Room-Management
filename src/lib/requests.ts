import type { RequestGroup, RequestRow, Slot } from "./types";
import { minutes } from "./time";

/** Collapse per-slot request rows into one entry per request, keeping the input order. */
export function groupRequests(rows: RequestRow[], slotById: Map<number, Slot>): RequestGroup[] {
  const byGroup = new Map<string, RequestRow[]>();
  for (const r of rows) byGroup.set(r.group_id, [...(byGroup.get(r.group_id) ?? []), r]);
  return [...byGroup.entries()].map(([group_id, rs]) => {
    const sorted = [...rs].sort((a, b) => minutes(slotById.get(a.slot_id)!.starts) - minutes(slotById.get(b.slot_id)!.starts));
    const first = slotById.get(sorted[0].slot_id)!;
    const last = slotById.get(sorted[sorted.length - 1].slot_id)!;
    return {
      group_id,
      rows: sorted,
      first: sorted[0],
      slotIds: sorted.map((r) => r.slot_id),
      range: `${first.label.split(" – ")[0]} – ${last.label.split(" – ")[1]}`,
    };
  });
}

export function slotCount(g: RequestGroup): string {
  return g.rows.length === 1 ? "1 slot" : `${g.rows.length} slots`;
}
