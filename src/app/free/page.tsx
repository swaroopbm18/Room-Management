import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import DayGrid from "@/components/DayGrid";
import PageHeader from "@/components/PageHeader";
import { getPerson } from "@/lib/auth";
import { getDaySchedule, getRooms, getSlots } from "@/lib/data";
import { bookableDates, DATE_RE, formatDate, isSunday, todayIST, workingDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Free classrooms",
  description: "Find free classrooms at BMSCE's Department of Machine Learning for any day and slot, and request one.",
  alternates: { canonical: "/free" },
};

export default async function FreeSlots({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const dates = bookableDates();
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : workingDay(todayIST());
  const [person, rooms, slots, day] = await Promise.all([getPerson(), getRooms(), getSlots(), getDaySchedule(date)]);
  const canRequest = !!person && dates.includes(date);
  const free = day.filter((r) => r.status === "free" && !r.ended).length;

  return (
    <div>
      <PageHeader
        title="Free slots"
        subtitle={
          <>
            {free} free room-slots on {formatDate(date, { weekday: "long" })}
            {canRequest
              ? " · Click a free cell to request it; you can add the following slots on the next page"
              : !person
                ? " · Faculty can sign in to request a room"
                : ""}
          </>
        }
      >
        <AutoSubmitSelect
          name="date"
          label="Date"
          value={date}
          options={(dates.includes(date) ? dates : [date, ...dates]).map((d) => ({ value: d, label: formatDate(d) }))}
        />
      </PageHeader>
      <DayGrid rooms={rooms} slots={slots} rows={day} requestDate={canRequest ? date : undefined} />
    </div>
  );
}
