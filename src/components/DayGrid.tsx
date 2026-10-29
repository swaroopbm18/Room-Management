import Link from "next/link";
import { STATUS_CELL, STATUS_LABEL } from "@/lib/status";
import type { PublicRequest, Room, ScheduleRow, Slot, SlotStatus } from "@/lib/types";

const LEGEND: SlotStatus[] = ["class", "booked", "cie", "event", "department", "free"];

/** One row of the grid: a room (day view) or a day (room week view). */
export type GridRow = {
  key: string;
  label: React.ReactNode;
  cells: Map<number, ScheduleRow>;
  /** When set, every cell opens that slot's page (what's on, its requests) for this date. */
  date?: string;
  /** When set, free cells that haven't ended can be requested on this date. */
  requestDate?: string;
  /** Pending requests per slot id, shown as a count on the cell. */
  pending?: Map<number, number>;
  /** Shown across the whole row instead of cells, e.g. for a holiday. */
  note?: string;
};

/**
 * Rooms × slots for one day, with subject and faculty in each cell. Scrolls both ways.
 * With `date`, cells open the slot's page; with `requestDate`, free cells can be requested from there.
 */
export default function DayGrid({
  rooms,
  slots,
  rows,
  date,
  requestDate,
  requests,
}: {
  rooms: Room[];
  slots: Slot[];
  rows: ScheduleRow[];
  date?: string;
  requestDate?: string;
  requests?: PublicRequest[] | null;
}) {
  const gridRows: GridRow[] = rooms.map((r) => ({
    key: r.id,
    label: r.name,
    cells: new Map(rows.filter((x) => x.room_id === r.id).map((x) => [x.slot_id, x])),
    date,
    requestDate,
    pending: requests ? pendingBySlot(requests.filter((x) => x.room_id === r.id)) : undefined,
  }));
  return <ScheduleGrid corner="Room" slots={slots} rows={gridRows} hint="Scroll sideways and down to see every room and slot. Faded cells have ended." />;
}

/** Pending requests per slot id. */
export function pendingBySlot(requests: PublicRequest[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of requests) if (r.status === "pending") m.set(r.slot_id, (m.get(r.slot_id) ?? 0) + 1);
  return m;
}

export const slotHref = (room: string, date: string, slot: number) => `/slot?room=${encodeURIComponent(room)}&date=${date}&slot=${slot}`;

/** The shared grid: one row per entry, one column per slot. */
export function ScheduleGrid({ corner, slots, rows, hint }: { corner: string; slots: Slot[]; rows: GridRow[]; hint: string }) {
  const requestable = rows.some((r) => r.requestDate);
  const clickable = rows.some((r) => r.date);
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-100 px-4 py-3 text-xs dark:border-brand-900/70">
        {LEGEND.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-3.5 w-5 rounded ${STATUS_CELL[s]}`} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="muted ml-auto hidden sm:inline">
          {requestable ? "Click a free cell to request it. " : clickable ? "Click a cell to see its requests. " : ""}
          {hint}
        </span>
      </div>
      <div className="max-h-[75vh] overflow-auto overscroll-contain">
        <table className="border-separate border-spacing-1.5 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 min-w-32 rounded-lg bg-brand-950 px-3 py-3 text-left text-xs font-semibold tracking-wide text-brand-100 uppercase">
                {corner}
              </th>
              {slots.map((s) => (
                <th key={s.id} className="sticky top-0 z-10 min-w-44 rounded-lg bg-brand-900 px-3 py-2 text-left font-medium whitespace-nowrap text-white dark:bg-brand-950">
                  <div className="text-sm">{s.label.split(" – ")[0]}</div>
                  <div className="text-[11px] font-normal text-brand-300">to {s.label.split(" – ")[1]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th className="sticky left-0 z-10 rounded-lg bg-brand-100 px-3 py-2 text-left font-semibold whitespace-nowrap text-brand-950 dark:bg-brand-950 dark:text-brand-100">
                  {r.label}
                </th>
                {r.note && (
                  <td colSpan={slots.length} className="h-20 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                    {r.note}
                  </td>
                )}
                {!r.note && slots.map((s) => {
                  const c = r.cells.get(s.id);
                  if (!c) return <td key={s.id} />;
                  const who = c.status === "department" ? `${c.subject} department` : c.faculty_name;
                  const n = r.pending?.get(s.id) ?? 0;
                  const body =
                    c.status === "free" ? (
                      <div className="flex h-full min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium tracking-wide uppercase">
                        {r.date && r.requestDate && !c.ended ? (
                          <>
                            <span className="group-hover:hidden">Free</span>
                            <span className="hidden items-center gap-1 group-hover:inline-flex">+ Request</span>
                          </>
                        ) : (
                          <span>Free</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate font-semibold">{c.subject}</span>
                          {c.status !== "class" && c.status !== "department" && (
                            <span className="shrink-0 rounded bg-black/15 px-1 text-[10px] font-semibold uppercase dark:bg-white/20">{STATUS_LABEL[c.status]}</span>
                          )}
                        </div>
                        {who && <div className="mt-0.5 line-clamp-2 text-xs leading-snug opacity-85">{who}</div>}
                        {c.reason && <div className="mt-0.5 truncate text-[11px] opacity-70">{c.reason}</div>}
                      </>
                    );
                  const chip = n > 0 && (
                    <span className="absolute right-1.5 bottom-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-amber-950 normal-case">
                      {n} {n === 1 ? "request" : "requests"}
                    </span>
                  );
                  return (
                    <td
                      key={s.id}
                      title={[c.subject, who, c.reason].filter(Boolean).join("\n") || "Free"}
                      className={`relative h-20 max-w-48 min-w-44 rounded-lg align-top ${STATUS_CELL[c.status]} ${c.ended ? "opacity-45" : ""} ${r.date ? "p-0" : "px-3 py-2"}`}
                    >
                      {r.date ? (
                        <Link
                          href={slotHref(c.room_id, r.date, s.id)}
                          className={`group block h-full min-h-20 rounded-lg px-3 py-2 transition hover:ring-2 hover:ring-brand-400 ${
                            c.status === "free" && r.requestDate && !c.ended ? "hover:bg-brand-600 hover:text-white dark:hover:bg-brand-500 dark:hover:text-black" : ""
                          }`}
                        >
                          {body}
                          {chip}
                        </Link>
                      ) : (
                        <>
                          {body}
                          {chip}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
