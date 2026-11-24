import { IconAlert, IconCheck, IconX } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { classesOf, ordinal, type Cell } from "@/lib/classTimetable";
import { getEditorTimetable } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateTime, todayIST } from "@/lib/time";
import { setSemesterActive } from "../../actions/timetable";
import AreaTabs from "../AreaTabs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Active semesters", robots: { index: false } };

const BACK = "/admin/semesters";
const SEMESTERS = ["3", "4", "5", "6", "7", "8"];

type Status = { semester: string; active: boolean; updated_by: string; updated_at: string };

/**
 * Semesters 3 to 8, each active or switched off. Only the classes of active semesters show on the
 * site; a semester that is off keeps its timetable, hidden, until it is switched on again.
 */
export default async function Semesters() {
  const supabase = await createClient();
  const [statusRes, tt] = await Promise.all([
    supabase.from("semester_status").select("*").order("semester"),
    getEditorTimetable<Cell>(supabase, "get_timetable_all", addDays(todayIST(), 1)),
  ]);
  const ready = !statusRes.error;
  const status = new Map(((statusRes.data ?? []) as Status[]).map((s) => [s.semester, s]));

  // Each semester's sections and weekly class slots in the timetable from tomorrow
  const weekly = new Map<string, number>();
  const sections = new Map<string, Set<string>>();
  for (const c of tt.data ?? []) {
    if (c.is_department) continue;
    const keys = classesOf(c.subject);
    for (const sem of new Set(keys.map((k) => k[0]))) weekly.set(sem, (weekly.get(sem) ?? 0) + 1);
    for (const k of keys) if (k.length > 1) (sections.get(k[0]) ?? sections.set(k[0], new Set()).get(k[0])!).add(k);
  }
  const sems = [...new Set([...SEMESTERS, ...status.keys(), ...weekly.keys()])].sort();

  return (
    <div className="space-y-6">
      <AreaTabs area="semester" current={BACK} />
      <PageHeader
        title="Active semesters"
        subtitle="Choose which semesters' timetables are running. Only the classes of active semesters show on the site: home, room week, class timetables, free rooms, faculty free and busy, and everyone's My classes. A semester that is off keeps its timetable, hidden, and its rooms show as free. Switch it on again and its classes are back at once."
      />

      {!ready && (
        <p className="card flex items-start gap-2 p-4 text-sm">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          This needs database update 0044 (supabase/migrations/0044_active_semesters_and_my_classes.sql). Run it in the Supabase SQL Editor, then reload this page.
        </p>
      )}

      <section className="card overflow-x-auto">
        <table className="table-cards w-full sm:min-w-[640px]">
          <thead className="thead-ink">
            <tr>
              <th className="th">Semester</th>
              <th className="th">In the timetable</th>
              <th className="th">Status</th>
              <th className="th text-right">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
            {sems.map((sem) => {
              const st = status.get(sem);
              const active = st?.active ?? true;
              const n = weekly.get(sem) ?? 0;
              const secs = [...(sections.get(sem) ?? [])].sort();
              return (
                <tr key={sem}>
                  <td data-label="Semester" className="td font-medium">{ordinal(sem)}</td>
                  <td data-label="In the timetable" className="td text-sm">
                    {n === 0 ? (
                      <span className="muted">No classes yet</span>
                    ) : (
                      <>
                        {n} class slot{n === 1 ? "" : "s"} a week
                        {secs.length > 0 && <div className="muted text-xs">{secs.join(", ")}</div>}
                      </>
                    )}
                  </td>
                  <td data-label="Status" className="td text-sm">
                    {active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                        <IconCheck className="h-3.5 w-3.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                        <IconX className="h-3.5 w-3.5" /> Off
                      </span>
                    )}
                    {st?.updated_by && <div className="muted mt-1 text-xs">By {st.updated_by}, {formatDateTime(st.updated_at)}</div>}
                  </td>
                  <td data-label="Change" className="td">
                    <form action={setSemesterActive} className="flex justify-end">
                      <input type="hidden" name="back" value={BACK} />
                      <input type="hidden" name="semester" value={sem} />
                      <input type="hidden" name="active" value={active ? "false" : "true"} />
                      {active ? (
                        <SubmitButton
                          className="btn-secondary py-1.5 whitespace-nowrap"
                          pendingText="Switching off…"
                          message="Switching the semester off…"
                         
                          confirm={`Switch the ${ordinal(sem)} off? Its classes${n ? ` (${n} a week)` : ""} disappear from the site and their rooms show as free, until you switch it on again.`}
                          confirmLabel="Switch off"
                        >
                          Switch off
                        </SubmitButton>
                      ) : (
                        <SubmitButton className="btn-primary py-1.5 whitespace-nowrap" pendingText="Switching on…" message="Switching the semester on…">
                          Make active
                        </SubmitButton>
                      )}
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="muted text-sm">
        A class taught to two semesters together shows while either is active. Classes that name no semester (e.g. SKILL) and department slots always show. The room and
        class timetable editors still show every class, so you can prepare a semester before switching it on. To end a semester for good from a date, use End a
        semester&apos;s classes.
      </p>
    </div>
  );
}
