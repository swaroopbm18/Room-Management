import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { IconBuilding, IconCalendarCheck, IconClock, IconDoor } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PendingLink from "@/components/PendingLink";
import StatusBadge from "@/components/StatusBadge";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { STATUS_CELL } from "@/lib/status";
import { getDaySchedule, getSlots } from "@/lib/data";
import { DATE_RE, defaultSlot, formatDate, isSunday, mondayOf, todayIST, viewableDates } from "@/lib/time";

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
  const slots = await getSlots();
  const fallback = defaultSlot(slots);
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : fallback.date;
  const slotId = slots.some((s) => String(s.id) === sp.slot) ? Number(sp.slot) : fallback.slotId;
  const slot = slots.find((s) => s.id === slotId)!;

  const day = await getDaySchedule(date);
  const rows = day.filter((r) => r.slot_id === slotId);
  const freeToday = day.filter((r) => r.status === "free" && !r.ended).length;
  const freeNow = rows.filter((r) => r.status === "free").length;
  const totalRooms = rows.length;
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
            options={dates.map((d) => ({ value: d, label: d === todayIST() ? `Today, ${formatDate(d, { year: undefined })}` : formatDate(d) }))}
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

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard
          label={
            date === todayIST()
              ? "Free slots today"
              : `Free slots on ${formatDate(date, { weekday: "long", day: undefined, month: undefined, year: undefined })}`
          }
          value={freeToday}
          hint={date === todayIST() ? "Room-slots still free for the rest of the day" : `Room-slots free on ${formatDate(date)}`}
          href={`/free?date=${date}`}
          linkText="Explore free slots"
          tone="navy"
          icon={<IconCalendarCheck />}
        />
        <KpiCard label="Free rooms in this slot" value={freeNow} hint={slot.label} icon={<IconDoor />} />
        <KpiCard label="Rooms" value={totalRooms} hint={`${totalRooms - freeNow} in use in this slot`} tone="ink" icon={<IconBuilding />} />
      </section>

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
    </div>
  );
}
