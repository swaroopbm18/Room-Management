import DateInput from "@/components/DateInput";
import InlineEdit, { Field } from "@/components/InlineEdit";
import { IconCalendar, IconMegaphone, IconPlus, IconSwap, IconX } from "@/components/Icons";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getDayOrders, getHolidays, getNotices, type DayOrder } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import MakeupPlanner from "./MakeupPlanner";
import { addDays, formatDate, isSunday, todayIST, weekdayOf, WEEKDAY_NAMES } from "@/lib/time";
import { addHoliday, addNotice, makeUpHoliday, removeHoliday, removeNotice, setDayOrder, updateHoliday, updateNotice } from "../../actions";

export const dynamic = "force-dynamic";

const BACK = "/admin/holidays";

function Section({ id, icon, title, hint, children }: { id: string; icon: React.ReactNode; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-4 space-y-4 p-6">
      <div>
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
          {icon} {title}
        </h2>
        <p className="muted text-sm">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Remove({
  action,
  name,
  value,
  message,
  confirm,
  keep = {},
}: {
  action: (f: FormData) => Promise<void>;
  name: string;
  value: string;
  message: string;
  confirm: string;
  /** Sent along so the removal can be undone from the message that follows. */
  keep?: Record<string, string>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name={name} value={value} />
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="back" value={BACK} />
      <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Removing…" message={message} confirm={confirm}>
        <IconX className="h-3.5 w-3.5" /> Remove
      </SubmitButton>
    </form>
  );
}

const listCls = "divide-y divide-brand-100 rounded-lg border border-brand-100 dark:divide-brand-900 dark:border-brand-900";
const rowCls = "flex flex-wrap items-center justify-between gap-3 px-4 py-2.5";

/** Holidays, day swaps and home-page notices: everything that changes a day for everyone. */
export default async function Calendar() {
  const today = todayIST();
  const tomorrow = addDays(today, 1);
  const supabase = await createClient();
  const [holidays, orders, notices, pastRes] = await Promise.all([
    getHolidays(),
    getDayOrders(),
    getNotices(today),
    // Day swaps on past dates, kept for the records (the last semester or so)
    supabase.from("day_orders").select("date, follows, note").lt("date", today).gte("date", addDays(today, -180)).order("date", { ascending: false }),
  ]);
  const pastSwaps = (pastRes.data ?? []) as DayOrder[];
  const holidayMap = Object.fromEntries(holidays);
  const otherHolidays = (d: string) => Object.fromEntries([...holidays].filter(([k]) => k !== d));
  const upcoming = [...holidays.entries()].filter(([d]) => d >= today).sort(([a], [b]) => a.localeCompare(b));
  const swaps = [...orders.values()].filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  // Holidays that took a teaching day away, and the next Sunday after each as the suggested make-up day
  const toMakeUp = [...holidays.entries()]
    .filter(([d]) => d >= addDays(today, -14) && !isSunday(d) && (orders.get(d)?.follows ?? weekdayOf(d)) <= 6)
    .sort(([a], [b]) => a.localeCompare(b));
  const nextSunday = (d: string) => addDays(d, 7 - weekdayOf(d));
  const firstSunday = (() => {
    const base = toMakeUp.find(([d]) => d >= today)?.[0] ?? today;
    let d = nextSunday(base);
    while (d <= today) d = addDays(d, 7);
    return d;
  })();

  const swapRow = (o: DayOrder) => (
              <li key={o.date} className={rowCls}>
                <span className="min-w-0 flex-1">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <IconSwap className="h-4 w-4 text-brand-500" />
                    <span className="font-medium">{formatDate(o.date, { weekday: "long" })}</span>
                    {isSunday(o.date) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Make-up Sunday</span>}
                    <span className="muted">
                      · follows {WEEKDAY_NAMES[o.follows - 1]}
                      {o.note && ` · ${o.note}`}
                    </span>
                  </span>
                    <InlineEdit action={setDayOrder} back={BACK} title={`Edit the day swap on ${o.date}`} message="Saving the day swap…" className="mt-1">
                      <input type="hidden" name="date" value={o.date} />
                      <Field label="Follows">
                        <select name="follows" required defaultValue={String(o.follows)} className="input py-1.5 font-normal">
                          {WEEKDAY_NAMES.slice(0, 6).map((d, i) => (
                            <option key={d} value={i + 1}>
                              {d}&apos;s timetable
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Note" className="min-w-56 flex-1">
                        <input name="note" maxLength={120} defaultValue={o.note ?? ""} className="input py-1.5 font-normal" />
                      </Field>
                    </InlineEdit>
                </span>
                  <form action={setDayOrder}>
                    <input type="hidden" name="date" value={o.date} />
                    <input type="hidden" name="follows" value="" />
                    <input type="hidden" name="old_follows" value={o.follows} />
                    <input type="hidden" name="old_note" value={o.note ?? ""} />
                    <input type="hidden" name="back" value={BACK} />
                    <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Removing…" message="Removing the day swap…" confirm="Remove this day swap? The day goes back to its own timetable.">
                      <IconX className="h-3.5 w-3.5" /> Remove
                    </SubmitButton>
                  </form>
              </li>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Calendar & notices" subtitle="Holidays, days that follow another weekday's timetable, and notices on the home page. Changes show for everyone at once." />

      <Section id="notices" icon={<IconMegaphone className="h-5 w-5 text-amber-500" />} title="Notices" hint="A short message at the top of the home page between two dates, e.g. a timetable change or an exam.">
        <form action={addNotice} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <input type="hidden" name="back" value={BACK} />
          <div>
            <label className="label" htmlFor="n-msg">Message</label>
            <input id="n-msg" name="message" required maxLength={300} className="input" placeholder="e.g. CIE 2 runs 16 to 21 November; classes are suspended" />
          </div>
          <div>
            <label className="label" htmlFor="n-from">From</label>
            <input id="n-from" name="starts" type="date" required min={today} defaultValue={today} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="n-to">Until</label>
            <input id="n-to" name="ends" type="date" required min={today} defaultValue={addDays(today, 7)} className="input" />
          </div>
          <SubmitButton pendingText="Adding…" message="Adding the notice…">
            <IconPlus className="h-4 w-4" /> Add notice
          </SubmitButton>
        </form>
        {notices.length > 0 ? (
          <ul className={listCls}>
            {notices.map((n) => (
              <li key={n.id} className={rowCls}>
                <span className="min-w-0 flex-1">
                  <span className="block">{n.message}</span>
                  <span className="muted text-xs">
                    {formatDate(n.starts_on, { year: undefined })} to {formatDate(n.ends_on, { year: undefined })}
                    {n.starts_on <= today ? " · showing now" : ""}
                  </span>
                  <InlineEdit action={updateNotice} back={BACK} title="Edit this notice" message="Saving the notice…" className="mt-1">
                    <input type="hidden" name="id" value={n.id} />
                    <Field label="Message" className="min-w-64 flex-1">
                      <input name="message" required maxLength={300} defaultValue={n.message} className="input py-1.5 font-normal" />
                    </Field>
                    <Field label="From">
                      <input name="starts" type="date" required defaultValue={n.starts_on} className="input py-1.5 font-normal" />
                    </Field>
                    <Field label="Until">
                      <input name="ends" type="date" required min={today} defaultValue={n.ends_on} className="input py-1.5 font-normal" />
                    </Field>
                  </InlineEdit>
                </span>
                <Remove action={removeNotice} name="id" value={String(n.id)} message="Removing the notice…" confirm="Remove this notice from the home page?" keep={{ message: n.message, starts: n.starts_on, ends: n.ends_on }} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<IconMegaphone />} title="No notices on the home page">Add one above for anything everyone should see, like an exam week or a room closed for repairs.</EmptyState>
        )}
      </Section>

      <Section
        id="swaps"
        icon={<IconSwap className="h-5 w-5 text-brand-500" />}
        title="Day swaps"
        hint="A day that runs another weekday's classes, e.g. a Saturday that follows Monday, or a Sunday that makes up for a holiday. Rooms, free slots and faculty availability all follow it. A Saturday or Sunday that follows a weekday runs the full day; one that follows Saturday ends at 2 PM. Past dates can be entered too, for the records."
      >
        <form action={makeUpHoliday} className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900 dark:bg-brand-950/40">
          <input type="hidden" name="back" value={BACK} />
          <div>
            <h3 className="font-semibold">Make up for a holiday</h3>
            <p className="muted text-sm">
              Run a holiday&apos;s classes on another day, usually a Sunday. E.g. Monday is a holiday, so the Sunday after it follows Monday&apos;s timetable. Classes, free rooms, free
              faculty and bookings all follow it, and faculty can request rooms that day.
            </p>
          </div>
          {toMakeUp.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div>
                <label className="label" htmlFor="m-holiday">Holiday</label>
                <select id="m-holiday" name="holiday" required className="input" defaultValue={toMakeUp.find(([d]) => d >= today)?.[0] ?? toMakeUp[toMakeUp.length - 1][0]}>
                  {toMakeUp.map(([d, name]) => (
                    <option key={d} value={d}>
                      {formatDate(d, { year: undefined })} · {name} · {WEEKDAY_NAMES[(orders.get(d)?.follows ?? weekdayOf(d)) - 1]}&apos;s classes
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="m-date">Make-up day</label>
                <DateInput id="m-date" name="date" required defaultValue={firstSunday} holidays={holidayMap} allowSunday />
              </div>
              <SubmitButton pendingText="Saving…" message="Saving the make-up day…">
                <IconSwap className="h-4 w-4" /> Save make-up day
              </SubmitButton>
            </div>
          ) : (
            <p className="muted text-sm">No recent or upcoming holiday on a working day. Add the holiday below first.</p>
          )}
        </form>

        <MakeupPlanner holidays={holidays} orders={orders} today={today} back={BACK} />

        <form action={setDayOrder} className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
          <input type="hidden" name="back" value={BACK} />
          <div>
            <label className="label" htmlFor="o-date">Date</label>
            <DateInput id="o-date" name="date" required holidays={holidayMap} allowSunday />
          </div>
          <div>
            <label className="label" htmlFor="o-follows">Follows</label>
            <select id="o-follows" name="follows" className="input" required defaultValue="1">
              {WEEKDAY_NAMES.slice(0, 6).map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}&apos;s timetable
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="o-note">Note (optional)</label>
            <input id="o-note" name="note" maxLength={120} className="input" placeholder="e.g. Compensation for 9 November" />
          </div>
          <SubmitButton pendingText="Saving…" message="Saving the day swap…">
            <IconPlus className="h-4 w-4" /> Save swap
          </SubmitButton>
        </form>
        {swaps.length > 0 ? (
          <ul className={listCls}>{swaps.map(swapRow)}</ul>
        ) : (
          <EmptyState icon={<IconSwap />} title="No day swaps coming up">Every day follows its own timetable. Add a swap when a Saturday runs a weekday&apos;s classes, or make up for a holiday on a Sunday.</EmptyState>
        )}
        {pastSwaps.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand-700 dark:text-brand-300">Past day swaps, kept for the records · {pastSwaps.length}</summary>
            <ul className={`${listCls} mt-2`}>{pastSwaps.map(swapRow)}</ul>
          </details>
        )}
      </Section>

      <Section
        id="holidays"
        icon={<IconCalendar className="h-5 w-5 text-brand-500" />}
        title="Holidays"
        hint="No regular classes are shown on a holiday, and it can't be booked. Holidays can be added from tomorrow on, and past holidays stay as they were."
      >
        <form action={addHoliday} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="back" value={BACK} />
          <div>
            <label className="label" htmlFor="h-date">Date</label>
            <DateInput id="h-date" name="date" required min={tomorrow} holidays={holidayMap} />
          </div>
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="h-name">Name</label>
            <input id="h-name" name="name" required maxLength={80} className="input" placeholder="e.g. Kannada Rajyotsava" />
          </div>
          <SubmitButton pendingText="Adding…" message="Adding the holiday…">
            <IconPlus className="h-4 w-4" /> Add holiday
          </SubmitButton>
        </form>
        {upcoming.length > 0 ? (
          <ul className={listCls}>
            {upcoming.map(([d, name]) => (
              <li key={d} className={rowCls}>
                <span className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-2">
                    <IconCalendar className="h-4 w-4 text-brand-500" />
                    <span className="font-medium">{formatDate(d, { weekday: "long" })}</span>
                    <span className="muted">· {name}</span>
                  </span>
                  {d > today && (
                    <InlineEdit action={updateHoliday} back={BACK} title={`Edit the ${name} holiday`} message="Saving the holiday…" className="mt-1">
                      <input type="hidden" name="date" value={d} />
                      <Field label="Date">
                        <DateInput name="new_date" required min={tomorrow} defaultValue={d} holidays={otherHolidays(d)} className="input py-1.5 font-normal" />
                      </Field>
                      <Field label="Name" className="min-w-56 flex-1">
                        <input name="name" required maxLength={80} defaultValue={name} className="input py-1.5 font-normal" />
                      </Field>
                    </InlineEdit>
                  )}
                </span>
                {d > today ? (
                  <Remove action={removeHoliday} name="date" value={d} message="Removing the holiday…" confirm={`Remove the ${name} holiday? Classes run that day again.`} keep={{ name }} />
                ) : (
                  <span className="muted text-xs">Today</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<IconCalendar />} title="No upcoming holidays">Add them above, or copy last year&apos;s from New semester.</EmptyState>
        )}
      </Section>
    </div>
  );
}
