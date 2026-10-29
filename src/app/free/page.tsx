import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import ClosedDay from "@/components/ClosedDay";
import DayGrid from "@/components/DayGrid";
import PageHeader from "@/components/PageHeader";
import { getPerson } from "@/lib/auth";
import { getDaySchedule, getHolidays, getRooms, getSlots, getSlotRequests } from "@/lib/data";
import { bookableDates, DATE_RE, dateOption, formatDate, isSunday, nextWorkingDay, todayIST, workingDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Free classrooms",
  description: "Find free classrooms at BMSCE's Department of Machine Learning for any day and slot, and request one.",
  alternates: { canonical: "/free" },
};

export default async function FreeSlots({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const holidays = await getHolidays();
  const dates = bookableDates();
  const today = todayIST();
  if (!sp.date && (isSunday(today) || holidays.has(today))) {
    const next = nextWorkingDay(today, holidays);
    return (
      <div>
        <PageHeader title="Free slots" subtitle="Rooms that are free for each slot of the day" />
        <ClosedDay date={today} holiday={holidays.get(today)} nextDate={next} nextHref={`/free?date=${next}`} />
      </div>
    );
  }
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : workingDay(today, holidays);
  const holiday = holidays.get(date);
  const [person, rooms, slots, day, requests] = await Promise.all([getPerson(), getRooms(), getSlots(), getDaySchedule(date), getSlotRequests(null, date, date)]);
  const canRequest = !!person && dates.includes(date) && !holiday;
  const free = day.filter((r) => r.status === "free" && !r.ended).length;

  return (
    <div>
      <PageHeader
        title="Free slots"
        subtitle={
          <>
            {holiday ? `Holiday on ${formatDate(date, { weekday: "long" })}` : `${free} free room-slots on ${formatDate(date, { weekday: "long" })}`}
            {holiday
              ? ""
              : canRequest
                ? " · Click a free cell to request it; you can add the following slots on the next page"
                : !person
                  ? " · Click a slot to see its requests; faculty can sign in to request a room"
                  : " · Click a slot to see its requests"}
          </>
        }
      >
        <AutoSubmitSelect
          name="date"
          label="Date"
          value={date}
          options={(dates.includes(date) ? dates : [date, ...dates]).map((d) => ({ value: d, label: dateOption(d, holidays) }))}
        />
      </PageHeader>
      {holiday ? (
        <ClosedDay date={date} holiday={holiday} nextDate={nextWorkingDay(date, holidays)} nextHref={`/free?date=${nextWorkingDay(date, holidays)}`} />
      ) : (
        <DayGrid rooms={rooms} slots={slots} rows={day} date={date} requestDate={canRequest ? date : undefined} requests={requests} />
      )}
    </div>
  );
}
