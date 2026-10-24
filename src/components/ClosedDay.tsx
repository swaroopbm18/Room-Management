import { IconCalendar } from "./Icons";
import PendingLink from "./PendingLink";
import { formatDate } from "@/lib/time";

/** Shown instead of the timetable on a Sunday or a holiday, with a way to see the next working day. */
export default function ClosedDay({ date, holiday, nextHref, nextDate }: { date: string; holiday?: string; nextHref?: string; nextDate?: string }) {
  return (
    <section className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-200">
        <IconCalendar className="h-7 w-7" />
      </span>
      <div>
        <h2 className="text-xl font-semibold">{holiday ? `Holiday: ${holiday}` : "It's Sunday"}</h2>
        <p className="muted mt-1">
          {holiday
            ? `No classes on ${formatDate(date, { weekday: "long" })}, and no room can be booked on a holiday.`
            : `No classes on ${formatDate(date, { weekday: "long" })}.`}{" "}
          All rooms follow the regular timetable again on the next working day.
        </p>
      </div>
      {nextHref && nextDate && (
        <PendingLink href={nextHref} className="btn-primary">
          See {formatDate(nextDate, { weekday: "long", year: undefined })} →
        </PendingLink>
      )}
    </section>
  );
}
