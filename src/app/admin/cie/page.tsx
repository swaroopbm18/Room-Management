import PageHeader from "@/components/PageHeader";
import { getClassSemesters, getHolidays, getRooms, getSlots } from "@/lib/data";
import { getFacultyWeeks } from "@/lib/faculty";
import { roomSummary } from "@/lib/rooms";
import { todayIST, workingDay } from "@/lib/time";
import AreaTabs from "../AreaTabs";
import BulkAllotForm from "./BulkAllotForm";

export const dynamic = "force-dynamic";

/**
 * Bulk allot: one event, CIE, SEE or class in several rooms, at several times, every working day
 * from a start date to an end date, all or none.
 */
export default async function BulkAllot() {
  const [rooms, slots, holidays, semesters, { faculty }] = await Promise.all([getRooms(), getSlots(), getHolidays(), getClassSemesters(todayIST()), getFacultyWeeks()]);

  return (
    <div className="space-y-6">
      <AreaTabs area="cie" current="/admin/cie" />
      <PageHeader
        title="Bulk allot"
        subtitle="Allot one CIE, SEE, event or class in several rooms and at several times, on every working day from a start date to an end date. Preview first to see what is already booked. Everything is saved together, or nothing is."
      />
      <BulkAllotForm
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, summary: roomSummary(r) }))}
        slots={slots}
        semesters={semesters}
        faculty={faculty.map((f) => ({ initials: f.initials, name: f.name, cluster: f.cluster }))}
        firstDay={workingDay(todayIST(), holidays)}
        back="/admin/cie"
      />
    </div>
  );
}
