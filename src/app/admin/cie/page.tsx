import PageHeader from "@/components/PageHeader";
import { getClassSemesters, getHolidays, getRooms, getSlots } from "@/lib/data";
import { getFacultyWeeks } from "@/lib/faculty";
import { roomSummary } from "@/lib/rooms";
import { isLabRoom } from "@/lib/skillLab";
import { todayIST, workingDay } from "@/lib/time";
import AreaTabs from "../AreaTabs";
import BulkAllotForm, { type Kind } from "./BulkAllotForm";

export const dynamic = "force-dynamic";

const KINDS: Kind[] = ["cie", "see", "event", "skill_lab", "class_request"];

/**
 * Bulk allotment: one CIE, SEE, event, skill lab or class in several rooms, at several times, every
 * working day from a start date to an end date, all or none. The classes it takes rooms from are
 * listed in Classes affected, and the event itself in Upcoming events.
 */
export default async function BulkAllot({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const [rooms, slots, holidays, semesters, { faculty }] = await Promise.all([getRooms(), getSlots(), getHolidays(), getClassSemesters(todayIST()), getFacultyWeeks()]);
  const kind = KINDS.find((k) => k === sp.kind) ?? "cie";

  return (
    <div className="space-y-6">
      <AreaTabs area="cie" current="/admin/cie" />
      <PageHeader
        title="Bulk allotment"
        subtitle="Allot a CIE, SEE, event, skill lab or class in several rooms and at several times, on every working day from a start date to an end date. For an event or skill lab, pick the sections attending: their own classes are released. Classes of other sections that lose their room go to Classes affected, events and exams first. Preview first; everything is saved together, or nothing is."
      />
      <BulkAllotForm
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, summary: roomSummary(r), lab: isLabRoom(r) }))}
        slots={slots}
        semesters={semesters}
        faculty={faculty.map((f) => ({ initials: f.initials, name: f.name, cluster: f.cluster }))}
        firstDay={workingDay(todayIST(), holidays)}
        back="/admin/cie"
        initialKind={kind}
      />
    </div>
  );
}
