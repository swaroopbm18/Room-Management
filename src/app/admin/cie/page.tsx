import Flash from "@/components/Flash";
import { IconFlag } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getHolidays, getRooms, getSlots } from "@/lib/data";
import { roomSummary } from "@/lib/rooms";
import { bookableDates, todayIST, workingDay } from "@/lib/time";
import { blockCieWeek } from "../../actions";
import SlotRange from "../allot/SlotRange";

export const dynamic = "force-dynamic";

/** Book the same slots in several rooms over several days at once, e.g. for a CIE week. */
export default async function CieWeek({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const [rooms, slots, holidays] = await Promise.all([getRooms(), getSlots(), getHolidays()]);
  const dates = bookableDates();
  const first = workingDay(todayIST(), holidays);

  return (
    <div className="space-y-6">
      <PageHeader
        title="CIE week"
        subtitle="Take the same slots in several rooms over several days in one go. Sundays and holidays are skipped. Like a single allotment, it overrides classes and bookings and declines pending requests for those slots."
      />
      <Flash msg={sp.msg} error={sp.error} />

      <form action={blockCieWeek} className="card space-y-5 p-6">
        <input type="hidden" name="back" value="/admin/cie" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="from_date">First day</label>
            <input id="from_date" name="from_date" type="date" required min={dates[0]} max={dates[dates.length - 1]} defaultValue={first} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="to_date">Last day</label>
            <input id="to_date" name="to_date" type="date" required min={dates[0]} max={dates[dates.length - 1]} defaultValue={first} className="input" />
          </div>
          <div className="lg:col-span-2">
            <SlotRange slots={slots} />
          </div>
        </div>

        <fieldset>
          <legend className="label">Rooms</legend>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {rooms.map((r) => (
              <label key={r.id} className="flex items-start gap-2 rounded-lg border border-brand-100 px-3 py-2 text-sm hover:bg-brand-50 dark:border-brand-900 dark:hover:bg-brand-950">
                <input type="checkbox" name="rooms" value={r.id} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>
                  <span className="font-semibold">{r.name}</span>
                  {roomSummary(r) && <span className="muted block text-xs">{roomSummary(r)}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="kind">Reason</label>
            <select id="kind" name="kind" className="input">
              <option value="cie">CIE (exam)</option>
              <option value="event">College event</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" className="input" placeholder="e.g. CIE-2, 5th sem" />
          </div>
          <div>
            <label className="label" htmlFor="reason">
              Description <span className="text-red-600">*</span>
            </label>
            <input id="reason" name="reason" required minLength={5} className="input" placeholder="Shown on the timetable" />
          </div>
        </div>
        <p className="muted text-xs">Days can be picked up to {dates.length} days ahead, the same window as single allotments.</p>
        <div className="flex justify-end">
          <SubmitButton pendingText="Booking…" message="Booking the rooms for every day…">
            <IconFlag className="h-4 w-4" /> Book all
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
