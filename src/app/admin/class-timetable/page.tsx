import Flash from "@/components/Flash";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import { getRooms, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, todayIST } from "@/lib/time";
import ClassGrid from "./ClassGrid";
import { buildClassTimetable, ordinal, OTHER, type Cell } from "@/lib/classTimetable";

export const dynamic = "force-dynamic";

export default async function ClassTimetable({ searchParams }: { searchParams: Promise<{ class?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const tomorrow = addDays(todayIST(), 1);
  const supabase = await createClient();
  const [rooms, slots, ttRes, dirRes, peopleRes] = await Promise.all([
    getRooms(),
    getSlots(),
    supabase.rpc("get_timetable_all", { p_date: tomorrow }),
    supabase.from("faculty_directory").select("initials, title, full_name"),
    supabase.from("people").select("initials, title, full_name").not("initials", "is", null),
  ]);
  const cells = (ttRes.data ?? []) as Cell[];

  const names: Record<string, string> = {};
  for (const p of [...(dirRes.data ?? []), ...(peopleRes.data ?? [])] as { initials: string; title: string | null; full_name: string }[]) {
    if (p.full_name.trim()) names[p.initials] = `${p.title ? p.title + " " : ""}${p.full_name}`;
  }

  const { semesters, hasOther, allClasses, chosen, label, days, wholeSemester, subjects } = buildClassTimetable(cells, slots, sp.class);

  // Which room has what in each slot, so a class is only moved to a free room
  const busy: Record<string, Record<string, string>> = {};
  for (const c of cells) (busy[`${c.weekday}|${c.slot_id}`] ??= {})[c.room_id] = c.subject;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class timetable"
        subtitle={`Each class's week, as it runs from tomorrow, ${formatDate(tomorrow, { weekday: "long" })}. Click the pencil on a class to fix its subject, faculty initials or room, or to delete it. Today and earlier days keep the old timetable.`}
      />
      <Flash msg={sp.msg} error={sp.error} />

      {allClasses.length === 0 ? (
        <p className="card muted p-6 text-sm">There is no timetable from tomorrow yet. Upload one under Edit timetable first.</p>
      ) : (
        <>
          <nav aria-label="Classes" className="card space-y-2 p-4">
            {semesters.map(({ sem, classes }) => (
              <div key={sem} className="flex flex-wrap items-center gap-1.5">
                <span className="muted w-full shrink-0 text-xs sm:w-28 font-medium tracking-wide uppercase">{ordinal(sem)}</span>
                {classes.map((k) => (
                  <ClassChip key={k} k={k} active={k === chosen} text={k.length === 1 ? "All sections" : k} />
                ))}
              </div>
            ))}
            {hasOther && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="muted w-full shrink-0 text-xs sm:w-28 font-medium tracking-wide uppercase">No section</span>
                <ClassChip k={OTHER} active={chosen === OTHER} text="Other classes" />
              </div>
            )}
          </nav>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              {label(chosen)}
              {chosen !== OTHER && chosen.length > 1 && wholeSemester.has(chosen[0]) && (
                <span className="muted ml-2 text-sm font-normal">with the whole-semester subjects of semester {chosen[0]}</span>
              )}
            </h2>
            <ClassGrid
              key={chosen}
              slots={slots}
              days={days}
              rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
              busy={busy}
              names={names}
              back={`/admin/class-timetable?class=${encodeURIComponent(chosen)}`}
              defaultSubjectSuffix={chosen !== OTHER ? `-${chosen}` : ""}
            />
          </section>

          {subjects.size > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Subjects and faculty</h2>
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="thead-ink">
                    <tr>
                      <th className="th">Subject</th>
                      <th className="th">Faculty</th>
                      <th className="th text-right">Slots a week</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
                    {[...subjects.entries()]
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([subject, s]) => (
                        <tr key={subject}>
                          <td className="td font-medium">{subject}</td>
                          <td className="td">
                            {[...s.initials].map((ini) => (
                              <span key={ini} className="mr-3 inline-block">
                                <span className="font-mono text-xs font-semibold">{ini}</span>{" "}
                                {names[ini] ? (
                                  <span className="muted">{names[ini]}</span>
                                ) : (
                                  <span className="text-amber-700 dark:text-amber-300">not in the faculty list</span>
                                )}
                              </span>
                            ))}
                            {s.initials.size === 0 && <span className="muted">No faculty</span>}
                          </td>
                          <td className="td text-right tabular-nums">{s.slots}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ClassChip({ k, active, text }: { k: string; active: boolean; text: string }) {
  return (
    <PendingLink
      href={`/admin/class-timetable?class=${encodeURIComponent(k)}`}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
        active
          ? "bg-brand-600 text-white dark:bg-brand-500 dark:text-black"
          : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"
      }`}
    >
      {text}
    </PendingLink>
  );
}
