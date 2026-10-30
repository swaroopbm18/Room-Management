import Flash from "@/components/Flash";
import { IconCalendar, IconPlus, IconX } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getHolidays } from "@/lib/data";
import { addDays, formatDate, todayIST } from "@/lib/time";
import { addHoliday, removeHoliday } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Holidays({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const tomorrow = addDays(today, 1);
  const holidays = await getHolidays();
  const upcoming = [...holidays.entries()].filter(([d]) => d >= today).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-8">
      <PageHeader title="Holidays" subtitle="No regular classes are shown on a holiday, and it can't be booked. Holidays can be added from tomorrow on, and past holidays stay as they were." />
      <Flash msg={sp.msg} error={sp.error} />

      <section className="card space-y-4 p-6">
        <form action={addHoliday} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="back" value="/admin/holidays" />
          <div>
            <label className="label" htmlFor="h-date">Date</label>
            <input id="h-date" name="date" type="date" required min={tomorrow} className="input" />
          </div>
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="h-name">Name</label>
            <input id="h-name" name="name" required maxLength={80} className="input" placeholder="e.g. Kannada Rajyotsava" />
          </div>
          <SubmitButton pendingText="Adding…" message="Adding the holiday…">
            <IconPlus className="h-4 w-4" /> Add holiday
          </SubmitButton>
        </form>
        {upcoming.length > 0 ? (
          <ul className="divide-y divide-brand-100 rounded-lg border border-brand-100 dark:divide-brand-900 dark:border-brand-900">
            {upcoming.map(([d, name]) => (
              <li key={d} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <IconCalendar className="h-4 w-4 text-brand-500" />
                  <span className="font-medium">{formatDate(d, { weekday: "long" })}</span>
                  <span className="muted">· {name}</span>
                </span>
                {d > today ? (
                  <form action={removeHoliday}>
                    <input type="hidden" name="date" value={d} />
                    <input type="hidden" name="back" value="/admin/holidays" />
                    <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Removing…" message="Removing the holiday…">
                      <IconX className="h-3.5 w-3.5" /> Remove
                    </SubmitButton>
                  </form>
                ) : (
                  <span className="muted text-xs">Today</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">No upcoming holidays.</p>
        )}
      </section>
    </div>
  );
}
