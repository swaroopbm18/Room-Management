import GetForm from "@/components/GetForm";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import PrintButton from "@/components/PrintButton";
import { ALL_CLASSES, classDay, LINE_STATE, type ClassLine } from "@/lib/classDay";
import type { Cell } from "@/lib/classTimetable";
import { getClassSemesters, getHolidays, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { addDays, DATE_RE, formatDate, formatDateTime, isClosedSunday, todayIST } from "@/lib/time";
import type { ScheduleRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Class changes to share", robots: { index: false } };

/**
 * Every class change between two dates (released, moved, taken, cancelled, extra classes), for all
 * classes or one, laid out to print or save as a PDF and share with faculty and students.
 */
export default async function ClassChangesPrint({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; class?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const start = sp.start && DATE_RE.test(sp.start) ? sp.start : today;
  const endRaw = sp.end && DATE_RE.test(sp.end) && sp.end >= start ? sp.end : addDays(start, 6);
  const end = endRaw > addDays(start, 30) ? addDays(start, 30) : endRaw;
  const supabase = await createClient();
  const [slots, holidays, semesters, { data, error }] = await Promise.all([
    getSlots(),
    getHolidays(),
    getClassSemesters(start),
    supabase.rpc("get_class_days", { p_from: start, p_to: end }),
  ]);
  if (error) throw new Error(error.message);
  const allClasses = semesters.flatMap((x) => x.classes);
  const requested = String(sp.class ?? "").toUpperCase();
  const chosen = allClasses.includes(requested) ? requested : ALL_CLASSES;
  const byDay = new Map(((data ?? []) as { day: string; timetable: Omit<Cell, "weekday">[]; schedule: ScheduleRow[] }[]).map((d) => [d.day, d]));
  const days: { date: string; holiday?: string; lines: ClassLine[] }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isClosedSunday(d)) continue;
    if (holidays.has(d)) {
      days.push({ date: d, holiday: holidays.get(d), lines: [] });
      continue;
    }
    const day = byDay.get(d);
    days.push({ date: d, lines: day ? classDay(chosen, day.timetable, day.schedule, slots).filter((l) => l.state !== "on") : [] });
  }
  const slotBy = new Map(slots.map((s) => [s.id, s]));
  const time = (ids: number[]) => `${slotBy.get(ids[0])?.label.split(" – ")[0]} – ${slotBy.get(ids[ids.length - 1])?.label.split(" – ")[1]}`;
  const total = days.reduce((n, d) => n + d.lines.length, 0);
  const who = chosen === ALL_CLASSES ? "All classes" : `Class ${chosen}`;

  return (
    <div className="space-y-6">
      <div className="space-y-4 print:hidden">
        <PageHeader
          title="Class changes to share"
          subtitle="Every class released, moved, taken or cancelled, and every extra class, between two dates. Print it or save it as a PDF to share with faculty and students; pick a class for a sheet for one section."
        >
          <PendingLink href="/admin/affected" className="btn-secondary py-2">‹ Affected classes</PendingLink>
        </PageHeader>
        <GetForm className="card flex flex-wrap items-end gap-3 p-4" message="Preparing the sheet…">
          <div>
            <label className="label" htmlFor="start">From date</label>
            <input id="start" type="date" name="start" defaultValue={start} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="end">To date</label>
            <input id="end" type="date" name="end" defaultValue={end} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="class">Class</label>
            <select id="class" name="class" defaultValue={chosen === ALL_CLASSES ? "" : chosen} className="input">
              <option value="">All classes</option>
              {allClasses.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <button className="btn-secondary">Show</button>
          <PrintButton label="Print / save as PDF" className="btn-primary ml-auto" />
        </GetForm>
      </div>

      <article className="card p-6 print:border-0 print:p-0 print:shadow-none">
        <header className="mb-4 text-center">
          <div className="text-lg font-semibold">B.M.S. College of Engineering, Bengaluru</div>
          <div className="text-sm">Department of Machine Learning</div>
          <div className="mt-2 text-base font-semibold">Class and room changes: {who}</div>
          <div className="muted mt-1 text-xs print:text-black">
            {formatDate(start)} to {formatDate(end)} · {total} {total === 1 ? "change" : "changes"} · Generated {formatDateTime(new Date().toISOString())}
          </div>
        </header>

        <table className="report-table w-full border-collapse text-sm">
          <thead>
            <tr>
              <th>Day</th>
              <th>Time</th>
              <th>Class</th>
              <th>Room</th>
              <th>Faculty</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {total === 0 && !days.some((d) => d.holiday) && (
              <tr>
                <td colSpan={6} className="text-center">Classes as usual: no changes in this period.</td>
              </tr>
            )}
            {days.map((d) =>
              d.holiday ? (
                <tr key={d.date}>
                  <td className="whitespace-nowrap">{formatDate(d.date, { weekday: "short", year: undefined })}</td>
                  <td colSpan={5}>Holiday: {d.holiday}</td>
                </tr>
              ) : (
                d.lines.map((l, i) => (
                  <tr key={`${d.date}-${i}`} className={i === 0 ? "border-t-2" : ""}>
                    <td className="whitespace-nowrap">{i === 0 ? formatDate(d.date, { weekday: "short", year: undefined }) : ""}</td>
                    <td className="whitespace-nowrap">{time(l.slotIds)}</td>
                    <td className={l.state === "cancelled" || l.state === "taken" ? "line-through decoration-1" : ""}>{l.subject}</td>
                    <td>{l.room || "–"}</td>
                    <td>{l.who ?? ""}</td>
                    <td>
                      <span className="font-medium">{released(l) ? "Released" : LINE_STATE[l.state].label}</span>
                      {l.note ? `: ${l.note.replace(/^Class dropped: /, "")}` : ""}
                    </td>
                  </tr>
                ))
              ),
            )}
          </tbody>
        </table>
        <p className="muted mt-4 text-xs print:text-black">
          &quot;Released&quot;: the section is at a skill lab or event then, so its class is not held. &quot;Room taken&quot;: the room is in use and the class has not been given another room yet. &quot;Extra / moved&quot;: an extra class, or a class moved to the room and time shown.
        </p>
      </article>
    </div>
  );
}

/** A class not held because its section is at a skill lab or event ("3D at Skill Lab"). */
const released = (l: ClassLine) => l.state === "cancelled" && /^(?:Class dropped: )?(?:\d[A-Z]?(?:\/\d[A-Z]?)* at |At )/.test(l.note ?? "");
