import Flash from "@/components/Flash";
import { IconCalendar, IconPlus, IconX } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { displayName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { addSubject, removeSubject, subjectsFromTimetable } from "../../actions";

export const dynamic = "force-dynamic";

type Allotted = { email: string; subject: string; source: "admin" | "timetable" };

export default async function Subjects({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [peopleRes, allottedRes, ttRes] = await Promise.all([
    supabase.from("people").select("*").eq("active", true).order("full_name"),
    supabase.from("faculty_subjects").select("email, subject, source").order("subject"),
    supabase.rpc("timetable_subjects"),
  ]);
  const people = (peopleRes.data ?? []) as Person[];
  const allotted = (allottedRes.data ?? []) as Allotted[];
  const fromTimetable = (ttRes.data ?? []) as { initials: string; subject: string }[];

  const byEmail = new Map<string, Allotted[]>();
  for (const a of allotted) byEmail.set(a.email, [...(byEmail.get(a.email) ?? []), a]);
  const has = new Set(allotted.map((a) => `${a.email}|${a.subject}`));
  const byInitials = new Map(people.filter((p) => p.initials).map((p) => [p.initials!, p]));
  // What "Add from the timetable" would add, per person
  const pending = new Map<string, string[]>();
  for (const t of fromTimetable) {
    const p = byInitials.get(t.initials);
    if (p && !has.has(`${p.email}|${t.subject}`)) pending.set(p.email, [...(pending.get(p.email) ?? []), t.subject].sort());
  }
  const pendingCount = [...pending.values()].reduce((n, l) => n + l.length, 0);
  const allSubjects = [...new Set([...fromTimetable.map((t) => t.subject), ...allotted.map((a) => a.subject)])].sort();
  const noInitials = people.filter((p) => !p.initials).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Subjects"
        subtitle="Faculty pick one of their subjects when they request a room for a class. Removing a subject never changes past requests."
      />
      <Flash msg={sp.msg} error={sp.error} />

      <section className="card space-y-3 p-6">
        <div>
          <h2 className="text-lg font-semibold">Add subjects from the timetable</h2>
          <p className="muted mt-1 text-sm">
            Reads the current timetable, including the latest Word file uploaded under Timetables, and gives each faculty member the subjects next to
            their initials. Subjects already allotted are kept.
            {noInitials > 0 && ` ${noInitials} ${noInitials === 1 ? "person has" : "people have"} no initials on the faculty list, so the timetable can't be matched to them.`}
          </p>
        </div>
        {pendingCount > 0 ? (
          <>
            <ul className="max-h-60 space-y-1 overflow-auto rounded-lg border border-brand-100 p-3 text-sm dark:border-brand-900">
              {[...pending.entries()].map(([email, subs]) => {
                const p = people.find((x) => x.email === email)!;
                return (
                  <li key={email}>
                    <span className="font-medium">{displayName(p)}</span> <span className="muted">({p.initials})</span>: {subs.join(", ")}
                  </li>
                );
              })}
            </ul>
            <form action={subjectsFromTimetable}>
              <SubmitButton pendingText="Adding…" message="Adding subjects from the timetable…">
                <IconCalendar className="h-4 w-4" /> Add {pendingCount} {pendingCount === 1 ? "subject" : "subjects"} for {pending.size}{" "}
                {pending.size === 1 ? "person" : "people"}
              </SubmitButton>
            </form>
          </>
        ) : (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm dark:bg-brand-950">Everyone already has every subject the timetable gives them.</p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="mb-3 text-lg font-semibold">Add a subject by hand</h2>
        <form action={addSubject} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="email">Faculty</label>
            <select id="email" name="email" required className="input">
              {people.map((p) => (
                <option key={p.email} value={p.email}>
                  {displayName(p)}
                  {p.initials ? ` (${p.initials})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-48">
            <label className="label" htmlFor="subject">Subject and section</label>
            <input id="subject" name="subject" required maxLength={40} list="all-subjects" className="input" placeholder="e.g. DBMS-3B" />
            <datalist id="all-subjects">
              {allSubjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <SubmitButton pendingText="Adding…" message="Adding the subject…">
            <IconPlus className="h-4 w-4" /> Add subject
          </SubmitButton>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Allotted subjects</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="thead-ink">
              <tr>
                <th className="th">Faculty</th>
                <th className="th">Subjects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
              {people.map((p) => {
                const subs = byEmail.get(p.email) ?? [];
                return (
                  <tr key={p.email}>
                    <td className="td whitespace-nowrap">
                      <span className="font-medium">{displayName(p)}</span>
                      <div className="muted text-xs">{p.initials ?? "No initials"} · {p.email}</div>
                    </td>
                    <td className="td">
                      {subs.length === 0 ? (
                        <span className="muted text-sm">None yet, so they can&apos;t request a room for a class.</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {subs.map((a) => (
                            <form key={a.subject} action={removeSubject} className="inline-flex items-center gap-1 rounded-lg border border-brand-200 py-0.5 pl-2.5 pr-1 text-sm dark:border-brand-800">
                              <input type="hidden" name="email" value={p.email} />
                              <input type="hidden" name="subject" value={a.subject} />
                              <span className="font-medium">{a.subject}</span>
                              {a.source === "timetable" && (
                                <span title="Added from the timetable" className="text-brand-500">
                                  <IconCalendar className="h-3.5 w-3.5" />
                                </span>
                              )}
                              <SubmitButton
                                className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
                                pendingText=""
                                message="Removing the subject…"
                                aria-label={`Remove ${a.subject} from ${displayName(p)}`}
                              >
                                <IconX className="h-3.5 w-3.5" />
                              </SubmitButton>
                            </form>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
