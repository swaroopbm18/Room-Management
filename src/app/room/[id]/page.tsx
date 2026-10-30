import { notFound } from "next/navigation";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { pendingBySlot, ScheduleGrid, type GridRow } from "@/components/DayGrid";
import { IconCalendar, IconCalendarCheck, IconDoor } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import PrintButton from "@/components/PrintButton";
import PendingLink from "@/components/PendingLink";
import { getPerson } from "@/lib/auth";
import { getDayOrders, getDaySchedule, getHolidays, getRooms, getSlots, getSlotRequests } from "@/lib/data";
import { roomSummary } from "@/lib/rooms";
import { addDays, bookableDates, DATE_RE, formatDate, mondayOf, todayIST, WEEKDAY_NAMES } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const room = decodeURIComponent((await params).id);
  return {
    title: `Room ${room} timetable`,
    description: `Weekly timetable and free slots for room ${room}, Department of Machine Learning, BMSCE.`,
    alternates: { canonical: `/room/${encodeURIComponent(room)}` },
  };
}

export default async function RoomWeek({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const roomId = decodeURIComponent(id);
  const today = todayIST();
  const monday = mondayOf(sp.week && DATE_RE.test(sp.week) ? sp.week : today);
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));

  const [person, rooms, slots, holidays, schedules, dayOrders, requests] = await Promise.all([
    getPerson(),
    getRooms(),
    getSlots(),
    getHolidays(),
    Promise.all(days.map((d) => getDaySchedule(d))),
    getDayOrders(),
    getSlotRequests(roomId, days[0], days[5]),
  ]);
  const room = rooms.find((r) => r.id === roomId);
  if (!room) notFound();

  const bookable = new Set(person ? bookableDates().filter((d) => !holidays.has(d)) : []);
  // A holiday shows one note across the row instead of free cells
  const perDay = schedules.map((rows, i) => (holidays.has(days[i]) ? [] : rows.filter((r) => r.room_id === roomId)));
  const upcoming = perDay.flat().filter((r) => !r.ended);
  const freeCount = upcoming.filter((r) => r.status === "free").length;
  const inUse = upcoming.filter((r) => r.status !== "free" && r.status !== "department" && r.status !== "closed").length;

  const gridRows: GridRow[] = days.map((d, i) => {
    const free = perDay[i].filter((r) => r.status === "free" && !r.ended).length;
    return {
      key: d,
      label: (
        <>
          <span className={d === today ? "text-brand-600 dark:text-brand-300" : ""}>{formatDate(d, { year: undefined })}</span>
          <span className="mt-0.5 block text-[11px] font-normal opacity-75">
            {d === today ? "Today · " : ""}
            {holidays.has(d) ? "Holiday" : `${free} free`}
            {!holidays.has(d) && dayOrders.has(d) && ` · ${WEEKDAY_NAMES[dayOrders.get(d)!.follows - 1].slice(0, 3)} timetable`}
          </span>
        </>
      ),
      cells: new Map(perDay[i].map((r) => [r.slot_id, r])),
      date: d,
      pending: requests ? pendingBySlot(requests.filter((r) => r.date === d)) : undefined,
      note: holidays.has(d) ? `Holiday: ${holidays.get(d)} · No classes, and the room can't be booked` : undefined,
      requestDate: bookable.has(d) ? d : undefined,
    };
  });

  const weekLink = (w: string) => `/room/${encodeURIComponent(roomId)}?week=${w}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Room ${room.name}`}
        subtitle={
          <>
            {roomSummary(room) && <span className="font-medium text-brand-700 dark:text-brand-300">{roomSummary(room)} · </span>}
            Week of {formatDate(days[0], { weekday: undefined })} to {formatDate(days[5], { weekday: undefined })}
            <span className="print:hidden"> · Click a slot to see who has requested it{person ? " or to request it yourself" : ""}</span>
          </>
        }
      >
        <PrintButton />
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

      <section className="grid grid-cols-3 gap-2 sm:gap-4 print:hidden">
        <KpiCard label="Free slots left this week" value={freeCount} tone="navy" icon={<IconCalendarCheck />} />
        <KpiCard label="Booked or in class" value={inUse} hint="Classes, bookings, CIE and events" icon={<IconCalendar />} />
        <KpiCard label="Slots this week" value={perDay.flat().length} hint={`${slots.length} slots × ${perDay.filter((r) => r.length).length} days`} tone="ink" icon={<IconDoor />} />
      </section>

      <ScheduleGrid corner="Day" slots={slots} rows={gridRows} hint="Scroll sideways to see every slot. Faded cells have ended." />
    </div>
  );
}
