import AutoRefresh from "@/components/AutoRefresh";
import ClosedDay from "@/components/ClosedDay";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import { buildClassTimetable, classesOf, ordinal, type Cell } from "@/lib/classTimetable";
import { classDay, LINE_STATE } from "@/lib/classDay";
import { getDayOrders, getDaySchedule, getHolidays, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DATE_RE, formatDate, isClosedSunday, nextWorkingDay, slotEnded, todayIST, WEEKDAY_NAMES } from "@/lib/time";
import type { ScheduleRow } from "@/lib/types";
import ClassTabs from "@/components/ClassTabs";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Today for my class",
  description: "What's on today for a class in BMSCE's Department of Machine Learning: classes, cancelled classes and room changes.",
  alternates: { canonical: "/today" },
};

/** One class's day as it actually runs: its classes, those cancelled or moved, and extra classes. */
export default async function Today({ searchParams }: { searchParams: Promise<{ class?: string; date?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const [slots, holidays, orders] = await Promise.all([getSlots(), getHolidays(), getDayOrders()]);
  const date = sp.date && DATE_RE.test(sp.date) && sp.date >= today ? sp.date : today;
  const supabase = await createClient();
  const [allRes, dayRes, schedule] = await Promise.all([
    supabase.rpc("get_timetable_all", { p_date: date }),
    supabase.rpc("get_timetable", { p_date: date }),
    isClosedSunday(date) || holidays.has(date) ? Promise.resolve([] as ScheduleRow[]) : getDaySchedule(date),
  ]);
  const { semesters, allClasses, chosen, label } = buildClassTimetable(((allRes.data ?? []) as Cell[]).filter((c) => classesOf(c.subject).length), slots, sp.class);
  const merged = classDay(chosen, (dayRes.data ?? []) as Omit<Cell, "weekday">[], schedule, slots);
  const changes = merged.filter((l) => l.state !== "on").length;
  const slotBy = new Map(slots.map((s) => [s.id, s]));
  const time = (ids: number[]) => `${slotBy.get(ids[0])?.label.split(" – ")[0]} – ${slotBy.get(ids[ids.length - 1])?.label.split(" – ")[1]}`;
  const next = nextWorkingDay(date, holidays);
  const href = (k: string, d = date) => `/today?class=${encodeURIComponent(k)}${d !== today ? `&date=${d}` : ""}`;
  const swap = orders.get(date);

  return (
    <div className="space-y-6">
      <AutoRefresh every={120} />
      <ClassTabs view="today" cls={chosen} />
      <PageHeader title="Class timetables" subtitle="Your class's day as it actually runs: classes on, cancelled or moved, and extra classes booked for you. Bookmark it for your class." />

      {allClasses.length > 0 && (
        <nav aria-label="Classes" className="card space-y-2 p-4">
          {semesters.map(({ sem, classes }) => (
            <div key={sem} className="flex flex-wrap items-center gap-1.5">
              <span className="muted w-full shrink-0 text-xs font-medium sm:w-28">{ordinal(sem)}</span>
              {classes.map((k) => (
                <PendingLink
                  key={k}
                  href={href(k)}
                  aria-current={k === chosen ? "page" : undefined}
                  className={`rounded-lg px-3 py-1 text-sm font-medium transition ${k === chosen ? "bg-brand-600 text-white dark:bg-brand-500 dark:text-black" : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"}`}
                >
                  {k.length === 1 ? "All sections" : k}
                </PendingLink>
              ))}
            </div>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {chosen ? label(chosen) : "Your class"} · {date === today ? "Today" : formatDate(date, { weekday: "long", year: undefined })}
          {changes > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{changes} change{changes === 1 ? "" : "s"}</span>}
        </h2>
        <div className="flex gap-1.5 text-sm">
          {date !== today && (
            <PendingLink href={href(chosen ?? "", today)} className="btn-secondary py-1.5">
              Today
            </PendingLink>
          )}
          <PendingLink href={href(chosen ?? "", next)} className="btn-secondary py-1.5">
            {formatDate(next, { weekday: "long", year: undefined, month: undefined })} →
          </PendingLink>
        </div>
      </div>
      {swap && <p className="card p-3 text-sm">This day follows {WEEKDAY_NAMES[swap.follows - 1]}&apos;s timetable{swap.note ? `: ${swap.note}` : "."}</p>}

      {isClosedSunday(date) || holidays.has(date) ? (
        <ClosedDay date={date} holiday={holidays.get(date)} nextHref={href(chosen ?? "", next)} nextDate={next} />
      ) : merged.length === 0 ? (
        <p className="card muted p-6 text-sm">No classes for {chosen ? label(chosen) : "this class"} on this day.</p>
      ) : (
        <ol className="card divide-y divide-brand-100 dark:divide-brand-900">
          {merged.map((l, i) => {
            const done = slotEnded(date, slotBy.get(l.slotIds[l.slotIds.length - 1])!);
            return (
              <li key={i} className={`grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] ${done ? "opacity-60" : ""}`}>
                <span className="text-sm font-medium tabular-nums">{time(l.slotIds)}</span>
                <span className="min-w-0">
                  <span className={`font-semibold ${l.state === "cancelled" ? "line-through" : ""}`}>{l.subject}</span>
                  <span className="muted text-sm">
                    {l.room && ` · ${l.room}`}
                    {l.who && ` · ${l.who}`}
                  </span>
                  {l.note && <span className="muted block text-xs">{l.state === "taken" ? `Room booked for ${l.note}` : l.note}</span>}
                </span>
                <span className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${LINE_STATE[l.state].cls}`}>{done ? "Over" : l.state === "exam" ? l.note!.slice(0, 3) : LINE_STATE[l.state].label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
