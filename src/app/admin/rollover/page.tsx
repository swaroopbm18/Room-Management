import Link from "next/link";
import { IconAlert, IconArchive, IconArrowRight, IconCalendar, IconDownload, IconTag, IconUpload } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, todayIST } from "@/lib/time";
import { copyHolidays, semesterRollover, subjectsFromTimetable } from "../../actions";

export const dynamic = "force-dynamic";

const BACK = "/admin/rollover";

function Step({ n, title, hint, icon, children }: { n: number; title: string; hint: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card grid gap-4 p-5 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white dark:bg-brand-500 dark:text-black">{n}</span>
      <div className="space-y-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
            {icon} {title}
          </h2>
          <p className="muted text-sm">{hint}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

/** Starting a new semester, step by step. Past days always keep the timetable they had. */
export default async function Rollover() {
  const today = todayIST();
  const supabase = await createClient();
  const [duties, subjects, timetableSubjects, leave, holidays] = await Promise.all([
    supabase.from("faculty_duties").select("*", { count: "exact", head: true }),
    supabase.from("faculty_subjects").select("*", { count: "exact", head: true }),
    supabase.from("faculty_subjects").select("*", { count: "exact", head: true }).eq("source", "timetable"),
    supabase.from("faculty_leave").select("*", { count: "exact", head: true }).lt("ends_on", today),
    supabase.from("holidays").select("date").order("date"),
  ]);
  const hol = ((holidays.data ?? []) as { date: string }[]).map((h) => h.date);
  const first = hol[0] ?? addDays(today, -180);
  const last = hol[hol.length - 1] ?? today;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New semester"
        subtitle="Everything to start a new semester, in order. The old timetable and every booking stay in the history: past days always show the timetable they had."
      />

      <Step n={1} icon={<IconDownload className="h-5 w-5" />} title="Download a backup" hint="One Excel workbook with the timetable, bookings, requests, faculty, leave and the activity log, to keep a copy of the semester.">
        <a href="/admin/backup" download className="btn-primary">
          <IconDownload className="h-4 w-4" /> Download backup
        </a>
      </Step>

      <Step n={2} icon={<IconUpload className="h-5 w-5" />} title="Upload the new timetable" hint="Upload the new Room Timetable Word file. It replaces the timetable of the rooms in it from tomorrow on.">
        <Link href="/admin/timetable" className="btn-secondary">
          Go to Room timetable <IconArrowRight className="h-4 w-4" />
        </Link>
      </Step>

      <Step n={3} icon={<IconArchive className="h-5 w-5" />} title="Clear last semester's details" hint="Pick what no longer applies. This can't be undone, so download the backup first.">
        <form action={semesterRollover} className="space-y-3 text-sm">
          <input type="hidden" name="back" value={BACK} />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="duties" defaultChecked className="h-4 w-4 accent-brand-600" /> Other duties of every faculty member <span className="muted">· {duties.count ?? 0} slots</span>
          </label>
          <fieldset className="space-y-1">
            <legend className="mb-1">Subjects faculty can request rooms for</legend>
            {[
              ["timetable", `Only the ones added from the old timetable · ${timetableSubjects.count ?? 0}`],
              ["all", `All subjects · ${subjects.count ?? 0}`],
              ["none", "Keep them"],
            ].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 pl-1">
                <input type="radio" name="subjects" value={v} defaultChecked={v === "timetable"} className="accent-brand-600" /> {l}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="leave" defaultChecked className="h-4 w-4 accent-brand-600" /> Leave that has ended <span className="muted">· {leave.count ?? 0}</span>
          </label>
          <SubmitButton className="btn-danger" pendingText="Clearing…" message="Clearing last semester's details…" confirm="Clear the ticked details for everyone? This can't be undone.">
            <IconAlert className="h-4 w-4" /> Clear for the new semester
          </SubmitButton>
        </form>
      </Step>

      <Step n={4} icon={<IconTag className="h-5 w-5" />} title="Give faculty their new subjects" hint="Adds each faculty member's subjects from the new timetable, so they can request rooms for their classes.">
        <form action={subjectsFromTimetable}>
          <input type="hidden" name="back" value={BACK} />
          <SubmitButton className="btn-secondary" pendingText="Adding…" message="Adding subjects from the timetable…">
            <IconTag className="h-4 w-4" /> Add subjects from the timetable
          </SubmitButton>
        </form>
      </Step>

      <Step n={5} icon={<IconCalendar className="h-5 w-5" />} title="Carry holidays forward" hint="Copies the holidays between two dates to the same dates a year later. Festivals that move each year need fixing by hand under Calendar & notices.">
        <form action={copyHolidays} className="grid gap-3 sm:grid-cols-[10rem_10rem_8rem_auto] sm:items-end">
          <input type="hidden" name="back" value={BACK} />
          <div>
            <label className="label" htmlFor="h-from">From</label>
            <input id="h-from" name="from_date" type="date" required defaultValue={first} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="h-to">To</label>
            <input id="h-to" name="to_date" type="date" required defaultValue={last} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="h-years">Move by</label>
            <select id="h-years" name="years" className="input">
              <option value="1">1 year</option>
              <option value="2">2 years</option>
            </select>
          </div>
          <SubmitButton className="btn-secondary" pendingText="Copying…" message="Copying the holidays…">
            <IconCalendar className="h-4 w-4" /> Copy holidays
          </SubmitButton>
        </form>
        <p className="muted text-xs">{hol.length ? `${hol.length} holidays on record, ${formatDate(first)} to ${formatDate(last)}.` : "No holidays on record yet."}</p>
      </Step>

      <Step n={6} icon={<IconAlert className="h-5 w-5" />} title="Check the new timetable" hint="Look for clashes, unknown initials and classes with no faculty before the semester starts.">
        <Link href="/admin/health" className="btn-secondary">
          Open the health check <IconArrowRight className="h-4 w-4" />
        </Link>
      </Step>
    </div>
  );
}
