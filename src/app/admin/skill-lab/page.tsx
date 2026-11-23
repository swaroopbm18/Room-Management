import { redirect } from "next/navigation";

/** A skill lab is booked from Bulk allotment now, as an event for some sections. */
export default function SkillLab() {
  redirect("/admin/cie?kind=skill_lab");
}
