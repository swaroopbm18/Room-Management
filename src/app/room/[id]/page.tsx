import { notFound } from "next/navigation";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { ScheduleGrid, type GridRow } from "@/components/DayGrid";
import { IconCalendar, IconCalendarCheck, IconDoor } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import { getPerson } from "@/lib/auth";
import { getDaySchedule, getRooms, getSlots } from "@/lib/data";
import { addDays, bookableDates, DATE_RE, formatDate, mondayOf, todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function RoomWeek({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const roomId = decodeURIComponent(id);
  const today = todayIST();
  const monday = mondayOf(sp.week && DATE_RE.test(sp.week) ? sp.week : today);
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));

  const [person, rooms, slots, schedules] = await Promise.all([
    getPerson(),
    getRooms(),
    getSlots(),
    Promise.all(days.map((d) => getDaySchedule(d))),
  ]);
  const room = rooms.find((r) => r.id === roomId);
  if (!room) notFound();

  const bookable = new Set(person ? bookableDates() : []);
  const perDay = schedules.map((rows) => rows.filter((r) => r.room_id === roomId));
  const upcoming = perDay.flat().filter((r) => !r.ended);
  const freeCount = upcoming.filter((r) => r.status === "free").length;
  const inUse = upcoming.filter((r) => r.status !== "free" && r.status !== "department").length;

  const gridRows: GridRow[] = days.map((d, i) => {
    const free = perDay[i].filter((r) => r.status === "free" && !r.ended).length;
    return {
      key: d,
      label: (
        <>
          <span className={d === today ? "text-brand-600 dark:text-brand-300" : ""}>{formatDate(d, { year: undefined })}</span>
          <span className="mt-0.5 block text-[11px] font-normal opacity-75">{d === today ? "Today · " : ""}{free} free</span>
        </>
      ),
      cells: new Map(perDay[i].map((r) => [r.slot_id, r])),
      requestDate: bookable.has(d) ? d : undefined,
    };
  });

  const weekLink = (w: string) => `/room/${encodeURIComponent(roomId)}?week=${w}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Room ${room.name}`}
        subtitle={`Week of ${formatDate(days[0], { weekday: undefined })} to ${formatDate(days[5], { weekday: undefined })}${person ? " · Click a free cell to request it" : ""}`}
      >
        <AutoSubmitSelect name="room" label="Room" value={roomId} pathTemplate="/room/{}" keep={{ week: monday }} options={rooms.map((r) => ({ value: r.id, label: r.name }))} />
        <div className="flex items-center gap-1">
          <PendingLink href={weekLink(addDays(monday, -7))} className="btn-secondary py-2" aria-label="Previous week">
            ‹ Prev
          </PendingLink>
          <PendingLink href={weekLink(mondayOf(today))} className="btn-secondary py-2">
            This week
          </PendingLink>
          <PendingLink href={weekLink(addDays(monday, 7))} className="btn-secondary py-2" aria-label="Next week">
            Next ›
          </PendingLink>
        </div>
      </PageHeader>

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Free slots left this week" value={freeCount} tone="navy" icon={<IconCalendarCheck />} />
        <KpiCard label="Booked or in class" value={inUse} hint="Classes, bookings, CIE and events" icon={<IconCalendar />} />
        <KpiCard label="Slots this week" value={perDay.flat().length} hint={`${slots.length} slots × 6 days`} tone="ink" icon={<IconDoor />} />
      </section>

      <ScheduleGrid corner="Day" slots={slots} rows={gridRows} hint="Scroll sideways to see every slot. Faded cells have ended." />
    </div>
  );
}
