import Link from "next/link";
import { STATUS_CELL, STATUS_LABEL } from "@/lib/status";
import type { Room, ScheduleRow, Slot, SlotStatus } from "@/lib/types";

const LEGEND: SlotStatus[] = ["class", "booked", "cie", "event", "department", "free"];

/**
 * Rooms × slots for one day, with subject and faculty in each cell. Scrolls both ways.
 * With `requestDate`, free cells that haven't ended link to the request form.
 */
export default function DayGrid({
  rooms,
  slots,
  rows,
  requestDate,
}: {
  rooms: Room[];
  slots: Slot[];
  rows: ScheduleRow[];
  requestDate?: string;
}) {
  const cell = new Map(rows.map((r) => [`${r.room_id}|${r.slot_id}`, r]));
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
          {requestDate ? "Click a free cell to request it. " : ""}Scroll sideways and down to see every room and slot. Faded cells have ended.
        </span>
      </div>
      <div className="max-h-[75vh] overflow-auto overscroll-contain">
        <table className="border-separate border-spacing-1.5 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 min-w-32 rounded-lg bg-brand-950 px-3 py-3 text-left text-xs font-semibold tracking-wide text-brand-100 uppercase">
                Room
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
            {rooms.map((r) => (
              <tr key={r.id}>
                <th className="sticky left-0 z-10 rounded-lg bg-brand-100 px-3 py-2 text-left font-semibold whitespace-nowrap text-brand-950 dark:bg-brand-950 dark:text-brand-100">
                  {r.name}
                </th>
                {slots.map((s) => {
                  const c = cell.get(`${r.id}|${s.id}`);
                  if (!c) return <td key={s.id} />;
                  const who = c.status === "department" ? `${c.subject} department` : c.faculty_name;
                  return (
                    <td
                      key={s.id}
                      title={[c.subject, who, c.reason].filter(Boolean).join("\n") || "Free"}
                      className={`h-20 max-w-48 min-w-44 rounded-lg px-3 py-2 align-top ${STATUS_CELL[c.status]} ${c.ended ? "opacity-45" : ""}`}
                    >
                      {c.status === "free" && requestDate && !c.ended ? (
                        <Link
                          href={`/request?room=${encodeURIComponent(r.id)}&date=${requestDate}&slot=${s.id}`}
                          className="group -mx-3 -my-2 flex h-[calc(100%+1rem)] flex-col items-center justify-center rounded-lg text-xs font-medium tracking-wide uppercase hover:bg-brand-600 hover:text-white dark:hover:bg-brand-500 dark:hover:text-black"
                        >
                          <span className="group-hover:hidden">Free</span>
                          <span className="hidden items-center gap-1 group-hover:inline-flex">+ Request</span>
                        </Link>
                      ) : c.status === "free" ? (
                        <div className="flex h-full items-center justify-center text-xs font-medium tracking-wide uppercase">Free</div>
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
