import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import ClosedDay from "@/components/ClosedDay";
import DayNotes from "@/components/DayNotes";
import DayGrid from "@/components/DayGrid";
import PageHeader from "@/components/PageHeader";
import { getPerson } from "@/lib/auth";
import { getDayOrders, getDaySchedule, getHolidays, getRooms, getSlots, getSlotRequests } from "@/lib/data";
import { roomMatches, ROOM_KINDS, SEAT_STEPS } from "@/lib/rooms";
import { bookableDates, DATE_RE, dateOption, formatDate, isSunday, nextWorkingDay, todayIST, workingDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Free classrooms",
  description: "Find free classrooms at BMSCE's Department of Machine Learning for any day and slot, and request one.",
  alternates: { canonical: "/free" },
};

export default async function FreeSlots({ searchParams }: { searchParams: Promise<{ date?: string; seats?: string; kind?: string; projector?: string }> }) {
  const sp = await searchParams;
  const [holidays, dayOrders] = await Promise.all([getHolidays(), getDayOrders()]);
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
  // Rooms with the seats, kind and projector asked for (details come with migration 0020)
  const want = { seats: Number(sp.seats) || 0, kind: sp.kind ?? "", projector: sp.projector === "yes" };
  const hasDetails = rooms.some((r) => r.kind !== undefined);
  const shown = rooms.filter((r) => roomMatches(r, want));
  const shownIds = new Set(shown.map((r) => r.id));
  const free = day.filter((r) => r.status === "free" && !r.ended && shownIds.has(r.room_id)).length;

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
          options={(dates.includes(date) ? dates : [date, ...dates]).map((d) => ({ value: d, label: dateOption(d, holidays, formatDate(d), dayOrders.get(d)?.follows) }))}
        />
        {hasDetails && (
          <>
            <AutoSubmitSelect
              name="seats"
              label="Seats"
              value={String(want.seats || "")}
              options={[{ value: "", label: "Any" }, ...SEAT_STEPS.map((n) => ({ value: String(n), label: `${n} or more` }))]}
            />
            <AutoSubmitSelect name="kind" label="Room" value={want.kind} options={[{ value: "", label: "Any kind" }, ...ROOM_KINDS.map((k) => ({ value: k.value, label: k.label }))]} />
            <AutoSubmitSelect
              name="projector"
              label="Projector"
              value={want.projector ? "yes" : ""}
              options={[
                { value: "", label: "Not needed" },
                { value: "yes", label: "Needed" },
              ]}
            />
          </>
        )}
      </PageHeader>
      <DayNotes notices={[]} today={today} date={date} order={holiday ? undefined : dayOrders.get(date)} />
      {holiday ? (
        <ClosedDay date={date} holiday={holiday} nextDate={nextWorkingDay(date, holidays)} nextHref={`/free?date=${nextWorkingDay(date, holidays)}`} />
      ) : (
        shown.length === 0 ? (
          <div className="card muted p-8 text-center text-sm">No room has all of that. Try fewer seats or another kind of room.</div>
        ) : (
          <DayGrid rooms={shown} slots={slots} rows={day} date={date} requestDate={canRequest ? date : undefined} requests={requests} />
        )
      )}
    </div>
  );
}
