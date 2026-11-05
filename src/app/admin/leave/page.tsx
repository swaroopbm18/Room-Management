import InlineEdit, { Field } from "@/components/InlineEdit";
import { IconLeave, IconPlus, IconX } from "@/components/Icons";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import Substitutes from "@/components/Substitutes";
import { getHolidays, getSlots } from "@/lib/data";
import { findSubstitutes } from "@/lib/substitutes";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, isSunday, todayIST } from "@/lib/time";
import type { ScheduleRow } from "@/lib/types";
import { addLeave, removeLeave, updateLeave } from "../../actions";

export const dynamic = "force-dynamic";

const BACK = "/admin/leave";
/** Classes and substitutes are worked out for leave in the next two weeks. */
const AHEAD = 14;

type Leave = { id: number; initials: string; starts_on: string; ends_on: string; reason: string; created_by: string };
type Cell = { room_id: string; slot_id: number; subject: string; faculty_initials: string[]; is_department: boolean };
type Class = { room_id: string; date: string; slot_id: number; subject: string };

/** Faculty on leave, and for each day they're away, their classes and who is free to take them. */
export default async function LeavePage() {
  const today = todayIST();
  const supabase = await createClient();
  const [leaveRes, dirRes, peopleRes, slots, holidays] = await Promise.all([
    supabase.from("faculty_leave").select("id, initials, starts_on, ends_on, reason, created_by").gte("ends_on", addDays(today, -7)).order("starts_on"),
    supabase.from("faculty_directory").select("initials, title, full_name"),
    supabase.from("people").select("initials, title, full_name").not("initials", "is", null).eq("active", true),
    getSlots(),
    getHolidays(),
  ]);
  const ready = !leaveRes.error;
  const leave = (leaveRes.data ?? []) as Leave[];
  const names = new Map<string, string>();
  for (const p of [...(dirRes.data ?? []), ...(peopleRes.data ?? [])] as { initials: string; title: string | null; full_name: string }[]) {
    names.set(p.initials, p.full_name.trim() ? `${p.title ? p.title + " " : ""}${p.full_name}` : (names.get(p.initials) ?? p.initials));
  }
  const faculty = [...names.entries()].sort(([, a], [, b]) => a.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.\s*/, "").localeCompare(b.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.\s*/, "")));
  const slotLabel = new Map(slots.map((s) => [s.id, s.label]));

  // Working days of each leave within the next two weeks
  const horizon = addDays(today, AHEAD - 1);
  const daysOf = (l: Leave) => {
    const out: string[] = [];
    for (let d = l.starts_on < today ? today : l.starts_on; d <= l.ends_on && d <= horizon; d = addDays(d, 1)) if (!isSunday(d) && !holidays.has(d)) out.push(d);
    return out;
  };
  const dates = [...new Set(leave.flatMap(daysOf))].sort();
  const [schedules, timetables] = await Promise.all([
    Promise.all(dates.map((d) => supabase.rpc("get_day_schedule", { p_date: d }))),
    Promise.all(dates.map((d) => supabase.rpc("get_timetable", { p_date: d }))),
  ]);
  /** The classes `ini` still has on `date`: in the timetable and not dropped or booked over. */
  const classesOf = (ini: string, date: string): Class[] => {
    const i = dates.indexOf(date);
    const held = new Set(((schedules[i].data ?? []) as ScheduleRow[]).filter((r) => r.status === "class").map((r) => `${r.room_id}|${r.slot_id}`));
    return ((timetables[i].data ?? []) as Cell[])
      .filter((c) => !c.is_department && c.faculty_initials.includes(ini) && held.has(`${c.room_id}|${c.slot_id}`))
      .map((c) => ({ room_id: c.room_id, date, slot_id: c.slot_id, subject: c.subject }))
      .sort((a, b) => (slotLabel.get(a.slot_id) ?? "").localeCompare(slotLabel.get(b.slot_id) ?? "") || a.slot_id - b.slot_id);
  };
  const plan = leave.map((l) => ({ l, days: daysOf(l).map((d) => ({ date: d, classes: classesOf(l.initials, d) })) }));
  const all = plan.flatMap((p) => p.days.flatMap((d) => d.classes));
  const subs = await findSubstitutes(all);
  const current = plan.filter((p) => p.l.ends_on >= today);
  const past = plan.filter((p) => p.l.ends_on < today);
  const toCover = all.length;
  const byStart = (a: Class, b: Class) => a.slot_id - b.slot_id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave & substitutes"
        subtitle="Mark a faculty member on leave and they show as busy everywhere, so they're never suggested as a substitute. Their classes in the next two weeks are listed here with the colleagues free to take each one."
      />
      {!ready && <div className="card muted p-4 text-sm">Run supabase/migrations/0023_leave_and_activity_log.sql in the Supabase SQL Editor to record leave.</div>}

      {ready && (
        <form action={addLeave} className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1.4fr)_10rem_10rem_minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="back" value={BACK} />
          <div>
            <label className="label" htmlFor="lv-who">Faculty member</label>
            <select id="lv-who" name="initials" required defaultValue="" className="input">
              <option value="" disabled>
                Pick someone
              </option>
              {faculty.map(([ini, name]) => (
                <option key={ini} value={ini}>
                  {name === ini ? ini : `${name} · ${ini}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lv-from">From</label>
            <input id="lv-from" name="from" type="date" required min={today} defaultValue={today} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="lv-to">To</label>
            <input id="lv-to" name="to" type="date" min={today} className="input" placeholder="Same day" />
          </div>
          <div>
            <label className="label" htmlFor="lv-why">Reason (optional)</label>
            <input id="lv-why" name="reason" maxLength={120} className="input" placeholder="e.g. Conference, medical leave" />
          </div>
          <SubmitButton pendingText="Saving…" message="Saving the leave…">
            <IconPlus className="h-4 w-4" /> Add leave
          </SubmitButton>
          <p className="muted text-xs sm:col-span-5">Leave &quot;To&quot; empty for a single day.</p>
        </form>
      )}

      {ready && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            On leave now and coming up <span className="muted text-sm font-normal">· {current.length}{toCover ? ` · ${toCover} class${toCover === 1 ? "" : "es"} to cover` : ""}</span>
          </h2>
          {current.length === 0 && <EmptyState icon={<IconLeave />} title="Nobody is on leave">When you add someone&apos;s leave above, their classes and who is free to cover them show here.</EmptyState>}
          {current.map(({ l, days }) => (
            <article key={l.id} className="card overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50/60 px-4 py-3 dark:border-brand-900 dark:bg-brand-950/40">
                <div>
                  <div className="font-semibold">
                    {names.get(l.initials) ?? l.initials} <span className="muted font-normal">· {l.initials}</span>
                  </div>
                  <div className="muted text-xs">
                    {l.starts_on === l.ends_on ? formatDate(l.starts_on) : `${formatDate(l.starts_on)} to ${formatDate(l.ends_on)}`}
                    {l.reason && ` · ${l.reason}`} · added by {l.created_by}
                  </div>
                  <InlineEdit action={updateLeave} back={BACK} title={`Edit ${l.initials}'s leave`} message="Saving the leave…" className="mt-1">
                    <input type="hidden" name="id" value={l.id} />
                    <Field label="From">
                      <input name="from" type="date" required defaultValue={l.starts_on} className="input py-1.5 font-normal" />
                    </Field>
                    <Field label="To">
                      <input name="to" type="date" required defaultValue={l.ends_on} className="input py-1.5 font-normal" />
                    </Field>
                    <Field label="Reason" className="min-w-48 flex-1">
                      <input name="reason" maxLength={120} defaultValue={l.reason ?? ""} className="input py-1.5 font-normal" />
                    </Field>
                  </InlineEdit>
                </div>
                <form action={removeLeave}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="initials" value={l.initials} />
                  <input type="hidden" name="from" value={l.starts_on} />
                  <input type="hidden" name="to" value={l.ends_on} />
                  <input type="hidden" name="reason" value={l.reason ?? ""} />
                  <input type="hidden" name="back" value={BACK} />
                  <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Removing…" message="Removing the leave…" confirm={`Remove ${l.initials}'s leave? They'll show as free again.`}>
                    <IconX className="h-3.5 w-3.5" /> Remove
                  </SubmitButton>
                </form>
              </header>
              <div className="divide-y divide-brand-100 dark:divide-brand-900">
                {days.length === 0 && <p className="muted px-4 py-3 text-sm">No working days in the next two weeks.</p>}
                {days.map((d) => (
                  <div key={d.date} className="px-4 py-3">
                    <div className="text-sm font-semibold">{formatDate(d.date, { weekday: "long", year: undefined })}</div>
                    {d.classes.length === 0 ? (
                      <p className="muted text-xs">No classes that day.</p>
                    ) : (
                      <ul className="mt-1.5 space-y-2">
                        {[...d.classes].sort(byStart).map((c) => (
                          <li key={`${c.room_id}|${c.slot_id}`} className="text-sm">
                            <span className="font-medium">{c.subject}</span>
                            <span className="muted">
                              {" "}
                              · {slotLabel.get(c.slot_id)} · {c.room_id}
                            </span>
                            <Substitutes people={subs.get(`${c.room_id}|${c.date}|${c.slot_id}`)?.people ?? []} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <IconLeave className="h-4 w-4" /> Ended in the last week
          </h2>
          <div className="card divide-y divide-brand-100 text-sm dark:divide-brand-900">
            {past.map(({ l }) => (
              <div key={l.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {names.get(l.initials) ?? l.initials} <span className="muted">· {l.initials}</span>
                </span>
                <span className="muted">
                  {l.starts_on === l.ends_on ? formatDate(l.starts_on) : `${formatDate(l.starts_on)} to ${formatDate(l.ends_on)}`}
                  {l.reason && ` · ${l.reason}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
