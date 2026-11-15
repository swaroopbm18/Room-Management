import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import { ALL_CLASSES, classDay, LINE_STATE, type ClassLine } from "@/lib/classDay";
import { ordinal, type Cell } from "@/lib/classTimetable";
import { getClassSemesters, getDayOrders, getHolidays, getSlots } from "@/lib/data";
import type { ScheduleRow } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, isClosedSunday, slotEnded, todayIST, WEEKDAY_NAMES } from "@/lib/time";
import ClassTabs from "@/components/ClassTabs";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Class changes",
  description: "Classes cancelled, moved, taken by another faculty member or replaced by an event or CIE in the coming days, for every class in BMSCE's Department of Machine Learning.",
  alternates: { canonical: "/classes/changes" },
};

const DAYS_AHEAD = 7;

/**
 * Classes altered in the coming days, for one class or all of them: cancelled (dropped, or a
 * CIE day), the room taken by an event or CIE, taken by another faculty member (a substitute
 * or class exchange), or an extra class. Open to everyone, students included.
 */
export default async function ClassChanges({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const [slots, holidays, orders] = await Promise.all([getSlots(), getHolidays(), getDayOrders()]);
  const supabase = await createClient();
  const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)).filter((d) => !isClosedSunday(d));
  // The class list, and every day's timetable and room schedule in one call
  const [semesters, { data: dayData, error }] = await Promise.all([
    getClassSemesters(today),
    supabase.rpc("get_class_days", { p_from: dates[0], p_to: dates[dates.length - 1] }),
  ]);
  if (error) throw new Error(error.message);
  const allClasses = semesters.flatMap((x) => x.classes);
  const label = (k: string) => (k.length === 1 ? `Semester ${k} (all sections)` : `Class ${k}`);
  const requested = String(sp.class ?? "").toUpperCase();
  const chosen = allClasses.includes(requested) ? requested : ALL_CLASSES;

  const byDay = new Map(((dayData ?? []) as { day: string; timetable: Omit<Cell, "weekday">[]; schedule: ScheduleRow[] }[]).map((d) => [d.day, d]));
  const days = dates.map((date) => {
    if (holidays.has(date)) return { date, holiday: holidays.get(date)!, lines: [] as ClassLine[] };
    const d = byDay.get(date);
    const lines = d ? classDay(chosen, d.timetable, d.schedule, slots).filter((l) => l.state !== "on") : [];
    return { date, holiday: null, lines };
  });
  const total = days.reduce((n, d) => n + d.lines.length, 0);
  const slotBy = new Map(slots.map((s) => [s.id, s]));
  const time = (ids: number[]) => `${slotBy.get(ids[0])?.label.split(" – ")[0]} – ${slotBy.get(ids[ids.length - 1])?.label.split(" – ")[1]}`;
  const chip = (k: string, text: string) => (
    <PendingLink
      key={k}
      href={k === ALL_CLASSES ? "/classes/changes" : `/classes/changes?class=${encodeURIComponent(k)}`}
      aria-current={k === chosen ? "page" : undefined}
      className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
        k === chosen ? "bg-brand-600 text-white dark:bg-brand-500 dark:text-black" : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"
      }`}
    >
      {text}
    </PendingLink>
  );

  return (
    <div className="space-y-6">
      <ClassTabs view="changes" cls={chosen} />
      <PageHeader title="Class timetables" subtitle={`Classes cancelled, moved, taken by another faculty member or replaced by an event or CIE over the next ${DAYS_AHEAD} days. Pick your class to see only its changes.`} />

      {allClasses.length > 0 && (
        <nav aria-label="Classes" className="card space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="muted w-full shrink-0 text-xs font-medium tracking-wide uppercase sm:w-28">Show</span>
            {chip(ALL_CLASSES, "All classes")}
          </div>
          {semesters.map(({ sem, classes }) => (
            <div key={sem} className="flex flex-wrap items-center gap-1.5">
              <span className="muted w-full shrink-0 text-xs font-medium tracking-wide uppercase sm:w-28">{ordinal(sem)}</span>
              {classes.map((k) => chip(k, k.length === 1 ? "All sections" : k))}
            </div>
          ))}
        </nav>
      )}

      <h2 className="text-lg font-semibold">
        {chosen === ALL_CLASSES ? "All classes" : label(chosen)}
        <span
          className={`ml-2 rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${total ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}
        >
          {total ? `${total} change${total === 1 ? "" : "s"}` : "No changes"}
        </span>
      </h2>

      <div className="space-y-4">
        {days.map((d) => {
          const swap = orders.get(d.date);
          return (
            <section key={d.date} className="card overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-100 bg-brand-50/60 px-4 py-2.5 dark:border-brand-900 dark:bg-brand-950/40">
                <h3 className="font-semibold">
                  {d.date === today ? "Today" : formatDate(d.date, { weekday: "long", year: undefined })}
                  {d.date === today && <span className="muted text-sm font-normal"> · {formatDate(d.date, { weekday: "long", year: undefined })}</span>}
                </h3>
                <span className="muted text-xs">
                  {d.holiday ? `Holiday: ${d.holiday}` : swap ? `Runs ${WEEKDAY_NAMES[swap.follows - 1]}'s timetable` : d.lines.length ? `${d.lines.length} change${d.lines.length === 1 ? "" : "s"}` : "Classes as usual"}
                </span>
              </div>
              {d.lines.length > 0 && (
                <ol className="divide-y divide-brand-100 dark:divide-brand-900">
                  {d.lines.map((l, i) => {
                    const done = slotEnded(d.date, slotBy.get(l.slotIds[l.slotIds.length - 1])!);
                    return (
                      <li key={i} className={`grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] ${done ? "opacity-60" : ""}`}>
                        <span className="text-sm font-medium tabular-nums">{time(l.slotIds)}</span>
                        <span className="min-w-0">
                          <span className={`font-semibold ${l.state === "cancelled" ? "line-through" : ""}`}>{l.subject}</span>
                          <span className="muted text-sm">
                            {" "}
                            · {l.room}
                            {l.who && ` · ${l.who}`}
                          </span>
                          {l.note && <span className="muted block text-xs">{l.state === "taken" ? `Room booked for ${l.note}` : l.note}</span>}
                        </span>
                        <span className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${LINE_STATE[l.state].cls}`}>{done ? "Over" : LINE_STATE[l.state].label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
