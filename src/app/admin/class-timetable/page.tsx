import Flash from "@/components/Flash";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import { getRooms, getSlots } from "@/lib/data";
import { DAY_NAMES } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, todayIST } from "@/lib/time";
import ClassGrid, { type ClassEntry, type Span } from "./ClassGrid";

export const dynamic = "force-dynamic";

type Cell = { room_id: string; weekday: number; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };

const OTHER = "other";

/**
 * The classes a subject is taught to, from the part after its last "-":
 * "DBMS-3B" → ["3B"], "KDD-5" → ["5"] (the whole semester), "DBMS-3B/3C" → ["3B", "3C"].
 * A subject with no section (e.g. "SKILL") gives [].
 */
function classesOf(subject: string): string[] {
  const tail = subject.includes("-") ? subject.slice(subject.lastIndexOf("-") + 1) : "";
  const keys = tail.split(/[/,&]/).map((x) => x.trim().toUpperCase());
  return keys.every((k) => /^\d[A-Z]?$/.test(k)) ? keys : [];
}

const ordinal = (n: string) => `${n}${n === "1" ? "st" : n === "2" ? "nd" : n === "3" ? "rd" : "th"} semester`;

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

  // Every class with a section, by semester; a semester with only whole-semester subjects is a class of its own
  const sections = new Map<string, Set<string>>();
  const wholeSemester = new Set<string>();
  let hasOther = false;
  for (const c of cells) {
    if (c.is_department) continue;
    const keys = classesOf(c.subject);
    if (keys.length === 0) hasOther = true;
    for (const k of keys) {
      if (!sections.has(k[0])) sections.set(k[0], new Set());
      if (k.length > 1) sections.get(k[0])!.add(k);
      else wholeSemester.add(k);
    }
  }
  const semesters = [...sections.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sem, set]) => ({ sem, classes: set.size ? [...set].sort() : [sem] }));
  const allClasses = [...semesters.flatMap((s) => s.classes), ...(hasOther ? [OTHER] : [])];
  const chosen = allClasses.includes(String(sp.class ?? "").toUpperCase()) ? String(sp.class).toUpperCase() : sp.class === OTHER && hasOther ? OTHER : allClasses[0];
  const label = (k: string) => (k === OTHER ? "Other classes" : k.length === 1 ? `Semester ${k} (all sections)` : `Class ${k}`);

  const inClass = (c: Cell) => {
    if (c.is_department) return false;
    const keys = classesOf(c.subject);
    return chosen === OTHER ? keys.length === 0 : keys.includes(chosen) || keys.includes(chosen?.[0] ?? "");
  };
  const toEntry = (c: Cell): ClassEntry => ({
    room: c.room_id,
    subject: c.subject,
    initials: c.faculty_initials,
    wholeSemester: chosen !== OTHER && chosen.length > 1 && classesOf(c.subject).includes(chosen[0]),
  });

  // One span per class block: consecutive slots with the same classes and no break between them merge, like a lab
  const mine = new Map<string, ClassEntry[]>();
  for (const c of cells.filter(inClass)) {
    const k = `${c.weekday}|${c.slot_id}`;
    mine.set(k, [...(mine.get(k) ?? []), toEntry(c)]);
  }
  const sig = (es: ClassEntry[]) => es.map((e) => `${e.room}|${e.subject}|${e.initials.join(",")}`).sort().join(";");
  const days: Span[][] = DAY_NAMES.map((_, i) => {
    const weekday = i + 1;
    const spans: Span[] = [];
    slots.forEach((s, j) => {
      const entries = (mine.get(`${weekday}|${s.id}`) ?? []).sort((a, b) => a.subject.localeCompare(b.subject));
      const prev = spans[spans.length - 1];
      if (prev && entries.length > 0 && sig(prev.entries) === sig(entries) && slots[j - 1].ends === s.starts) prev.slotIds.push(s.id);
      else spans.push({ weekday, slotIds: [s.id], entries });
    });
    return spans;
  });

  // Which room has what in each slot, so a class is only moved to a free room
  const busy: Record<string, Record<string, string>> = {};
  for (const c of cells) (busy[`${c.weekday}|${c.slot_id}`] ??= {})[c.room_id] = c.subject;

  // Subjects and faculty of this class, like the key under a printed class timetable
  const subjects = new Map<string, { initials: Set<string>; slots: number }>();
  for (const c of cells.filter(inClass)) {
    const s = subjects.get(c.subject) ?? { initials: new Set<string>(), slots: 0 };
    c.faculty_initials.forEach((x) => s.initials.add(x));
    s.slots++;
    subjects.set(c.subject, s);
  }

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
