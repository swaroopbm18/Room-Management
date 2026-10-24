import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { IconBuilding, IconCalendarCheck, IconClock } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PendingLink from "@/components/PendingLink";
import StatusBadge from "@/components/StatusBadge";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { STATUS_CELL } from "@/lib/status";
import ClosedDay from "@/components/ClosedDay";
import UpcomingBookings from "@/components/UpcomingBookings";
import { getDaySchedule, getHolidays, getSlots, getUpcomingBookings } from "@/lib/data";
import { DATE_RE, defaultSlot, formatDate, isSunday, mondayOf, nextWorkingDay, todayIST, viewableDates } from "@/lib/time";

export const dynamic = "force-dynamic";

// Tells search engines what the site is called, so it can show up for "BMSCE room management".
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: ["BMSCE Classroom Allotment", "BMSCE ML Room Management"],
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  publisher: { "@type": "CollegeOrUniversity", name: "B.M.S. College of Engineering", alternateName: "BMSCE", url: "https://bmsce.ac.in" },
};

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string }> }) {
  const sp = await searchParams;
  const [slots, holidays] = await Promise.all([getSlots(), getHolidays()]);
  const today = todayIST();
  // On a Sunday or holiday, say so instead of jumping to the next working day on its own.
  if (!sp.date && (isSunday(today) || holidays.has(today))) {
    const next = nextWorkingDay(today, holidays);
    return (
      <div className="space-y-6">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <div>
          <div className="text-xs font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-400">BMSCE Room Management</div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Classroom allotment</h1>
        </div>
        <ClosedDay date={today} holiday={holidays.get(today)} nextDate={next} nextHref={`/?date=${next}&slot=${slots[0].id}`} />
      </div>
    );
  }
  const fallback = defaultSlot(slots, holidays);
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : fallback.date;
  const slotId = slots.some((s) => String(s.id) === sp.slot) ? Number(sp.slot) : fallback.slotId;
  const slot = slots.find((s) => s.id === slotId)!;

  const UPCOMING_DAYS = 14;
  const [day, upcoming] = await Promise.all([getDaySchedule(date), getUpcomingBookings(UPCOMING_DAYS)]);
  const rows = day.filter((r) => r.slot_id === slotId);
  const freeToday = day.filter((r) => r.status === "free" && !r.ended).length;
  const freeNow = rows.filter((r) => r.status === "free").length;
  const totalRooms = rows.length;
  // A holiday with nothing booked shows the holiday instead of a page of free rooms.
  const holidayClosed = holidays.has(date) && day.every((r) => r.status === "free");
  const dates = viewableDates();
  if (!dates.includes(date)) dates.push(date);
  dates.sort();

  return (
    <div className="space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-400">BMSCE Room Management</div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Classroom allotment</h1>
          <p className="mt-1 inline-flex items-center gap-2 text-lg text-brand-700 dark:text-brand-300">
            <IconClock className="h-5 w-5" />
            <span>
              {formatDate(date, { weekday: "long" })} · {slot.label} <span className="muted text-sm">IST</span>
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
              label: `${d === today ? `Today, ${formatDate(d, { year: undefined })}` : formatDate(d)}${holidays.has(d) ? " · holiday" : ""}`,
            }))}
          />
          <AutoSubmitSelect
            name="slot"
            label="Slot"
            value={String(slotId)}
            keep={{ date }}
            options={slots.map((s) => ({ value: String(s.id), label: s.label }))}
          />
        </div>
      </section>

      {holidayClosed ? (
        <ClosedDay date={date} holiday={holidays.get(date)} nextDate={nextWorkingDay(date, holidays)} nextHref={`/?date=${nextWorkingDay(date, holidays)}&slot=${slotId}`} />
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2 sm:gap-4">
            <KpiCard
              label={
                date === today
                  ? "Free slots today"
                  : `Free slots on ${formatDate(date, { weekday: "long", day: undefined, month: undefined, year: undefined })}`
              }
              value={freeToday}
              hint={date === today ? "Room-slots still free for the rest of the day" : `Room-slots free on ${formatDate(date)}`}
              href={`/free?date=${date}`}
              linkText="Explore free slots"
              tone="navy"
              icon={<IconCalendarCheck />}
            />
            <div className="card flex flex-col divide-y divide-brand-100 px-3 sm:px-5 dark:divide-brand-900">
              <div className="flex flex-1 items-center justify-between gap-2 py-2 sm:py-3">
                <span className="text-xs font-medium text-brand-700 sm:text-sm dark:text-brand-300">Rooms occupied</span>
                <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{totalRooms - freeNow}</span>
              </div>
              <div className="flex flex-1 items-center justify-between gap-2 py-2 sm:py-3">
                <span className="text-xs font-medium text-brand-700 sm:text-sm dark:text-brand-300">Rooms free</span>
                <span className="text-2xl font-semibold tracking-tight text-brand-600 sm:text-3xl dark:text-brand-400">{freeNow}</span>
              </div>
            </div>
            <KpiCard label="Rooms" value={totalRooms} hint="Classrooms and labs on this site" tone="ink" icon={<IconBuilding />} />
          </section>

          {upcoming && <UpcomingBookings rows={upcoming} slots={slots} days={UPCOMING_DAYS} />}

          <section>
            <p className="muted mb-3 text-sm">Click a room to see its timetable for the whole week.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rows.map((r) => (
                <PendingLink
                  key={r.room_id}
                  href={`/room/${encodeURIComponent(r.room_id)}?week=${mondayOf(date)}`}
                  className={`group flex min-h-28 flex-col rounded-xl p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-brand-400 ${STATUS_CELL[r.status]}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <span className="font-semibold tracking-tight whitespace-nowrap">{r.room_name}</span>
                    {r.status !== "class" && <StatusBadge status={r.status} />}
                  </div>
                  {r.status === "free" ? (
                    <div className="mt-auto pt-3 text-sm opacity-70">No class in this slot</div>
                  ) : (
                    <div className="mt-auto pt-3 text-sm">
                      <div className="font-medium">{r.status === "department" ? `${r.subject} department` : r.subject}</div>
                      {r.status !== "department" && r.faculty_name && <div className="opacity-80">{r.faculty_name}</div>}
                      {r.reason && <div className="mt-1 line-clamp-2 text-xs opacity-70">{r.reason}</div>}
                    </div>
                  )}
                  <span className="mt-2 text-[11px] font-medium opacity-0 transition group-hover:opacity-70">View week →</span>
                </PendingLink>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
