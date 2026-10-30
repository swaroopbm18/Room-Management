import type { Span } from "@/lib/classTimetable";
import { DAY_NAMES } from "@/lib/faculty";
import type { Slot } from "@/lib/types";
import { slotOpen } from "@/lib/time";

/** A class's week, days × slots, to read only: subject, faculty and room in each slot. */
export default function ClassWeek({ slots, days, names }: { slots: Slot[]; days: Span[][]; names: Record<string, string> }) {
  return (
    <div className="card overflow-hidden">
      <div className="max-h-[75vh] overflow-auto overscroll-contain">
        <table className="border-separate border-spacing-1.5 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 rounded-lg bg-brand-950 px-3 py-3 text-left text-xs font-semibold tracking-wide text-brand-100 uppercase sm:min-w-24">Day</th>
              {slots.map((s) => (
                <th key={s.id} className="sticky top-0 z-10 min-w-36 rounded-lg bg-brand-900 px-3 py-2 text-left font-medium whitespace-nowrap text-white dark:bg-brand-950">
                  <div className="text-sm">{s.label.split(" – ")[0]}</div>
                  <div className="text-[11px] font-normal text-brand-300">to {s.label.split(" – ")[1]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((spans, i) => (
              <tr key={i}>
                <th className="sticky left-0 z-10 rounded-lg bg-brand-100 px-3 py-2 text-left font-semibold whitespace-nowrap text-brand-950 dark:bg-brand-950 dark:text-brand-100">
                  <span className="sm:hidden">{DAY_NAMES[i].slice(0, 3)}</span>
                  <span className="hidden sm:inline">{DAY_NAMES[i]}</span>
                </th>
                {spans.map((span) =>
                  span.entries.length === 0 && !slotOpen(span.weekday, slots.find((s) => s.id === span.slotIds[0])!) ? (
                    <td key={span.slotIds[0]} title="Saturday classes end at 2 PM" className="h-16 min-w-36 rounded-lg text-center text-xs text-brand-300 dark:text-brand-800">
                      No classes
                    </td>
                  ) : span.entries.length === 0 ? (
                    <td key={span.slotIds[0]} className="h-16 min-w-36 rounded-lg border border-dashed border-brand-200 text-center text-xs tracking-wide text-brand-400 uppercase dark:border-brand-900 dark:text-brand-700">
                      Free
                    </td>
                  ) : (
                    <td key={span.slotIds[0]} colSpan={span.slotIds.length} className="h-16 min-w-36 rounded-lg bg-brand-100 px-2 py-1.5 align-top text-brand-950 dark:bg-brand-900/60 dark:text-brand-50">
                      <div className="divide-y divide-brand-200/70 dark:divide-brand-800/70">
                        {span.entries.map((e) => (
                          <div key={e.room + e.subject} className="py-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="font-semibold">{e.subject}</span>
                              {e.wholeSemester && <span className="rounded bg-black/10 px-1 text-[10px] font-semibold uppercase dark:bg-white/15">All sections</span>}
                            </div>
                            <div className="mt-0.5 text-xs">{e.initials.map((x) => names[x] ?? x).join(", ") || "No faculty"}</div>
                            <div className="mt-0.5 text-[11px] opacity-70">Room {e.room}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
