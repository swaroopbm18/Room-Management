import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { IconCalendarCheck, IconClock, IconSearch } from "@/components/Icons";
import FacultyCard from "@/components/FacultyCard";
import KpiCard from "@/components/KpiCard";
import PendingLink from "@/components/PendingLink";
import StatusBadge from "@/components/StatusBadge";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { STATUS_CELL } from "@/lib/status";
import ClosedDay from "@/components/ClosedDay";
import DayNotes from "@/components/DayNotes";
import SaturdayClosed from "@/components/SaturdayClosed";
import UpcomingBookings from "@/components/UpcomingBookings";
import {
  getDayOrders,
  getDaySchedule,
  getFacultyStatus,
  getHolidays,
  getNotices,
  getSlots,
  getUpcomingBookings,
  type FacultySlotStatus,
} from "@/lib/data";
import { sameStudents, sectionOf } from "@/lib/clashes";
import type { ScheduleRow, Slot } from "@/lib/types";
import {
  DATE_RE,
  dateOption,
  defaultSlot,
  formatDate,
  isSunday,
  mondayOf,
  nextWorkingDay,
  slotOpen,
  todayIST,
  viewableDates,
  closingDay,
} from "@/lib/time";

export const dynamic = "force-dynamic";

// Tells search engines what the site is called, so it can show up for "BMSCE room management".
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: ["BMSCE Classroom Allotment", "BMSCE ML Room Management"],
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  publisher: {
    "@type": "CollegeOrUniversity",
    name: "B.M.S. College of Engineering",
    alternateName: "BMSCE",
    url: "https://bmsce.ac.in",
  },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; slot?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const [slots, holidays, dayOrders] = await Promise.all([getSlots(), getHolidays(), getDayOrders()]);
  const today = todayIST();
  // On a Sunday or holiday, say so instead of jumping to the next working day on its own.
  if (!sp.date && (isSunday(today) || holidays.has(today))) {
    const next = nextWorkingDay(today, holidays);
    return (
      <div className="space-y-6">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div>
          <div className="text-xs font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-400">
            BMSCE Room Management
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Classroom allotment
          </h1>
        </div>
        <ClosedDay
          date={today}
          holiday={holidays.get(today)}
          nextDate={next}
          nextHref={`/?date=${next}&slot=${slots[0].id}`}
        />
      </div>
    );
  }
  const fallback = defaultSlot(slots, holidays);
  const date =
    sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date)
      ? sp.date
      : fallback.date;
  const holiday = holidays.get(date);
  const slotId = slots.some((s) => String(s.id) === sp.slot)
    ? Number(sp.slot)
    : fallback.slotId;
  const slot = slots.find((s) => s.id === slotId)!;
  // Saturday after 2 PM has no classes: no free faculty, no requests
  const order = dayOrders.get(date);
  const weekday = closingDay(date, order?.follows);
  const closed = !slotOpen(weekday, slot);
  const lastOpen = [...slots].reverse().find((s) => slotOpen(weekday, s))!;

  const UPCOMING_DAYS = 14;
  const [day, upcoming, status, notices] = await Promise.all([
    getDaySchedule(date),
    getUpcomingBookings(UPCOMING_DAYS),
    getFacultyStatus(date),
    getNotices(today),
  ]);
  const inSlot = (status ?? []).filter((f) => f.slot_id === slotId);
  // Free and busy faculty in the chosen slot: the whole department (null) or one cluster
  const counts = (cluster: "A" | "B" | null) => {
    const rows = cluster ? inSlot.filter((f) => f.cluster === cluster) : inSlot;
    const free = rows.filter((f) => !f.busy).length;
    return { free, busy: rows.length - free };
  };
  const rows = day.filter((r) => r.slot_id === slotId);
  const freeToday = day.filter((r) => r.status === "free" && !r.ended).length;
  const freeNow = rows.filter((r) => r.status === "free").length;
  const isNow = date === fallback.date && slotId === fallback.slotId;
  const q = (sp.q ?? "").trim();
  const found = q && !holiday ? search(q, status ?? [], day) : null;
  const dates = viewableDates();
  if (!dates.includes(date)) dates.push(date);
  dates.sort();

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-400">
            BMSCE Room Management
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Classroom allotment
          </h1>
          <p className="mt-1 inline-flex items-center gap-2 text-lg text-brand-700 dark:text-brand-300">
            <IconClock className="h-5 w-5" />
            <span>
              {formatDate(date, { weekday: "long" })} · {slot.label}{" "}
              <span className="muted text-sm">IST</span>
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AutoSubmitSelect
            name="date"
            label="Date"
            value={date}
            keep={{ slot: String(slotId) }}
            options={dates.map((d) => ({
              value: d,
              label: dateOption(
                d,
                holidays,
                d === today
                  ? `Today, ${formatDate(d, { year: undefined })}`
                  : formatDate(d),
                dayOrders.get(d)?.follows,
              ),
            }))}
          />
          <AutoSubmitSelect
            name="slot"
            label="Slot"
            value={String(slotId)}
            keep={{ date }}
            options={slots.map((s) => ({
              value: String(s.id),
              label: slotOpen(weekday, s)
                ? s.label
                : `${s.label} (no classes on Saturday)`,
            }))}
          />
          {!isNow && (
            <PendingLink href="/" className="btn-secondary self-end py-2">
              <IconClock className="h-4 w-4" /> Now
            </PendingLink>
          )}
        </div>
      </section>

      <DayNotes notices={notices} today={today} date={date} order={holiday ? undefined : order} />

      {/* A holiday shows that it can't be booked instead of a page of free rooms. */}
      {holiday ? (
        <ClosedDay
          date={date}
          holiday={holiday}
          nextDate={nextWorkingDay(date, holidays)}
          nextHref={`/?date=${nextWorkingDay(date, holidays)}&slot=${slotId}`}
        />
      ) : closed ? (
        <SaturdayClosed
          href={`/?date=${date}&slot=${lastOpen.id}`}
          label={lastOpen.label.split(" – ")[0]}
        />
      ) : (
        <section
          className="grid gap-3 sm:grid-cols-3 sm:gap-4"
          aria-label="Free and busy faculty"
        >
          <FacultyCard
            label="Machine Learning Department"
            {...counts(null)}
            href={`/faculty-status?date=${date}&slot=${slotId}`}
            ready={!!status}
            tone="navy"
          />
          <FacultyCard
            label="Cluster A"
            {...counts("A")}
            href={`/faculty-status?date=${date}&slot=${slotId}&c=A`}
            ready={!!status}
            tone="light"
          />
          <FacultyCard
            label="Cluster B"
            {...counts("B")}
            href={`/faculty-status?date=${date}&slot=${slotId}&c=B`}
            ready={!!status}
            tone="ink"
          />
        </section>
      )}

      {!holiday && (
        <form className="flex flex-wrap gap-2" role="search">
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="slot" value={slotId} />
          <input
            name="q"
            defaultValue={q}
            aria-label="Find a faculty member or class"
            placeholder="Find a faculty member or class, e.g. SBM, Swaroop or 5A"
            className="input min-w-0 flex-1 sm:max-w-md"
          />
          <button className="btn-primary">
            <IconSearch className="h-4 w-4" /> Find
          </button>
          {q && (
            <PendingLink
              href={`/?date=${date}&slot=${slotId}`}
              className="btn-secondary"
            >
              Clear
            </PendingLink>
          )}
        </form>
      )}
      {found && (
        <SearchResults
          q={q}
          found={found}
          slots={slots}
          slotId={slotId}
          date={date}
          weekday={weekday}
        />
      )}
      {upcoming && (
        <UpcomingBookings
          rows={upcoming.filter((r) => !holidays.has(r.date))}
          slots={slots}
          days={UPCOMING_DAYS}
        />
      )}

      {!holiday && (
        <section>
          <p className="muted mb-3 text-sm">
            Click a room to see its timetable for the whole week.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {rows.map((r) => (
              <PendingLink
                key={r.room_id}
                href={`/room/${encodeURIComponent(r.room_id)}?week=${mondayOf(date)}`}
                className={`group flex min-h-28 flex-col rounded-xl p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-brand-400 ${STATUS_CELL[r.status]}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                  <span className="font-semibold tracking-tight whitespace-nowrap">
                    {r.room_name}
                  </span>
                  {r.status !== "class" && <StatusBadge status={r.status} />}
                </div>
                {r.status === "free" || r.status === "closed" ? (
                  <div className="mt-auto pt-3 text-sm opacity-70">
                    {r.status === "free"
                      ? "No class in this slot"
                      : "Saturday classes end at 2 PM"}
                  </div>
                ) : (
                  <div className="mt-auto pt-3 text-sm">
                    <div className="font-medium">
                      {r.status === "department"
                        ? `${r.subject} department`
                        : r.subject}
                    </div>
                    {r.status !== "department" && r.faculty_name && (
                      <div className="opacity-80">{r.faculty_name}</div>
                    )}
                    {r.reason && (
                      <div className="mt-1 line-clamp-2 text-xs opacity-70">
                        {r.reason}
                      </div>
                    )}
                  </div>
                )}
                <span className="mt-2 text-[11px] font-medium opacity-0 transition group-hover:opacity-70">
                  View week →
                </span>
              </PendingLink>
            ))}
          </div>
        </section>
      )}

      {!holiday && (
        <section
          className="grid grid-cols-2 gap-2 sm:gap-4"
          aria-label="Room statistics"
        >
          <KpiCard
            label={
              date === today
                ? "Free slots today"
                : `Free slots on ${formatDate(date, { weekday: "long", day: undefined, month: undefined, year: undefined })}`
            }
            value={freeToday}
            hint={
              date === today
                ? "Room-slots still free for the rest of the day"
                : `Room-slots free on ${formatDate(date)}`
            }
            href={`/free?date=${date}`}
            linkText="Explore free slots"
            tone="navy"
            icon={<IconCalendarCheck />}
          />
          <div className="card flex flex-col divide-y divide-brand-100 px-3 sm:px-5 dark:divide-brand-900">
            <div className="flex flex-1 items-center justify-between gap-2 py-2 sm:py-3">
              <span className="text-xs font-medium text-brand-700 sm:text-sm dark:text-brand-300">
                Rooms occupied
              </span>
              <span className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {
                  rows.filter(
                    (r) => r.status !== "free" && r.status !== "closed",
                  ).length
                }
              </span>
            </div>
            <div className="flex flex-1 items-center justify-between gap-2 py-2 sm:py-3">
              <span className="text-xs font-medium text-brand-700 sm:text-sm dark:text-brand-300">
                Rooms free
              </span>
              <span className="text-2xl font-semibold tracking-tight text-brand-600 sm:text-3xl dark:text-brand-400">
                {freeNow}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

type Found = {
  key: string;
  title: string;
  sub?: string;
  bySlot: Map<number, string>;
};

/**
 * Faculty whose name or initials match `q`, and, for a class like "5A", that class's slots:
 * what each is doing in every slot of the day.
 */
function search(
  q: string,
  status: FacultySlotStatus[],
  day: ScheduleRow[],
): Found[] {
  const needle = q.toLowerCase();
  const out: Found[] = [];
  const people = new Map<string, Found>();
  for (const f of status) {
    if (
      !f.initials.toLowerCase().startsWith(needle) &&
      !f.name.toLowerCase().includes(needle)
    )
      continue;
    if (!people.has(f.initials))
      people.set(f.initials, {
        key: f.initials,
        title: f.name,
        sub: f.initials,
        bySlot: new Map(),
      });
    if (f.busy)
      people
        .get(f.initials)!
        .bySlot.set(
          f.slot_id,
          `${f.activity ?? "Busy"}${f.room_id ? ` · ${f.room_id}` : ""}`,
        );
  }
  out.push(...[...people.values()].slice(0, 6));
  const section = /^\d[a-z]?$/i.test(q) ? q.toUpperCase() : null;
  if (section) {
    const cls: Found = {
      key: `class-${section}`,
      title: section.length === 1 ? `Semester ${section}` : `Class ${section}`,
      bySlot: new Map(),
    };
    for (const r of day) {
      const s = sectionOf(r.subject);
      if (
        s &&
        (r.status === "class" || r.status === "booked") &&
        sameStudents(s, section)
      ) {
        const prev = cls.bySlot.get(r.slot_id);
        cls.bySlot.set(
          r.slot_id,
          `${prev ? prev + " / " : ""}${r.subject} · ${r.room_name}`,
        );
      }
    }
    out.unshift(cls);
  }
  return out;
}

function SearchResults({
  q,
  found,
  slots,
  slotId,
  date,
  weekday,
}: {
  q: string;
  found: Found[];
  slots: Slot[];
  slotId: number;
  date: string;
  weekday: number;
}) {
  return (
    <section className="card overflow-hidden" aria-label="Search results">
      <div className="border-b border-brand-100 px-4 py-3 text-sm dark:border-brand-900">
        {found.length === 0 ? (
          <span className="muted">Nobody or no class matches “{q}”.</span>
        ) : (
          <span className="font-medium">
            Where they are on {formatDate(date, { weekday: "long" })}
          </span>
        )}
      </div>
      <div className="divide-y divide-brand-100 dark:divide-brand-900">
        {found.map((f) => {
          const now = f.bySlot.get(slotId);
          return (
            <div key={f.key} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {f.title}{" "}
                  {f.sub && (
                    <span className="muted text-xs font-normal">{f.sub}</span>
                  )}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${now ? "bg-brand-600 text-white dark:bg-brand-500 dark:text-black" : "bg-brand-100 text-brand-800 dark:bg-brand-900/70 dark:text-brand-100"}`}
                >
                  {now
                    ? `In this slot: ${now}`
                    : slotOpen(weekday, slots.find((s) => s.id === slotId)!)
                      ? "Free in this slot"
                      : "No classes in this slot"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {slots.map((s) => {
                  const what = f.bySlot.get(s.id);
                  return (
                    <span
                      key={s.id}
                      className={`rounded-md px-2 py-1 ${s.id === slotId ? "ring-2 ring-brand-500" : ""} ${what ? "bg-brand-100 text-brand-950 dark:bg-brand-900/60 dark:text-brand-50" : "muted bg-brand-50 dark:bg-brand-950/40"}`}
                    >
                      <span className="font-semibold">
                        {s.label.split(" – ")[0]}
                      </span>{" "}
                      {what ?? (slotOpen(weekday, s) ? "Free" : "No classes")}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
