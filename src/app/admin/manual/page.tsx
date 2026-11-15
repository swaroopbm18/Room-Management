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
    title: "CIE: booking rooms and cancelling classes",
    where: "Admin → Rooms → CIE → 1. Book rooms and cancel classes",
    href: "/admin/cie",
    intro: "Book the same slots in several rooms over several days in one go, and cancel the regular classes of the semesters writing the CIE.",
    steps: [
      "Pick the first and last day and the slots for the exam.",
      "Under Semesters writing the CIE, tick each semester taking it, for example 3rd and 5th.",
      "Leave Cancel all regular classes of these semesters on the CIE days ticked (it is on by default). Every class of those semesters is cancelled all day, in every room, on each CIE day.",
      "Tick the rooms for the CIE, add a title and a description, and press Book all.",
    ],
    tips: [
      "Cancelled classes show on the home page, in Class changes and in the report as Cancelled for CIE by admin.",
      "To bring one class back, restore its slot from Allot / free rooms.",
      "Sundays and holidays are skipped. Classes that have already started are left alone.",
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
