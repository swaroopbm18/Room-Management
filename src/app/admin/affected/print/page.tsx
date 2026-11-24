import GetForm from "@/components/GetForm";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import PrintButton from "@/components/PrintButton";
import { ALL_CLASSES } from "@/lib/classDay";
import { getClassSemesters } from "@/lib/data";
import { ChangesTable, changeCount, loadChanges } from "../changes";
import { addDays, DATE_RE, formatDate, formatDateTime, todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Class changes to share", robots: { index: false } };

/**
 * Every change to the classes between two dates (moved, extra, cancelled or released, room taken,
 * faculty changed), for all classes or one, laid out to print or save as a PDF and share with faculty and students.
 */
export default async function ClassChangesPrint({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; class?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const start = sp.start && DATE_RE.test(sp.start) ? sp.start : today;
  const endRaw = sp.end && DATE_RE.test(sp.end) && sp.end >= start ? sp.end : addDays(start, 6);
  const end = endRaw > addDays(start, 30) ? addDays(start, 30) : endRaw;
  const semesters = await getClassSemesters(start);
  const allClasses = semesters.flatMap((x) => x.classes);
  const requested = String(sp.class ?? "").toUpperCase();
  const chosen = allClasses.includes(requested) ? requested : ALL_CLASSES;
  const { days, slots } = await loadChanges(start, end, chosen);
  const total = changeCount(days);
  const who = chosen === ALL_CLASSES ? "All classes" : `Class ${chosen}`;

  return (
    <div className="space-y-6">
      <div className="space-y-4 print:hidden">
        <PageHeader
          title="Class changes to share"
          subtitle="Every change to the classes between two dates: classes moved to another room or time, extra classes, classes cancelled or released for an event, skill lab, CIE or SEE, rooms taken, and faculty changes. Print it or save it as a PDF to share with faculty and students; pick a class for a sheet for one section."
        >
          <PendingLink href={`/admin/affected?${new URLSearchParams({ start: start < today ? today : start, end: end < today ? today : end }).toString()}`} className="btn-secondary py-2">‹ Classes affected</PendingLink>
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
          <div className="mt-2 text-base font-semibold">Class changes: {who}</div>
          <div className="muted mt-1 text-xs print:text-black">
            {formatDate(start)} to {formatDate(end)} · {total} {total === 1 ? "change" : "changes"} · Generated {formatDateTime(new Date().toISOString())}
          </div>
        </header>

        <ChangesTable days={days} slots={slots} />
        <p className="muted mt-4 text-xs print:text-black">
          Day and time: when the class is held now. Timetable room: its room in the timetable, with its day and time there when it moved to
          another time. Now: where it is held, or why it is not.
        </p>
      </article>
    </div>
  );
}
