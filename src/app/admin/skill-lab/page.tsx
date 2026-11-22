import PageHeader from "@/components/PageHeader";
import { getClassSemesters, getHolidays, getRooms, getSlots } from "@/lib/data";
import { getFacultyWeeks } from "@/lib/faculty";
import { roomSummary } from "@/lib/rooms";
import { isLabRoom } from "@/lib/skillLab";
import { todayIST, workingDay } from "@/lib/time";
import AreaTabs from "../AreaTabs";
import SkillLabForm from "./SkillLabForm";

export const dynamic = "force-dynamic";

/**
 * Skill lab: book labs for some sections, release those sections' own classes, and move the
 * classes that lose their lab to the rooms that frees (or another free room or time).
 */
export default async function SkillLab() {
  const [rooms, slots, holidays, semesters, { faculty }] = await Promise.all([getRooms(), getSlots(), getHolidays(), getClassSemesters(todayIST()), getFacultyWeeks()]);

  return (
    <div className="space-y-6">
      <AreaTabs area="cie" current="/admin/skill-lab" />
      <PageHeader
        title="Skill lab"
        subtitle="Book labs for a skill lab and pick the sections that go. Their own classes at that time are released, and the classes that lose their lab move to the freed rooms first, then to any other free room, or to a free time that day. Preview first; everything is saved together, or nothing is."
      />
      <SkillLabForm
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, summary: roomSummary(r), lab: isLabRoom(r) }))}
        slots={slots}
        semesters={semesters}
        faculty={faculty.map((f) => ({ initials: f.initials, name: f.name, cluster: f.cluster }))}
        firstDay={workingDay(todayIST(), holidays)}
      />
    </div>
  );
}
