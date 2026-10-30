import Link from "next/link";
import Flash from "@/components/Flash";
import { IconCalendar, IconCalendarCheck, IconCheck, IconPlus, IconUpload, IconUsers, IconX } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { cellKey, CLUSTERS, DAY_NAMES, DAY_SLOTS, DAYS, getFacultyWeeks, type Busy, type ClusterKey, type FacultyMember } from "@/lib/faculty";
import { addSubject, importFacultyDuties, removeSubject, saveFacultyProfile, setFacultyClusters, setFacultyDuty, upsertPerson } from "../../actions";
import WeekTable from "@/components/WeekTable";
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

export default async function FacultyTimetables({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; cl?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const [slots, { faculty, weeks, dutiesReady, clustersReady }] = await Promise.all([getSlots(), getFacultyWeeks()]);
  // Slots in the 8:00 to 4:45 day taken by a class (or by anything, with no source)
  const count = (ini: string, source?: Busy["source"]) =>
    [...(weeks.get(ini)?.entries() ?? [])].filter(([k, b]) => DAY_SLOTS.includes(Number(k.split("|")[1])) && (source ? b.some((x) => x.source === source) : b.length)).length;
  const q = (sp.q ?? "").trim().toLowerCase();
  const selected = faculty.find((f) => f.initials === sp.f);
  const cl = sp.cl === "A" || sp.cl === "B" || sp.cl === "none" ? sp.cl : "";
  const shown = faculty
    .filter((f) => !q || f.name.toLowerCase().includes(q) || f.initials.toLowerCase().includes(q))
    .filter((f) => !cl || (cl === "none" ? !f.cluster : f.cluster === cl));
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ f: selected?.initials, q: sp.q, cl, ...extra })) if (v) p.set(k, v);
    const qs = p.toString();
    return `/admin/faculty${qs ? `?${qs}` : ""}`;
  };
  const totalClasses = faculty.reduce((n, f) => n + count(f.initials, "timetable"), 0);
  const totalDuties = faculty.reduce((n, f) => n + count(f.initials, "duty"), 0);
  const back = `/admin/faculty${selected ? `?f=${encodeURIComponent(selected.initials)}` : ""}`;
  const profile = selected ? await getProfile(selected.initials) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Faculty profiles"
        subtitle="Click anyone to open their profile: name and initials, sign-in, cluster, subjects, other duties and their weekly timetable, all in one place."
      >
        <Link href="/admin/free-time" className="btn-secondary">
          <IconCalendarCheck className="h-4 w-4" /> Free time & meetings
        </Link>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />
      {!clustersReady && <Flash error="Run supabase/migrations/0014_faculty_clusters.sql in the Supabase SQL Editor to put faculty into Cluster A and Cluster B." />}
      {!dutiesReady && (
        <Flash error="Run supabase/migrations/0013_faculty_timetables.sql in the Supabase SQL Editor to add duties other than classes. Classes from the room timetable already show." />
      )}

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Faculty" value={faculty.length} tone="navy" icon={<IconUsers />} hint="Everyone with initials in the timetable or on the list" />
        <KpiCard label="Classes a week" value={totalClasses} icon={<IconCalendar />} hint={`${faculty.length ? (totalClasses / faculty.length).toFixed(1) : 0} per faculty member on average`} />
        <KpiCard label="Other duty slots" value={totalDuties} tone="ink" icon={<IconCalendarCheck />} hint="Labs, proctoring, committees and so on" />
      </section>

      {selected && profile && (
        <FacultyProfile person={selected} profile={profile} week={weeks.get(selected.initials)} slots={slots} back={back} dutiesReady={dutiesReady} clustersReady={clustersReady} />
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Faculty <span className="muted text-sm font-normal">· {shown.length}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {[
              ["", "All"],
              ["A", CLUSTERS.A.label],
              ["B", CLUSTERS.B.label],
              ["none", "No cluster"],
            ].map(([k, l]) => (
              <Link
                key={k}
                href={link({ cl: k })}
                scroll={false}
                className={`rounded-lg px-3 py-1.5 font-medium ${cl === k ? "bg-brand-700 text-white dark:bg-brand-600" : "bg-white text-brand-800 hover:bg-brand-100 dark:bg-ink dark:text-brand-200 dark:hover:bg-brand-950"}`}
              >
                {l} <span className="opacity-70">· {faculty.filter((f) => (k === "" ? true : k === "none" ? !f.cluster : f.cluster === k)).length}</span>
              </Link>
            ))}
          </div>
          <form className="flex gap-2">
            {selected && <input type="hidden" name="f" value={selected.initials} />}
            {cl && <input type="hidden" name="cl" value={cl} />}
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
                href={`${link({ f: f.initials })}#timetable`}
                scroll={false}
                className={`card block p-4 transition hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700 ${selected?.initials === f.initials ? "ring-2 ring-brand-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{f.name}</div>
                    <div className="muted truncate text-xs">{f.email ?? "Not on the sign-in list"}</div>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/70 dark:text-brand-200">{f.initials}</span>
                    {f.cluster && <ClusterChip cluster={f.cluster} />}
                  </span>
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

      {clustersReady && <ClusterForm faculty={faculty} back={link({})} />}

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

function ClusterChip({ cluster }: { cluster: ClusterKey }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        cluster === "A" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
      }`}
    >
      {CLUSTERS[cluster].label}
    </span>
  );
}

/** Every faculty member with a Cluster A / Cluster B / none picker, saved in one go. */
function ClusterForm({ faculty, back }: { faculty: FacultyMember[]; back: string }) {
  const unset = faculty.filter((f) => !f.cluster).length;
  return (
    <section className="card overflow-hidden">
      <details open={unset === faculty.length}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-semibold">HoD clusters</span>
            <span className="muted block text-sm">Put each faculty member under the HoD of Cluster A or Cluster B. The free-time page and meeting finder use these groups.</span>
          </span>
          <span className="text-sm font-medium text-brand-600 dark:text-brand-400">{unset ? `${unset} not in a cluster yet` : "Everyone is in a cluster"} · Edit</span>
        </summary>
        <form action={setFacultyClusters} className="border-t border-brand-100 dark:border-brand-900">
          <input type="hidden" name="back" value={back} />
          <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {faculty.map((f) => (
              <fieldset key={f.initials} className="flex items-center justify-between gap-2 border-b border-brand-50 px-5 py-2 text-sm dark:border-brand-950">
                <legend className="sr-only">{f.name}</legend>
                <span className="min-w-0 truncate">
                  {f.name} <span className="muted text-xs">{f.initials}</span>
                </span>
                <span className="flex shrink-0 gap-2 text-xs">
                  {(["A", "B", ""] as const).map((c) => (
                    <label key={c} className="flex items-center gap-1">
                      <input type="radio" name={`cluster:${f.initials}`} value={c} defaultChecked={(f.cluster ?? "") === c} className="accent-brand-600" />
                      {c || "None"}
                    </label>
                  ))}
                </span>
              </fieldset>
            ))}
          </div>
          <div className="flex justify-end p-4">
            <SubmitButton pendingText="Saving…" message="Saving the clusters…">
              <IconCheck className="h-4 w-4" /> Save clusters
            </SubmitButton>
          </div>
        </form>
      </details>
    </section>
  );
}

type Profile = {
  account: Person | null; // their sign-in record, if they have one
  listed: boolean; // in the faculty directory (else known only from the timetable)
  title: string;
  fullName: string;
  subjects: { subject: string; source: "admin" | "timetable" }[];
  timetableSubjects: string[]; // next to their initials in the current timetable
};

/** Everything the profile shows for one faculty member, beyond their week. */
async function getProfile(initials: string): Promise<Profile> {
  const supabase = await createClient();
  const [accountRes, dirRes, ttRes] = await Promise.all([
    supabase.from("people").select("*").eq("initials", initials).maybeSingle(),
    supabase.from("faculty_directory").select("title, full_name").eq("initials", initials).maybeSingle(),
    supabase.rpc("timetable_subjects"),
  ]);
  const account = (accountRes.data as Person | null) ?? null;
  const dir = dirRes.data as { title: string; full_name: string } | null;
  const subjectsRes = account ? await supabase.from("faculty_subjects").select("subject, source").eq("email", account.email).order("subject") : null;
  return {
    account,
    listed: !!dir,
    title: dir?.title ?? account?.title ?? "Prof.",
    fullName: dir?.full_name.trim() ? dir.full_name : (account?.full_name ?? ""),
    subjects: (subjectsRes?.data ?? []) as Profile["subjects"],
    timetableSubjects: [...new Set(((ttRes.data ?? []) as { initials: string; subject: string }[]).filter((t) => t.initials === initials).map((t) => t.subject))].sort(),
  };
}

const TITLES = ["Prof.", "Dr.", "Mr.", "Ms.", "Mrs.", ""];

function ProfileCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4 dark:border-brand-900 dark:bg-ink">
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="muted mt-0.5 text-xs">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** One faculty member in one place: name, sign-in, cluster, subjects, duties and their week. */
function FacultyProfile({
  person,
  profile,
  week,
  slots,
  back,
  dutiesReady,
  clustersReady,
}: {
  person: FacultyMember;
  profile: Profile;
  week?: Map<string, Busy[]>;
  slots: Awaited<ReturnType<typeof getSlots>>;
  back: string;
  dutiesReady: boolean;
  clustersReady: boolean;
}) {
  const { account } = profile;
  const has = new Set(profile.subjects.map((x) => x.subject));
  const missing = profile.timetableSubjects.filter((x) => !has.has(x));
  return (
    <section id="timetable" className="card scroll-mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-gradient-to-r from-brand-100 to-white px-5 py-3 dark:border-brand-900 dark:from-brand-950 dark:to-ink">
        <div>
          <div className="font-semibold">
            {person.name} <span className="muted font-normal">· {person.initials}</span> {person.cluster && <ClusterChip cluster={person.cluster} />}
          </div>
          <div className="muted text-xs">{account ? `Signs in as ${account.email} · ${account.role === "admin" ? "Admin" : "Faculty"}${account.active ? "" : " · No access"}` : "Can't sign in yet"}</div>
        </div>
        <Link href="/admin/faculty" scroll={false} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          <IconX className="h-4 w-4" /> Close
        </Link>
      </div>

      <div className="grid gap-3 bg-brand-50/50 p-4 md:grid-cols-2 dark:bg-brand-950/30">
        <ProfileCard title="Name and initials" hint="Initials must match how the timetable writes them. Changing them here keeps their cluster, duties and sign-in.">
          <form action={saveFacultyProfile} className="flex flex-wrap gap-2">
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="old_initials" value={profile.listed ? person.initials : ""} />
            {account && (
              <>
                <input type="hidden" name="email" value={account.email} />
                <input type="hidden" name="role" value={account.role} />
                <input type="hidden" name="active" value={String(account.active)} />
              </>
            )}
            <input name="initials" required maxLength={10} defaultValue={person.initials} aria-label="Initials" className="input w-24 py-1.5 font-mono text-sm uppercase" />
            <select name="title" defaultValue={profile.title} aria-label="Title" className="input w-24 py-1.5">
              {TITLES.map((t) => (
                <option key={t} value={t}>{t || "No title"}</option>
              ))}
            </select>
            <input name="full_name" maxLength={80} defaultValue={profile.fullName} placeholder="Full name" aria-label="Full name" className="input min-w-40 flex-1 py-1.5" />
            <SubmitButton className="btn-primary py-1.5" pendingText="Saving…" message="Saving the profile…">
              <IconCheck className="h-4 w-4" /> Save
            </SubmitButton>
          </form>
        </ProfileCard>

        <ProfileCard title="Sign-in" hint="Only people on this list can sign in with their @bmsce.ac.in Google account.">
          <form action={upsertPerson} className="flex flex-wrap gap-2">
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="initials" value={person.initials} />
            <input type="hidden" name="title" value={profile.title} />
            <input type="hidden" name="full_name" value={profile.fullName || person.initials} />
            <input
              name="email"
              type="email"
              required
              defaultValue={account?.email}
              readOnly={!!account}
              placeholder="name@bmsce.ac.in"
              pattern=".+@bmsce\.ac\.in"
              aria-label="Email"
              className="input min-w-48 flex-1 py-1.5 read-only:opacity-70"
            />
            <select name="role" defaultValue={account?.role ?? "faculty"} aria-label="Role" className="input w-28 py-1.5">
              <option value="faculty">Faculty</option>
              <option value="admin">Admin</option>
            </select>
            <select name="active" defaultValue={account ? String(account.active) : "true"} aria-label="Access" className="input w-32 py-1.5">
              <option value="true">Can sign in</option>
              <option value="false">No access</option>
            </select>
            <SubmitButton className={account ? "btn-secondary py-1.5" : "btn-primary py-1.5"} pendingText="Saving…" message="Saving sign-in…">
              {account ? <IconCheck className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />} {account ? "Save" : "Give access"}
            </SubmitButton>
          </form>
        </ProfileCard>

        {clustersReady && (
          <ProfileCard title="HoD cluster" hint="Used by the free and busy faculty cards and the meeting finder.">
            <form action={setFacultyClusters} className="flex flex-wrap items-center gap-4 text-sm">
              <input type="hidden" name="back" value={back} />
              {(["A", "B", ""] as const).map((c) => (
                <label key={c} className="flex items-center gap-1.5">
                  <input type="radio" name={`cluster:${person.initials}`} value={c} defaultChecked={(person.cluster ?? "") === c} className="accent-brand-600" />
                  {c ? CLUSTERS[c].label : "None"}
                </label>
              ))}
              <SubmitButton className="btn-secondary ml-auto py-1.5" pendingText="Saving…" message="Saving the cluster…">
                <IconCheck className="h-4 w-4" /> Save
              </SubmitButton>
            </form>
          </ProfileCard>
        )}

        <ProfileCard title="Subjects" hint="They pick one of these when they request a room for a class.">
          {!account ? (
            <p className="muted text-sm">Subjects belong to a sign-in, so give them access first.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {profile.subjects.length === 0 && <span className="muted text-sm">None yet, so they can&apos;t request a room for a class.</span>}
                {profile.subjects.map((a) => (
                  <form key={a.subject} action={removeSubject} className="inline-flex items-center gap-1 rounded-lg border border-brand-200 py-0.5 pr-1 pl-2.5 text-sm dark:border-brand-800">
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="email" value={account.email} />
                    <input type="hidden" name="subject" value={a.subject} />
                    <span className="font-medium">{a.subject}</span>
                    <SubmitButton
                      className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
                      pendingText=""
                      message="Removing the subject…"
                      aria-label={`Remove ${a.subject}`}
                    >
                      <IconX className="h-3.5 w-3.5" />
                    </SubmitButton>
                  </form>
                ))}
              </div>
              {missing.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="muted text-xs">In the timetable:</span>
                  {missing.map((m) => (
                    <form key={m} action={addSubject}>
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="email" value={account.email} />
                      <input type="hidden" name="subject" value={m} />
                      <SubmitButton className="inline-flex items-center gap-1 rounded-lg border border-dashed border-brand-300 px-2.5 py-0.5 font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950" pendingText="Adding…" message="Adding the subject…">
                        <IconPlus className="h-3.5 w-3.5" /> {m}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              )}
              <form action={addSubject} className="flex gap-2">
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="email" value={account.email} />
                <input name="subject" required maxLength={40} placeholder="e.g. DBMS-3B" aria-label="Subject" className="input flex-1 py-1.5 uppercase" />
                <SubmitButton className="btn-secondary py-1.5" pendingText="Adding…" message="Adding the subject…">
                  <IconPlus className="h-4 w-4" /> Add
                </SubmitButton>
              </form>
            </div>
          )}
        </ProfileCard>
      </div>

      <div className="border-t border-brand-100 px-5 pt-3 dark:border-brand-900">
        <h3 className="font-semibold">Weekly timetable</h3>
        <p className="muted text-xs">From tomorrow, with classes from the room timetable and other duties added below.</p>
      </div>
      <WeekTable week={week} slots={slots} />
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
            <label className="label" htmlFor="duty-activity">Other duty</label>
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
