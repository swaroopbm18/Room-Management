import { cellKey, DAY_NAMES, DAY_SLOTS, DAYS, isOpen, type Busy } from "@/lib/faculty";
import type { Slot } from "@/lib/types";
import { setFacultyDuty } from "@/app/actions";
import { IconX } from "./Icons";
import SubmitButton from "./SubmitButton";

/**
 * One faculty member's week, Monday to Saturday: classes, other duties, free slots and clashes.
 * Pass `edit` (admins) to show a ✕ that clears each duty.
 */
export default function WeekTable({ week, slots, edit }: { week?: Map<string, Busy[]>; slots: Slot[]; edit?: { initials: string; back: string } }) {
  const shownSlots = slots.filter((s) => DAY_SLOTS.includes(s.id) || DAYS.some((_, i) => week?.get(cellKey(i + 1, s.id))?.length));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-1 p-2 text-xs">
        <thead>
          <tr>
            <th className="w-24 rounded-md bg-brand-950 px-2 py-2 text-left font-semibold text-brand-100">Day</th>
            {shownSlots.map((s) => (
              <th key={s.id} className="rounded-md bg-brand-900 px-2 py-2 text-left font-medium whitespace-nowrap text-white dark:bg-brand-950">
                {s.label.split(" – ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_NAMES.map((d, i) => (
            <tr key={d}>
              <th className="rounded-md bg-brand-100 px-2 py-2 text-left font-semibold text-brand-950 dark:bg-brand-950 dark:text-brand-100">{d}</th>
              {shownSlots.map((s) => {
                const b = week?.get(cellKey(i + 1, s.id)) ?? [];
                const open = isOpen(i + 1, s.id);
                const cls = b.some((x) => x.source === "timetable")
                  ? "bg-brand-600 text-white dark:bg-brand-700"
                  : b.length
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                    : open
                      ? "bg-brand-50 text-brand-400 dark:bg-brand-950/40 dark:text-brand-700"
                      : "border border-dashed border-brand-200 text-brand-300 dark:border-brand-900 dark:text-brand-800";
                return (
                  <td key={s.id} className={`h-12 rounded-md px-2 py-1 align-top ${cls}`}>
                    {b.length === 0
                      ? open
                        ? "Free"
                        : "No classes"
                      : b.map((x, j) => (
                          <div key={j} className={`${b.length > 1 ? "font-medium" : ""} ${edit && x.source === "duty" ? "flex items-start justify-between gap-1" : ""}`}>
                            <span className="font-semibold">{x.activity}</span>
                            {edit && x.source === "duty" && (
                              <form action={setFacultyDuty}>
                                <input type="hidden" name="initials" value={edit.initials} />
                                <input type="hidden" name="weekday" value={i + 1} />
                                <input type="hidden" name="from" value={s.id} />
                                <input type="hidden" name="to" value={s.id} />
                                <input type="hidden" name="activity" value="" />
                                <input type="hidden" name="back" value={edit.back} />
                                <SubmitButton
                                  className="rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900"
                                  pendingText=""
                                  message="Clearing the duty…"
                                  aria-label={`Clear ${x.activity} on ${d} at ${s.label.split(" – ")[0]}`}
                                  title="Clear this duty"
                                >
                                  <IconX className="h-3 w-3" />
                                </SubmitButton>
                              </form>
                            )}
                            {x.room && <span className="block opacity-80">{x.room}</span>}
                          </div>
                        ))}
                    {b.length > 1 && <span className="mt-0.5 block text-[10px] font-semibold uppercase">Clash</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
