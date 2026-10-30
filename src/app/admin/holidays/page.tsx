import Flash from "@/components/Flash";
import { IconCalendar, IconMegaphone, IconPlus, IconSwap, IconX } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getDayOrders, getHolidays, getNotices } from "@/lib/data";
import { addDays, formatDate, todayIST, WEEKDAY_NAMES } from "@/lib/time";
import { addHoliday, addNotice, removeHoliday, removeNotice, setDayOrder } from "../../actions";

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

function Remove({ action, name, value, message }: { action: (f: FormData) => Promise<void>; name: string; value: string; message: string }) {
  return (
    <form action={action}>
      <input type="hidden" name={name} value={value} />
      <input type="hidden" name="back" value={BACK} />
      <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Removing…" message={message}>
        <IconX className="h-3.5 w-3.5" /> Remove
      </SubmitButton>
    </form>
  );
}

const listCls = "divide-y divide-brand-100 rounded-lg border border-brand-100 dark:divide-brand-900 dark:border-brand-900";
const rowCls = "flex flex-wrap items-center justify-between gap-3 px-4 py-2.5";

/** Holidays, day swaps and home-page notices: everything that changes a day for everyone. */
export default async function Calendar({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const tomorrow = addDays(today, 1);
  const [holidays, orders, notices] = await Promise.all([getHolidays(), getDayOrders(), getNotices(today)]);
  const upcoming = [...holidays.entries()].filter(([d]) => d >= today).sort(([a], [b]) => a.localeCompare(b));
  const swaps = [...orders.values()].filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-8">
      <PageHeader title="Calendar & notices" subtitle="Holidays, days that follow another weekday's timetable, and notices on the home page. Changes show for everyone at once." />
      <Flash msg={sp.msg} error={sp.error} />

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
                </span>
                <Remove action={removeNotice} name="id" value={String(n.id)} message="Removing the notice…" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">No notices.</p>
        )}
      </Section>

      <Section
        id="swaps"
        icon={<IconSwap className="h-5 w-5 text-brand-500" />}
        title="Day swaps"
        hint="A working day that runs another weekday's classes, e.g. a Saturday that follows Monday. Rooms, free slots and faculty availability all follow it. A Saturday that follows a weekday runs the full day."
      >
        <form action={setDayOrder} className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
          <input type="hidden" name="back" value={BACK} />
          <div>
            <label className="label" htmlFor="o-date">Date</label>
            <input id="o-date" name="date" type="date" required min={tomorrow} className="input" />
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
          <ul className={listCls}>
            {swaps.map((o) => (
              <li key={o.date} className={rowCls}>
                <span className="inline-flex flex-wrap items-center gap-2">
                  <IconSwap className="h-4 w-4 text-brand-500" />
                  <span className="font-medium">{formatDate(o.date, { weekday: "long" })}</span>
                  <span className="muted">
                    · follows {WEEKDAY_NAMES[o.follows - 1]}
                    {o.note && ` · ${o.note}`}
                  </span>
                </span>
                {o.date > today ? (
                  <form action={setDayOrder}>
                    <input type="hidden" name="date" value={o.date} />
                    <input type="hidden" name="follows" value="" />
                    <input type="hidden" name="back" value={BACK} />
                    <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Removing…" message="Removing the day swap…">
                      <IconX className="h-3.5 w-3.5" /> Remove
                    </SubmitButton>
                  </form>
                ) : (
                  <span className="muted text-xs">Today</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">No day swaps coming up.</p>
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
            <input id="h-date" name="date" type="date" required min={tomorrow} className="input" />
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
                <span className="inline-flex items-center gap-2">
                  <IconCalendar className="h-4 w-4 text-brand-500" />
                  <span className="font-medium">{formatDate(d, { weekday: "long" })}</span>
                  <span className="muted">· {name}</span>
                </span>
                {d > today ? <Remove action={removeHoliday} name="date" value={d} message="Removing the holiday…" /> : <span className="muted text-xs">Today</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">No upcoming holidays.</p>
        )}
      </Section>
    </div>
  );
}
