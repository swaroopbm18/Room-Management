import RememberFields from "@/components/RememberFields";
import { IconFlag } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getClassSemesters, getHolidays, getRooms, getSlots } from "@/lib/data";
import { roomSummary } from "@/lib/rooms";
import { ordinal } from "@/lib/classTimetable";
import { bookableDates, todayIST, workingDay } from "@/lib/time";
import { blockCieWeek } from "../../actions";
import SlotRange from "../allot/SlotRange";
import AreaTabs from "../AreaTabs";

export const dynamic = "force-dynamic";

/** Book the same slots in several rooms over several days at once, e.g. for a CIE week. */
export default async function CieWeek() {
  // The semesters in the timetable, with their sections, e.g. 3rd semester: 3A 3B 3C
  const [rooms, slots, holidays, semesters] = await Promise.all([getRooms(), getSlots(), getHolidays(), getClassSemesters(todayIST())]);
  const dates = bookableDates();
  const first = workingDay(todayIST(), holidays);

  return (
    <div className="space-y-6">
      <AreaTabs area="cie" current="/admin/cie" />
      <PageHeader
        title="CIE week"
        subtitle="Take the same slots in several rooms over several days in one go, and cancel the regular classes of the semesters writing the CIE. Sundays and holidays are skipped. Like a single allotment, it overrides classes and bookings and declines pending requests for those slots."
      />

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

        {semesters.length > 0 && (
          <fieldset className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <legend className="px-1 text-sm font-semibold">Semesters writing the CIE</legend>
            <p className="muted mb-3 text-xs">
              Every class of the semesters you tick is cancelled on each CIE day, all day, so students and faculty see it on the home page and in Class changes. Classes that have
              already started are left alone. A cancelled slot can be brought back from Allot / free rooms.
            </p>
            <div className="flex flex-wrap gap-2">
              {semesters.map(({ sem, classes }) => (
                <label
                  key={sem}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-100 dark:border-brand-900 dark:bg-ink dark:has-[:checked]:border-amber-500 dark:has-[:checked]:bg-amber-950"
                >
                  <input type="checkbox" name="semesters" value={sem} className="h-4 w-4 accent-amber-600" />
                  <span>
                    <span className="font-semibold">{ordinal(sem)}</span>
                    <span className="muted block text-xs">{classes.length === 1 && classes[0] === sem ? "All sections" : classes.join(" · ")}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" name="cancel_classes" value="on" defaultChecked className="mt-0.5 h-4 w-4 accent-amber-600" />
              <span>
                <span className="font-medium">Cancel all regular classes of these semesters on the CIE days</span>
                <span className="muted block text-xs">On by default. Untick to book the rooms only and leave the classes running.</span>
              </span>
            </label>
          </fieldset>
        )}

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
            <RememberFields scope="cie" fields={["kind", "title"]} />
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
        <div className="sticky-save flex justify-end">
          <SubmitButton pendingText="Booking…" message="Booking the rooms for every day…">
            <IconFlag className="h-4 w-4" /> Book all
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
