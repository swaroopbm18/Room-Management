import Link from "next/link";
import Flash from "@/components/Flash";
import { IconCalendar, IconCalendarCheck, IconCheck, IconUpload, IconUsers, IconX } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getSlots } from "@/lib/data";
import { cellKey, DAY_NAMES, DAY_SLOTS, DAYS, getFacultyWeeks, type Busy, type FacultyMember } from "@/lib/faculty";
import { importFacultyDuties, setFacultyDuty } from "../../actions";
import SlotRange from "../allot/SlotRange";

export const dynamic = "force-dynamic";

const CELL = {
  timetable: "bg-brand-600 dark:bg-brand-500",
  duty: "bg-amber-400 dark:bg-amber-500",
  free: "bg-brand-100 dark:bg-brand-950",
};

/** A faculty member's week as a 6 × 9 strip of squares: classes, other duties and free slots. */
function MiniWeek({ week }: { week?: Map<string, Busy[]> }) {
  return (
    <div className="grid grid-cols-[1.75rem_repeat(9,minmax(0,1fr))] gap-0.5 text-[10px]" aria-hidden>
      {DAYS.map((d, i) => (
        <div key={d} className="contents">
          <span className="muted leading-3">{d}</span>
          {DAY_SLOTS.map((s) => {
            const b = week?.get(cellKey(i + 1, s));
            return <span key={s} className={`h-3 rounded-sm ${b?.length ? CELL[b.some((x) => x.source === "timetable") ? "timetable" : "duty"] : CELL.free}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {[
        ["timetable", "Class (room timetable)"],
        ["duty", "Other duty"],
        ["free", "Free"],
      ].map(([k, l]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-4 rounded-sm ${CELL[k as keyof typeof CELL]}`} />
          {l}
        </span>
      ))}
    </div>
  );
}

export default async function FacultyTimetables({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const [slots, { faculty, weeks, dutiesReady }] = await Promise.all([getSlots(), getFacultyWeeks()]);
  // Slots in the 8:00 to 4:45 day taken by a class (or by anything, with no source)
  const count = (ini: string, source?: Busy["source"]) =>
    [...(weeks.get(ini)?.entries() ?? [])].filter(([k, b]) => DAY_SLOTS.includes(Number(k.split("|")[1])) && (source ? b.some((x) => x.source === source) : b.length)).length;
  const q = (sp.q ?? "").trim().toLowerCase();
  const shown = q ? faculty.filter((f) => f.name.toLowerCase().includes(q) || f.initials.toLowerCase().includes(q)) : faculty;
  const selected = faculty.find((f) => f.initials === sp.f);
  const totalClasses = faculty.reduce((n, f) => n + count(f.initials, "timetable"), 0);
  const totalDuties = faculty.reduce((n, f) => n + count(f.initials, "duty"), 0);
  const back = `/admin/faculty${selected ? `?f=${encodeURIComponent(selected.initials)}` : ""}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Faculty timetables"
        subtitle="Each faculty member's week: their classes from the room timetable, matched by initials, plus any other duties added here. Click a card to see the full timetable."
      >
        <Link href="/admin/free-time" className="btn-secondary">
          <IconCalendarCheck className="h-4 w-4" /> Free time & meetings
        </Link>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />
      {!dutiesReady && (
        <Flash error="Run supabase/migrations/0010_faculty_timetables.sql in the Supabase SQL Editor to add duties other than classes. Classes from the room timetable already show." />
      )}

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Faculty" value={faculty.length} tone="navy" icon={<IconUsers />} hint="Everyone with initials in the timetable or on the list" />
        <KpiCard label="Classes a week" value={totalClasses} icon={<IconCalendar />} hint={`${faculty.length ? (totalClasses / faculty.length).toFixed(1) : 0} per faculty member on average`} />
        <KpiCard label="Other duty slots" value={totalDuties} tone="ink" icon={<IconCalendarCheck />} hint="Labs, proctoring, committees and so on" />
      </section>

      {selected && <FacultyDetail person={selected} week={weeks.get(selected.initials)} slots={slots} back={back} dutiesReady={dutiesReady} />}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Everyone <span className="muted text-sm font-normal">· {shown.length}</span>
          </h2>
          <form className="flex gap-2">
            {selected && <input type="hidden" name="f" value={selected.initials} />}
            <input name="q" defaultValue={sp.q} placeholder="Find by name or initials" className="input w-56 py-1.5" />
            <button className="btn-secondary py-1.5">Find</button>
          </form>
        </div>
        <div className="mb-3">
          <Legend />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((f) => {
            const classes = count(f.initials, "timetable");
            const busy = count(f.initials);
            return (
              <Link
                key={f.initials}
                href={`/admin/faculty?f=${encodeURIComponent(f.initials)}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}#timetable`}
                scroll={false}
                className={`card block p-4 transition hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700 ${selected?.initials === f.initials ? "ring-2 ring-brand-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{f.name}</div>
                    <div className="muted truncate text-xs">{f.email ?? "Not on the sign-in list"}</div>
                  </div>
                  <span className="shrink-0 rounded-md bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/70 dark:text-brand-200">{f.initials}</span>
                </div>
                <div className="mt-3 flex gap-6">
                  <div>
                    <div className="text-2xl font-semibold tracking-tight">{classes}</div>
                    <div className="muted text-xs">classes a week</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold tracking-tight">{busy - classes}</div>
                    <div className="muted text-xs">other duties</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold tracking-tight text-brand-600 dark:text-brand-400">{6 * DAY_SLOTS.length - busy}</div>
                    <div className="muted text-xs">free slots</div>
                  </div>
                </div>
                <div className="mt-3">
                  <MiniWeek week={weeks.get(f.initials)} />
                </div>
              </Link>
            );
          })}
          {shown.length === 0 && <div className="card muted p-6 text-sm sm:col-span-2 lg:col-span-3">Nobody matches “{sp.q}”.</div>}
        </div>
      </section>

      {dutiesReady && (
        <section className="card p-5">
          <h2 className="font-semibold">Upload faculty timetables</h2>
          <p className="muted mt-1 text-sm">
            For duties that aren&apos;t in the room timetable. One slot per line: <code>initials, day, start time, duty</code>, for example <code>AKN, Mon, 8:00, Proctoring</code>. Everyone in the file has
            their duties replaced; classes always come from the room timetable.
          </p>
          <form action={importFacultyDuties} className="mt-3 grid gap-3">
            <input type="hidden" name="back" value={back} />
            <textarea name="csv" rows={4} className="input font-mono text-xs" placeholder={"AKN, Mon, 8:00, Proctoring\nAKN, Mon, 8:55, Proctoring\nKS, Thu, 2:00, Lab in-charge"} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input type="file" name="file" accept=".csv,text/csv,text/plain" className="text-sm" />
              <SubmitButton pendingText="Uploading…" message="Saving the faculty timetables…">
                <IconUpload className="h-4 w-4" /> Upload
              </SubmitButton>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function FacultyDetail({
  person,
  week,
  slots,
  back,
  dutiesReady,
}: {
  person: FacultyMember;
  week?: Map<string, Busy[]>;
  slots: Awaited<ReturnType<typeof getSlots>>;
  back: string;
  dutiesReady: boolean;
}) {
  const shownSlots = slots.filter((s) => DAY_SLOTS.includes(s.id) || DAYS.some((_, i) => week?.get(cellKey(i + 1, s.id))?.length));
  return (
    <section id="timetable" className="card scroll-mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-gradient-to-r from-brand-100 to-white px-5 py-3 dark:border-brand-900 dark:from-brand-950 dark:to-ink">
        <div>
          <div className="font-semibold">
            {person.name} <span className="muted font-normal">· {person.initials}</span>
          </div>
          <div className="muted text-xs">Weekly timetable from tomorrow</div>
        </div>
        <Link href="/admin/faculty" scroll={false} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          <IconX className="h-4 w-4" /> Close
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-1 p-2 text-xs">
          <thead>
            <tr>
              <th className="w-24 rounded-md bg-brand-950 px-2 py-2 text-left font-semibold text-brand-100">Day</th>
              {shownSlots.map((s) => (
                <th key={s.id} className="rounded-md bg-brand-900 px-2 py-2 text-left font-medium whitespace-nowrap text-white dark:bg-brand-950">
                  {s.label.split(" – ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES.map((d, i) => (
              <tr key={d}>
                <th className="rounded-md bg-brand-100 px-2 py-2 text-left font-semibold text-brand-950 dark:bg-brand-950 dark:text-brand-100">{d}</th>
                {shownSlots.map((s) => {
                  const b = week?.get(cellKey(i + 1, s.id)) ?? [];
                  const cls = b.some((x) => x.source === "timetable")
                    ? "bg-brand-600 text-white dark:bg-brand-700"
                    : b.length
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      : "bg-brand-50 text-brand-400 dark:bg-brand-950/40 dark:text-brand-700";
                  return (
                    <td key={s.id} className={`h-12 rounded-md px-2 py-1 align-top ${cls}`}>
                      {b.length === 0
                        ? "Free"
                        : b.map((x, j) => (
                            <div key={j} className={b.length > 1 ? "font-medium" : ""}>
                              <span className="font-semibold">{x.activity}</span>
                              {x.room && <span className="block opacity-80">{x.room}</span>}
                            </div>
                          ))}
                      {b.length > 1 && <span className="mt-0.5 block text-[10px] font-semibold uppercase">Clash</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dutiesReady && (
        <form action={setFacultyDuty} className="grid gap-3 border-t border-brand-100 bg-brand-50/50 p-4 sm:grid-cols-2 lg:grid-cols-[10rem_minmax(0,2fr)_minmax(0,2fr)_auto] dark:border-brand-900 dark:bg-brand-950/40">
          <input type="hidden" name="initials" value={person.initials} />
          <input type="hidden" name="back" value={back} />
          <div>
            <label className="label" htmlFor="duty-day">Day</label>
            <select id="duty-day" name="weekday" className="input">
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i + 1}>{d}</option>
              ))}
            </select>
          </div>
          <SlotRange slots={slots} idPrefix="duty-" />
          <div>
            <label className="label" htmlFor="duty-activity">Duty</label>
            <input id="duty-activity" name="activity" maxLength={60} className="input" placeholder="e.g. Proctoring · empty clears the slots" />
          </div>
          <div className="flex items-end">
            <SubmitButton pendingText="Saving…" message="Saving the duty…">
              <IconCheck className="h-4 w-4" /> Save
            </SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
