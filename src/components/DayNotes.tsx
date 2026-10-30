import { IconMegaphone, IconSwap } from "./Icons";
import type { DayOrder, Notice } from "@/lib/data";
import { formatDate, WEEKDAY_NAMES } from "@/lib/time";

/** The admins' notices running today, and a day swap on the chosen date. */
export default function DayNotes({ notices, today, date, order }: { notices: Notice[]; today: string; date: string; order?: DayOrder }) {
  const live = notices.filter((n) => n.starts_on <= today && today <= n.ends_on);
  if (!live.length && !order) return null;
  return (
    <section className="space-y-2" aria-label="Notices">
      {live.map((n) => (
        <div key={n.id} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <IconMegaphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="whitespace-pre-wrap">{n.message}</p>
        </div>
      ))}
      {order && (
        <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950 dark:border-brand-900 dark:bg-brand-950/60 dark:text-brand-100">
          <IconSwap className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
          <p>
            <span className="font-semibold">
              {formatDate(date, { weekday: "long", year: undefined })} follows {WEEKDAY_NAMES[order.follows - 1]}&apos;s timetable.
            </span>
            {order.note && <span className="muted"> {order.note}</span>}
          </p>
        </div>
      )}
    </section>
  );
}
