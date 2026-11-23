import { IconAlert, IconCalendarCheck, IconRestore } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { classesOf, ordinal } from "@/lib/classTimetable";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime, isoDate, istNow, todayIST } from "@/lib/time";
import { endSemester, undoSemesterEnd } from "../../actions";
import AreaTabs from "../AreaTabs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Semester end", robots: { index: false } };

const BACK = "/admin/semester-end";

type Ended = { semester: string; last_day: string; created_by: string; created_at: string };

/** The semesters a subject is taught to: "DBMS-3B" → ["3"], "KDD-5" → ["5"]. */
const semestersOf = (subject: string) => [...new Set(classesOf(subject).map((k) => k[0]))];

/**
 * When a semester's classes end, its rooms are released: from the day after its last day the
 * timetable no longer has its classes, so the rooms show as free and can be requested.
 */
export default async function SemesterEnd() {
  const today = todayIST();
  const supabase = await createClient();
  const [{ data: version }, endedRes] = await Promise.all([
    supabase.rpc("version_on", { p_date: today }),
    supabase.from("semester_ends").select("*").order("semester"),
  ]);
  const ready = !endedRes.error;
  const ended = (endedRes.data ?? []) as Ended[];
  const versionId = (version as { id: number | null } | null)?.id;

  // Weekly class slots of each semester in today's timetable
  const { data: entries } = versionId
    ? await supabase.from("timetable_entries").select("subject").eq("version_id", versionId).eq("is_department", false)
    : { data: [] };
  const weekly = new Map<string, number>();
  for (const e of (entries ?? []) as { subject: string }[]) for (const sem of semestersOf(e.subject)) weekly.set(sem, (weekly.get(sem) ?? 0) + 1);
  const endedSet = new Set(ended.map((e) => e.semester));
  const running = [...weekly.keys()].filter((s) => !endedSet.has(s)).sort();

  return (
    <div className="space-y-6">
      <AreaTabs area="semester" current="/admin/semester-end" />
      <PageHeader
        title="Semester end"
        subtitle="When a semester's classes end, release its rooms. From the day after its last day, the timetable no longer shows that semester's classes, so its rooms are free and faculty can request them. Bookings made by faculty or admins stay. Past days keep the timetable they had."
      />

      {!ready && (
        <p className="card flex items-start gap-2 p-4 text-sm">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          This needs database update 0032 (supabase/migrations/0032_cie_coordinators_and_semester_end.sql). Run it in the Supabase SQL Editor, then reload this page.
        </p>
      )}

      <section className="card space-y-4 p-5">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
          <IconCalendarCheck className="h-5 w-5" /> End a semester&apos;s classes
        </h2>
        {running.length === 0 ? (
          <p className="muted text-sm">No semester in today&apos;s timetable has classes left to end.</p>
        ) : (
          <form action={endSemester} className="grid gap-4 sm:grid-cols-[14rem_12rem_auto] sm:items-end">
            <input type="hidden" name="back" value={BACK} />
            <div>
              <label className="label" htmlFor="semester">Semester</label>
              <select id="semester" name="semester" className="input" required>
                {running.map((s) => (
                  <option key={s} value={s}>
                    {ordinal(s)} · {weekly.get(s)} class slots a week
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="last_day">Last day of classes</label>
              <input id="last_day" name="last_day" type="date" required defaultValue={addDays(today, -1)} className="input" />
            </div>
            <SubmitButton
              className="btn-danger"
              pendingText="Releasing…"
              message="Releasing the semester's rooms…"
              confirm="End this semester's classes after the chosen day? Its classes leave the timetable from the next day (or from today, if that day has gone by), and its rooms show as free. You can undo it below."
              confirmLabel="End classes"
            >
              <IconCalendarCheck className="h-4 w-4" /> End classes and release rooms
            </SubmitButton>
          </form>
        )}
        <p className="muted text-xs">A class taught to two semesters together stays until both have ended.</p>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="thead-ink">
            <tr>
              <th className="th">Semester</th>
              <th className="th">Last day of classes</th>
              <th className="th">Rooms free from</th>
              <th className="th">Ended by</th>
              <th className="th text-right">Undo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
            {ended.length === 0 && (
              <tr>
                <td className="td muted" colSpan={5}>No semester has ended yet. Every semester&apos;s classes are in the timetable.</td>
              </tr>
            )}
            {ended.map((e) => {
              // Same as the database: the day after the last day, or the day it was ended if that was later
              const after = addDays(e.last_day, 1);
              const endedOn = isoDate(istNow(new Date(e.created_at)));
              const from = endedOn > after ? endedOn : after;
              return (
                <tr key={e.semester}>
                  <td className="td font-medium">{ordinal(e.semester)}</td>
                  <td className="td whitespace-nowrap">{formatDate(e.last_day)}</td>
                  <td className="td whitespace-nowrap">{formatDate(from)}</td>
                  <td className="td text-sm">
                    {e.created_by}
                    <div className="muted text-xs">{formatDateTime(e.created_at)}</div>
                  </td>
                  <td className="td">
                    <form action={undoSemesterEnd} className="flex justify-end">
                      <input type="hidden" name="back" value={BACK} />
                      <input type="hidden" name="semester" value={e.semester} />
                      <SubmitButton
                        className="btn-secondary py-1.5 whitespace-nowrap"
                        pendingText="Bringing back…"
                        message="Bringing the classes back…"
                        confirm={`Bring the ${ordinal(e.semester)} classes back into the timetable from ${formatDate(addDays(e.last_day, 1) > today ? addDays(e.last_day, 1) : today)}? Days already gone by stay as they were.`}
                        confirmLabel="Bring back"
                      >
                        <IconRestore className="h-4 w-4" /> Bring classes back
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
