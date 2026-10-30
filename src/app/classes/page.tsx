import ClassWeek from "@/components/ClassWeek";
import PageHeader from "@/components/PageHeader";
import PrintButton from "@/components/PrintButton";
import PendingLink from "@/components/PendingLink";
import { buildClassTimetable, ordinal, OTHER, type Cell } from "@/lib/classTimetable";
import { getFacultyStatus, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Class timetables",
  description: "The weekly timetable of every class in BMSCE's Department of Machine Learning: subject, faculty and room for each slot.",
  alternates: { canonical: "/classes" },
};

/** Each class's regular week, for students. Read only; admins edit it under Timetables. */
export default async function Classes({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const supabase = await createClient();
  const [slots, ttRes, status] = await Promise.all([getSlots(), supabase.rpc("get_timetable_all", { p_date: today }), getFacultyStatus(today)]);
  const cells = (ttRes.data ?? []) as Cell[];
  const names: Record<string, string> = {};
  for (const f of status ?? []) names[f.initials] = f.name;
  const { semesters, hasOther, allClasses, chosen, label, days, subjects } = buildClassTimetable(cells, slots, sp.class);
  const chip = (k: string, text: string) => (
    <PendingLink
      key={k}
      href={`/classes?class=${encodeURIComponent(k)}`}
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
      <div className="print:hidden">
        <PageHeader title="Class timetables" subtitle="Pick your class to see its regular week: the subject, faculty member and room in every slot. One-off changes show on the home page." />
      </div>
      {allClasses.length === 0 ? (
        <p className="card muted p-6 text-sm">The timetable isn&apos;t available right now.</p>
      ) : (
        <>
          <nav aria-label="Classes" className="card space-y-2 p-4 print:hidden">
            {semesters.map(({ sem, classes }) => (
              <div key={sem} className="flex flex-wrap items-center gap-1.5">
                <span className="muted w-full shrink-0 text-xs font-medium tracking-wide uppercase sm:w-28">{ordinal(sem)}</span>
                {classes.map((k) => chip(k, k.length === 1 ? "All sections" : k))}
              </div>
            ))}
            {hasOther && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="muted w-full shrink-0 text-xs font-medium tracking-wide uppercase sm:w-28">No section</span>
                {chip(OTHER, "Other classes")}
              </div>
            )}
          </nav>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold print:text-2xl">
                <span className="hidden print:inline">BMSCE · Machine Learning · </span>
                {label(chosen)}
              </h2>
              <PrintButton label="Print for the notice board" />
            </div>
            <ClassWeek slots={slots} days={days} names={names} />
          </section>
          {subjects.size > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Subjects and faculty</h2>
              <div className="card divide-y divide-brand-100 dark:divide-brand-900">
                {[...subjects.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([subject, s]) => (
                    <div key={subject} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                      <span className="font-medium">{subject}</span>
                      <span className="muted">{[...s.initials].map((x) => names[x] ?? x).join(", ") || "No faculty"} · {s.slots} a week</span>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
