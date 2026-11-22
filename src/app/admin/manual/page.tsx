import Manual, { type ManualSection } from "@/components/Manual";

export const metadata = { title: "Admin user manual" };

const SECTIONS: ManualSection[] = [
  {
    id: "admin-home",
    title: "Admin home",
    where: "Admin → Home",
    href: "/admin/home",
    intro: "A summary of the day: requests waiting for you, rooms in use, faculty on leave and anything that needs attention. The amber number on the Admin link counts what is waiting.",
  },
  {
    id: "room-requests",
    title: "Approving room requests",
    where: "Admin → Requests → Room requests",
    href: "/admin",
    intro: "Faculty requests for free rooms, for an extra class or an event.",
    steps: [
      "Open each request to see the slots, subject, description and any letter.",
      "Press Approve or Reject. You can add a note, approve several at once, or move a request to another room.",
      "Approving one request declines the others for the same slot.",
      "Made a slip? Undo a decision under Recently decided before the class starts.",
    ],
  },
  {
    id: "exchanges",
    title: "Class cover and exchanges",
    where: "Admin → Requests → Class cover",
    href: "/admin/exchanges",
    intro:
      "A faculty member asks a free colleague to take a class. A class, lab or tutorial over back-to-back slots comes as one request covering every slot. You see each request from the moment it is sent.",
    steps: [
      "Wait for the colleague to accept. Accepted requests show under Accepted, waiting for your approval, marked Faculty mutually agreed.",
      "Press Approve to hand every slot to the colleague. The timetable changes for everyone, and the report shows the mode Faculty mutually agreed, admin approved.",
      "Press Deny to refuse it. Nothing on the timetable changes: the original faculty member keeps every slot, even though both faculty agreed.",
      "Approved by mistake? Under Recent, press Deny after all before the class starts. Every slot goes back to the original faculty member.",
    ],
    tips: ["Substitutes you assign for leave, and classes you allot to a named faculty member, are listed at the end under Given by an admin, so every handed-over class is on one page."],
  },
  {
    id: "allot",
    title: "Allotting or freeing a room",
    where: "Admin → Rooms → Allot / free rooms",
    href: "/admin/allot",
    intro: "Take a room for a CIE, an event or a class, or free a room by removing a class. It overrides regular classes and bookings in those slots and declines pending requests for them.",
    steps: ["Pick the room, date and start and end time.", "Choose the reason (CIE, event or class), a title and a description.", "For a class, name the faculty member who takes it, or leave it as No faculty assigned."],
    tips: ["You can also record something that already happened, so past records are complete."],
  },
  {
    id: "cie",
    title: "Bulk allot: CIE, SEE, events and classes over several days",
    where: "Admin → Rooms → Bulk allot / CIE → 1. Bulk allot",
    href: "/admin/cie",
    intro: "Allot one CIE, SEE, event or class in several rooms and at several times, on every working day from a start date to an end date, and optionally cancel the classes of the semesters writing an exam.",
    steps: [
      "Pick the start and end date. Tick weekdays only if it runs on some days of the week.",
      "In each row, pick the rooms and the start and end time. Add a row for rooms needed at another time.",
      "Pick the reason, add a title and a description, and optionally the faculty in charge: names, Cluster A, Cluster B or the whole department.",
      "For a CIE or SEE, tick the semesters whose classes are cancelled on those days.",
      "Press Preview to see every day and what is already booked, then Allot all. Everything is saved together, or nothing is.",
    ],
    tips: [
      "Students and faculty see one line for a class on a CIE or SEE day (\"CIE: classes cancelled\"), not every cancelled class. The report lists the CIE or SEE itself.",
      "To bring one class back, restore its slot from Allot / free rooms.",
      "Sundays and holidays are skipped. Classes that have already started are left alone.",
    ],
  },
  {
    id: "skill-lab",
    title: "Skill lab: book labs for some sections and move the classes it displaces",
    where: "Admin → Rooms → Bulk allot / CIE → Skill lab",
    href: "/admin/skill-lab",
    intro: "Book labs for a skill lab for the sections that attend it. Their own classes at that time are released, and the classes of other sections that lose their lab are moved to a free room, the released rooms first.",
    steps: [
      "Tick the sections at the skill lab (e.g. 3B, 3D, 3F and 3G).",
      "Pick the labs, the start and end time, and the days (tick weekdays only if it runs on some days of the week).",
      "Add a description and, optionally, the faculty.",
      "Press Preview. For each day it lists the classes released, every class moved and where to, and any class that could not be moved. Then press Book skill lab and move classes. Everything is saved together, or nothing is.",
    ],
    tips: [
      "A class keeps its time if any suitable room is free then. A practical moves to a lab where one is free; when no lab is free it keeps its time in a classroom, or else moves to a lab at another time, or a classroom at another time.",
      "If no room is free at its time, a class moves to another time the same day when its section is free, a room is free, and its faculty are free then and in the slot just before and just after.",
      "Another department's class in a lab only moves to a free room at the same time; tell that department.",
      "A class that cannot be moved shows as \"Room taken\". Move it later from Affected classes.",
    ],
  },
  {
    id: "affected",
    title: "Affected classes: move classes whose room was taken, and share the changes",
    where: "Admin → Rooms → Bulk allot / CIE → Affected classes",
    href: "/admin/affected",
    intro: "Every class over the next 7 or 14 days whose room was taken by a skill lab, an event or a booking, and that has not been moved yet, with free rooms and times where it could go.",
    steps: [
      "Pick the first day and 7 or 14 days, and press Show.",
      "Each class lists up to four suggestions: the same time in another room first, then other times that day, then the next days. A suggestion needs the class's section free, a free room, and its faculty free then and in the slot just before and just after. Press one to move the class there.",
      "Or open Pick a room and time and choose the day, start time and room yourself. A clash with the section or faculty is shown and stops the move unless you tick Move anyway; a room in use is always refused.",
      "To move many at once, use Move in bulk: each ticked class goes to the place shown as its Bulk plan, chosen so that no two classes share a room and no section or faculty member is in two places. Untick any you want to move yourself.",
      "Under Sections at events and skill labs, tick the sections that attend an event or skill lab and press Add sections. Their classes whose room it took are no longer affected, and their own classes in its times are released, which frees rooms for the others.",
      "Press Class changes to share (print / PDF) for a sheet of every class moved between two dates (day, time, class, actual class location, moved to location and faculty), for all classes or one. Print it or save it as a PDF and send it to faculty and students.",
    ],
    tips: [
      "Students and faculty see a moved class as \"Moved from <room>\" on their timetable.",
      "A class shared by two sections is only released when both attend the event.",
      "A practical whose lab was taken gets a free lab and a free classroom for each time (marked \"classroom\"), so it can be held in a classroom when the labs are full. The bulk plan keeps its time in a classroom rather than move it to a lab at another time.",
    ],
  },
  {
    id: "seating",
    title: "CIE seating",
    where: "Admin → Rooms → CIE → 2. Seating plan",
    href: "/admin/seating",
    intro: "Type each class and its number of students. The planner fills the rooms free at that time, biggest first, prints a seating sheet for each door and can book the rooms for the CIE.",
  },
  {
    id: "equipment",
    title: "Equipment and supplies",
    where: "Admin → Rooms → Equipment & supplies",
    href: "/admin/resources",
    intro: "Two tabs. Supply requests: approve or decline what faculty ask for and keep the stock count. Equipment bookings: add or retire projectors and kits and see everyone's bookings.",
  },
  {
    id: "calendar",
    title: "Holidays, day swaps and notices",
    where: "Admin → Rooms → Calendar & notices",
    href: "/admin/holidays",
    intro: "Add holidays, make a day follow another weekday's timetable, plan make-up Sundays, and put notices on the home page. Changes show for everyone at once.",
  },
  {
    id: "timetables",
    title: "Room and class timetables",
    where: "Admin → Timetables → Room & class timetables",
    href: "/admin/timetable",
    intro: "One entry with three tabs. Room timetable: upload the Word file for a new semester or edit a cell. Class timetable: assign classes from a class's own week. Health check: clashes and unknown initials. Timetable changes take effect from tomorrow.",
  },
  {
    id: "faculty",
    title: "Faculty, leave and substitutes",
    where: "Admin → Faculty",
    href: "/admin/faculty",
    intro: "Faculty profiles, leave with suggested substitutes, the subjects each faculty member teaches, and the sign-in list with names and initials. Who is free, by day or by week, and meeting times are under Faculty availability, opened from the Faculty profiles page.",
    tips: ["A faculty member must be on the sign-in list with initials before they can accept a class exchange."],
  },
  {
    id: "report",
    title: "Report and records",
    where: "Admin → Records → Report",
    href: "/admin/report",
    intro: "Every event, CIE, extra class, dropped or cancelled class and class exchange between two dates, with its mode of request. Download it as CSV or print it for signatures.",
    steps: [
      "Pick the dates and, if you like, a range of slots.",
      "Read the Mode of request column: Faculty request, Admin allotment, Faculty mutually agreed, admin approved (class exchanges), Dropped by faculty, Removed by admin or Cancelled for CIE by admin.",
    ],
    tips: ["Room usage and Workload are separate printouts. The Activity log has two tabs: All changes, and Bookings and decisions (every allotment and rejected request), which show who changed what, and when."],
  },
];

/** How to use the admin pages, task by task. */
export default function AdminManual() {
  return (
    <Manual
      title="Admin dashboard"
      subtitle="Everything an admin can do: approve requests and class exchanges, allot rooms, run a CIE week, keep the calendar and timetables up to date, and pull reports."
      sections={SECTIONS}
      other={{ href: "/faculty/manual", label: "Faculty manual" }}
    />
  );
}
