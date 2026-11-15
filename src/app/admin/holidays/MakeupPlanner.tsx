import { IconSwap } from "@/components/Icons";
import SubmitButton from "@/components/SubmitButton";
import type { DayOrder } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, weekdayOf, WEEKDAY_NAMES } from "@/lib/time";
import { makeUpHoliday } from "../../actions";

/** How many Sundays after each holiday are offered, and how many holidays are planned at once. */
const SUNDAYS = 3;
const HOLIDAYS = 4;

type Check = { tone: "good" | "warn" | "bad"; text: string };
type Candidate = { date: string; checks: Check[]; score: number };

/**
 * Suggested make-up days for each upcoming holiday that hasn't been made up yet: the next few
 * Sundays, each checked for what would get in the way (CIEs and events already booked, faculty
 * on leave, another make-up day, a long weekend, the end of the semester), best first.
 */
export default async function MakeupPlanner({ holidays, orders, today, back }: { holidays: Map<string, string>; orders: Map<string, DayOrder>; today: string; back: string }) {
  const tomorrow = addDays(today, 1);
  // A holiday counts as made up once a day swap's note names it, as the make-up form writes it
  const madeUp = (d: string) => [...orders.values()].find((o) => o.note.includes(`(${formatDate(d, { year: undefined })})`));
  const todo = [...holidays.entries()]
    .filter(([d]) => d >= addDays(today, -7) && weekdayOf(d) !== 7 && (orders.get(d)?.follows ?? weekdayOf(d)) <= 6)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([d]) => !madeUp(d))
    .slice(0, HOLIDAYS);
  if (!todo.length) return null;

  // The Sundays to weigh up for each holiday
  const sundaysAfter = (h: string) => {
    const out: string[] = [];
    for (let d = addDays(h, 7 - weekdayOf(h) || 7); out.length < SUNDAYS; d = addDays(d, 7)) if (d >= tomorrow) out.push(d);
    return out;
  };
  const plan = todo.map(([d, name]) => ({ date: d, name, follows: orders.get(d)?.follows ?? weekdayOf(d), sundays: sundaysAfter(d) }));
  const dates = [...new Set(plan.flatMap((p) => p.sundays))].sort();
  const supabase = await createClient();
  const [schedules, versionsRes, leaveRes] = await Promise.all([
    // A Sunday has no schedule unless it is already a make-up day, so this reads what is booked on it
    supabase.from("allotments").select("date, room_id, slot_id, kind, id").in("date", dates).order("id", { ascending: false }),
    supabase.from("timetable_versions").select("valid_from, valid_to"),
    supabase.from("faculty_leave").select("initials, starts_on, ends_on").lte("starts_on", dates.at(-1)!).gte("ends_on", dates[0]),
  ]);
  // Latest allotment per room and slot, as everywhere else
  const latest = new Map<string, { date: string; kind: string }>();
  for (const a of (schedules.data ?? []) as { date: string; room_id: string; slot_id: number; kind: string }[]) {
    const k = `${a.date}|${a.room_id}|${a.slot_id}`;
    if (!latest.has(k)) latest.set(k, a);
  }
  const versions = (versionsRes.data ?? []) as { valid_from: string; valid_to: string }[];
  const leave = (leaveRes.data ?? []) as { initials: string; starts_on: string; ends_on: string }[];

  const check = (date: string): Candidate => {
    const checks: Check[] = [];
    let score = 0;
    const booked = [...latest.values()].filter((a) => a.date === date && ["cie", "event"].includes(a.kind)).length;
    if (!versions.some((v) => date >= v.valid_from && date <= v.valid_to)) {
      checks.push({ tone: "bad", text: "After the semester ends" });
      score -= 100;
    }
    if (holidays.has(date)) {
      checks.push({ tone: "bad", text: `Holiday: ${holidays.get(date)}` });
      score -= 100;
    }
    const other = orders.get(date);
    if (other) {
      checks.push({ tone: "bad", text: `Already runs ${WEEKDAY_NAMES[other.follows - 1]}'s classes` });
      score -= 100;
    }
    if (booked) {
      checks.push({ tone: "warn", text: `${booked} slot${booked === 1 ? "" : "s"} booked for a CIE or event` });
      score -= 10 + booked;
    }
    const away = new Set(leave.filter((l) => date >= l.starts_on && date <= l.ends_on).map((l) => l.initials)).size;
    if (away) {
      checks.push({ tone: "warn", text: `${away} faculty on leave` });
      score -= 3 * away;
    }
    if (holidays.has(addDays(date, -1)) || holidays.has(addDays(date, 1))) {
      checks.push({ tone: "warn", text: "Long weekend: attendance may be low" });
      score -= 5;
    }
    if (!checks.length) checks.push({ tone: "good", text: "Nothing booked, nobody on leave" });
    return { date, checks, score };
  };

  const toneCls: Record<Check["tone"], string> = {
    good: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    bad: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">Suggested make-up days</h3>
        <p className="muted text-sm">The next Sundays after each holiday that hasn&apos;t been made up yet, checked for bookings, leave and long weekends. Best first.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {plan.map((p) => {
          const options = p.sundays.map(check).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
          return (
            <article key={p.date} className="rounded-xl border border-brand-100 p-4 dark:border-brand-900">
              <div className="font-medium">
                {formatDate(p.date, { weekday: "long", year: undefined })} · {p.name}
              </div>
              <div className="muted text-xs">{WEEKDAY_NAMES[p.follows - 1]}&apos;s classes to make up</div>
              <ul className="mt-3 space-y-2">
                {options.map((c, i) => {
                  const blocked = c.checks.some((x) => x.tone === "bad");
                  return (
                    <li key={c.date} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50/60 px-3 py-2 dark:bg-brand-950/40">
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium">
                          {formatDate(c.date, { weekday: "short", year: undefined })}
                          {i === 0 && !blocked && <span className="ml-2 text-xs font-semibold text-brand-700 dark:text-brand-300">Best</span>}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {c.checks.map((x) => (
                            <span key={x.text} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneCls[x.tone]}`}>
                              {x.text}
                            </span>
                          ))}
                        </span>
                      </span>
                      {!blocked && (
                        <form action={makeUpHoliday}>
                          <input type="hidden" name="holiday" value={p.date} />
                          <input type="hidden" name="date" value={c.date} />
                          <input type="hidden" name="back" value={back} />
                          <SubmitButton
                            className={i === 0 ? "btn-primary py-1 text-xs" : "btn-secondary py-1 text-xs"}
                            pendingText="Saving…"
                            message="Saving the make-up day…"
                            confirm={`${formatDate(c.date, { weekday: "long", year: undefined })} runs ${WEEKDAY_NAMES[p.follows - 1]}'s classes to make up for ${p.name}?`}
                          >
                            <IconSwap className="h-3.5 w-3.5" /> Use this day
                          </SubmitButton>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
