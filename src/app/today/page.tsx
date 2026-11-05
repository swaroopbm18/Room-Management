import ClosedDay from "@/components/ClosedDay";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import { buildClassTimetable, classesOf, ordinal, type Cell } from "@/lib/classTimetable";
import { getDayOrders, getDaySchedule, getHolidays, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DATE_RE, formatDate, isSunday, nextWorkingDay, slotEnded, todayIST, WEEKDAY_NAMES } from "@/lib/time";
import type { ScheduleRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Today for my class",
  description: "What's on today for a class in BMSCE's Department of Machine Learning: classes, cancelled classes and room changes.",
  alternates: { canonical: "/today" },
};

type DayCell = Omit<Cell, "weekday">;
type Line = { slotIds: number[]; subject: string; room: string; who: string | null; state: "on" | "cancelled" | "taken" | "extra"; note?: string };

const STATE: Record<Line["state"], { label: string; cls: string }> = {
  on: { label: "On", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  extra: { label: "Extra / moved", cls: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  taken: { label: "Room taken", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
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
    isSunday(date) || holidays.has(date) ? Promise.resolve([] as ScheduleRow[]) : getDaySchedule(date),
  ]);
  const { semesters, allClasses, chosen, label } = buildClassTimetable(((allRes.data ?? []) as Cell[]).filter((c) => classesOf(c.subject).length), slots, sp.class);
  const forMe = (subject: string | null) => !!subject && classesOf(subject).some((k) => k === chosen || k === chosen?.[0]);
  const rowAt = new Map(schedule.map((r) => [`${r.room_id}|${r.slot_id}`, r]));
  const order = new Map(slots.map((s, i) => [s.id, i]));

  const lines: Line[] = [];
  for (const c of ((dayRes.data ?? []) as DayCell[]).filter((c) => !c.is_department && forMe(c.subject))) {
    const r = rowAt.get(`${c.room_id}|${c.slot_id}`);
    if (!r) continue;
    const state: Line["state"] = r.status === "class" ? "on" : r.status === "free" ? "cancelled" : "taken";
    const note = state === "cancelled" ? (r.reason ?? undefined) : state === "taken" ? `${r.subject ?? "Booked"}${r.status === "cie" ? " (CIE)" : ""}` : undefined;
    lines.push({ slotIds: [c.slot_id], subject: c.subject, room: c.room_id, who: state === "on" ? r.faculty_name : null, state, note });
  }
  // Class bookings for this class in another room or slot
  for (const r of schedule.filter((r) => r.status === "booked" && forMe(r.subject))) {
    if (lines.some((l) => l.room === r.room_id && l.slotIds.includes(r.slot_id) && l.subject === r.subject)) continue;
    lines.push({ slotIds: [r.slot_id], subject: r.subject!, room: r.room_id, who: r.faculty_name, state: "extra" });
  }
  // Back-to-back slots of the same class read as one line, like a lab
  lines.sort((a, b) => (order.get(a.slotIds[0]) ?? 0) - (order.get(b.slotIds[0]) ?? 0) || a.subject.localeCompare(b.subject));
  const merged: Line[] = [];
  for (const l of lines) {
    const m = merged.find((x) => x.subject === l.subject && x.room === l.room && x.state === l.state && (order.get(x.slotIds[x.slotIds.length - 1]) ?? -9) + 1 === order.get(l.slotIds[0]));
    if (m) m.slotIds.push(...l.slotIds);
    else merged.push({ ...l, slotIds: [...l.slotIds] });
  }
  const changes = merged.filter((l) => l.state !== "on").length;
  const slotBy = new Map(slots.map((s) => [s.id, s]));
  const time = (ids: number[]) => `${slotBy.get(ids[0])?.label.split(" – ")[0]} – ${slotBy.get(ids[ids.length - 1])?.label.split(" – ")[1]}`;
  const next = nextWorkingDay(date, holidays);
  const href = (k: string, d = date) => `/today?class=${encodeURIComponent(k)}${d !== today ? `&date=${d}` : ""}`;
  const swap = orders.get(date);

  return (
    <div className="space-y-6">
      <PageHeader title="Today for my class" subtitle="Your class's day as it actually runs: classes on, cancelled or moved, and extra classes booked for you. Bookmark it for your class." />

      {allClasses.length > 0 && (
        <nav aria-label="Classes" className="card space-y-2 p-4">
          {semesters.map(({ sem, classes }) => (
            <div key={sem} className="flex flex-wrap items-center gap-1.5">
              <span className="muted w-full shrink-0 text-xs font-medium tracking-wide uppercase sm:w-28">{ordinal(sem)}</span>
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

      {isSunday(date) || holidays.has(date) ? (
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
                    {" "}
                    · {l.room}
                    {l.who && ` · ${l.who}`}
                  </span>
                  {l.note && <span className="muted block text-xs">{l.state === "taken" ? `Room booked for ${l.note}` : l.note}</span>}
                </span>
                <span className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${STATE[l.state].cls}`}>{done ? "Over" : STATE[l.state].label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
