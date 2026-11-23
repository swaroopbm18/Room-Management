import Manual, { type ManualPart, type ManualQuestion, type ManualQuickStart, type ManualTerm } from "@/components/Manual";

export const metadata = { title: "Admin user manual" };

const QUICK_START: ManualQuickStart[] = [
  { title: "Decide requests", text: "Approve or reject room requests.", href: "#room-requests" },
  { title: "Book a CIE week", text: "Many rooms over many days.", href: "#cie" },
  { title: "Someone is on leave", text: "Mark leave and assign substitutes.", href: "#leave" },
  { title: "New semester", text: "The six steps, in order.", href: "#rollover" },
];

const PARTS: ManualPart[] = [
  {
    id: "start",
    title: "Getting started",
    intro: "Admins are the HoD and the Time Table Officers. You can do everything a faculty member can, plus everything in this manual.",
    sections: [
      {
        id: "admin-menu",
        title: "The admin menu",
        where: "Admin, in the top bar",
        href: "/admin/home",
        intro: "Press Admin in the top bar. The admin pages are in seven groups along the dark bar; a group with several pages shows them in a second row underneath, and some pages have tabs at the top.",
        steps: [
          "Home: today at a glance.",
          "Requests: Room requests and Class cover (exchanges and substitutes).",
          "Rooms: Allot / free rooms, Bulk allot / CIE (with Seating plan, Skill lab and Affected classes), Room details, Calendar & notices.",
          "Timetables: Room & class timetables (with the Health check) and Semester (End a semester's classes, Start a new semester).",
          "Faculty: Faculty profiles (with availability, and the Sign-in list & names tab), Leave & substitutes and Subjects.",
          "Records: Report, Usage (Rooms and Faculty workload) and Activity log.",
          "Help: this manual and the faculty manual.",
        ],
        tips: [
          "The amber number on Admin and on Requests counts the room requests waiting for you.",
          "When you sign in, you land on Room requests.",
          "Your own classes, exchanges and requests are on My dashboard, as for any faculty member. See the faculty manual.",
        ],
      },
      {
        id: "rules",
        title: "How changes work",
        intro: "A few rules hold everywhere on the site, so it helps to know them before you change anything.",
        steps: [
          "Changes to the regular timetable take effect from tomorrow. Today and every earlier day keep the timetable they had.",
          "A booking (a CIE, an event, a class you allot, an approved request) overrides the regular class in that room and slot for that day only.",
          "The past is locked. Nothing already recorded can be changed or deleted in the database, except that an admin can add a record of a past CIE, event or class, and edit or delete a record from the Report.",
          "Every change is logged with who made it and when, in the Activity log.",
          "Many actions show a message at the bottom of the screen with an Undo button: removing a holiday, notice, day swap, leave, subject or duty, and deciding a request.",
        ],
      },
      {
        id: "admin-home",
        title: "Admin home",
        where: "Admin → Home",
        href: "/admin/home",
        intro: "What needs you today: requests waiting, who is on leave, classes to cover, timetable problems, and what is coming up (holidays, day swaps and notices).",
        steps: [
          "Read the four cards at the top. Press Decide, Leave or Health check to act on one.",
          "Use the shortcut buttons to Allot a room, Add a notice or Bulk allot.",
        ],
      },
    ],
  },
  {
    id: "requests",
    title: "Requests",
    sections: [
      {
        id: "room-requests",
        title: "Approving room requests",
        where: "Admin → Requests → Room requests",
        href: "/admin",
        intro: "Faculty requests for free rooms, for an extra class or an event, grouped by room and date. A request covers all of its slots, and approving it declines the others that overlap.",
        steps: [
          "Read each request: who sent it and when, the slots, the type, subject and description.",
          "Check the warnings. A clash warning means the faculty member, or the class's section, already has a class then. An event request shows its Approval letter (PDF), or No permission letter if none was attached.",
          "Where several people want the same room, the order is the priority. Use the up and down arrows to change it.",
          "Press Approve, or type a reason and press Reject. The faculty member sees your reason.",
          "To decide many at once, tick them and press Approve ticked or Reject ticked.",
        ],
        tips: [
          "Made a slip? Under Recently decided, press Undo before the class starts. An approval undone frees the room and the request goes back to pending.",
          "An event request without a permission letter can be rejected. The request form tells faculty the letter is mandatory.",
          "Decided requests, at the top, opens the full history of decisions.",
        ],
      },
      {
        id: "exchanges",
        title: "Class cover and exchanges",
        where: "Admin → Requests → Class cover",
        href: "/admin/exchanges",
        intro:
          "Every class handed to someone else, on one page. Faculty ask a free colleague in a class exchange; you see it the moment it is sent. A class over back-to-back slots comes as one request covering every slot.",
        steps: [
          "Wait for the colleague to accept. Accepted requests show under Accepted, waiting for your approval, marked Faculty mutually agreed.",
          "Press Approve to hand every slot to the colleague. The timetable changes for everyone, and the report shows the mode Faculty mutually agreed, admin approved.",
          "Press Deny to refuse it, with a reason if you like. Nothing on the timetable changes: the original faculty member keeps every slot, even though both agreed.",
          "You can also deny a request still under Waiting for the colleague to accept.",
          "Approved by mistake? Under Recent, press Deny after all before the class starts. Every slot goes back to the original faculty member.",
        ],
        tips: ["Given by an admin, at the end, lists substitutes you assigned for leave and classes you allotted to a named faculty member. Undo one of those from Allot / free rooms."],
      },
    ],
  },
  {
    id: "rooms",
    title: "Rooms",
    sections: [
      {
        id: "allot",
        title: "Allotting a room",
        where: "Admin → Rooms → Allot / free rooms",
        href: "/admin/allot",
        intro: "Take a room for a CIE, an SEE, an event or a class over a start and end time. It overrides the regular classes in those slots, and pending requests for them are declined.",
        steps: [
          "Pick the Date, the Start time and End time, and the Room.",
          "If the same event needs more rooms or another time, press Add another room or time. All rows are allotted together with the same details.",
          "Pick the Reason: CIE (exam), SEE (exam), College event or Class.",
          "For a CIE, SEE or event, pick the faculty in charge, if any (with nobody picked, a CIE or SEE reads CIE or SEE Co-ordinators). For a class, pick the Faculty for the class, or leave it as No faculty assigned.",
          "Add a Title (or the Subject, for a class) and a Description, which shows on the timetable.",
          "Press Allot room. If a slot is already booked, you are asked before it is overwritten; only the times you picked change.",
        ],
        tips: [
          "Pick an earlier date to record a CIE, event or class that already took place, so the department's records are complete. Faculty can't do this.",
          "A class you allot to a named faculty member shows as theirs in My week, in their calendar and in free and busy faculty.",
          "To allot the same thing over several days, use Bulk allot instead.",
        ],
      },
      {
        id: "free-room",
        title: "Freeing a room, editing a booking, restoring a slot",
        where: "Admin → Rooms → Allot / free rooms",
        href: "/admin/allot",
        intro: "Free up a room removes a regular class, an approved request or a CIE or event booking from future slots, so the room shows as free and faculty can request it.",
        steps: [
          "Under Free up a room, pick the date, the start and end time and the room, give a reason (for example \"Class cancelled, faculty on leave\"), and press Free room.",
          "Upcoming changes to the timetable lists every booking and change still to come. Press Edit name or description to rename a booked class, event or CIE.",
          "Press Restore on a row, with a reason if you like, to put the slot back to the regular timetable.",
          "Day at a glance shows every room and slot for the chosen date.",
        ],
        tips: ["You can also edit a booking by opening its slot from the home page or a room's week."],
      },
      {
        id: "cie",
        title: "Bulk allot: CIE, SEE, events and classes over several days",
        where: "Admin → Rooms → Bulk allot / CIE → 1. Bulk allot",
        href: "/admin/cie",
        intro: "Allot one CIE, SEE, event or class in several rooms and at several times, on every working day from a start date to an end date, and optionally cancel the classes of the semesters writing an exam.",
        steps: [
          "Days: pick the start and end date. Tick weekdays under Only on if it runs on some days of the week; leave all unticked for every working day.",
          "Rooms and times: in each row, pick the rooms and the start and end time. Press Add rooms at another time for rooms needed at a different time.",
          "What it is for: pick the reason, add a title and a description, and optionally the faculty in charge (names, Cluster A, Cluster B or the whole department).",
          "For a CIE or SEE, tick the semesters whose classes are cancelled on those days.",
          "Press Preview to see every day and what is already booked, then Allot all. Everything is saved together, or nothing is.",
        ],
        tips: [
          "Students and faculty see one line for a class on a CIE or SEE day (\"CIE: classes cancelled\"), not every cancelled class. The report lists the CIE or SEE itself.",
          "To bring one class back, restore its slot from Allot / free rooms.",
          "Sundays (other than make-up days) and holidays are skipped. Classes that have already started are left alone.",
        ],
      },
      {
        id: "seating",
        title: "CIE seating plan",
        where: "Admin → Rooms → Bulk allot / CIE → 2. Seating plan",
        href: "/admin/seating",
        intro: "The planner fills the rooms free at a given time, biggest first, prints a seating sheet for each room's door, and can book the rooms for the CIE.",
        steps: [
          "Pick the Date and the Start and End time.",
          "Choose Seating: Every seat, Three in four seats, or Every other seat.",
          "Type each class and its number of students, one per line, for example \"3A 64\". Add the Exam name.",
          "Press Plan seating. Check the rooms and the classes in each.",
          "Press Print seating sheets to print one sheet per door, and Book these rooms to allot them for the CIE.",
        ],
      },
      {
        id: "skill-lab",
        title: "Skill lab: book labs and move the classes it displaces",
        where: "Admin → Rooms → Bulk allot / CIE → Skill lab",
        href: "/admin/skill-lab",
        intro: "Book labs for a skill lab for the sections that attend it. Their own classes at that time are released, and the classes of other sections that lose their lab are moved to a free room, the released rooms first.",
        steps: [
          "Tick the sections at the skill lab (for example 3B, 3D, 3F and 3G).",
          "Pick the labs, the start and end time, and the start and end date (tick weekdays only if it runs on some days of the week).",
          "Add a name, a description and, optionally, the faculty.",
          "Press Preview. For each day it lists the classes released, every class moved and where to, and any class that could not be moved.",
          "Press Book skill lab and move classes. Everything is saved together, or nothing is.",
        ],
        tips: [
          "A class keeps its time if any suitable room is free then. A practical moves to a free lab; when no lab is free it keeps its time in a classroom, or else moves to a lab or classroom at another time.",
          "If no room is free at its time, a class moves to another time the same day when its section is free, a room is free, and its faculty are free then and in the slot just before and just after.",
          "Another department's class in a lab only moves to a free room at the same time; tell that department.",
          "A class that cannot be moved shows as \"Room taken\". Move it later from Affected classes.",
        ],
      },
      {
        id: "affected",
        title: "Affected classes: move classes whose room was taken",
        where: "Admin → Rooms → Bulk allot / CIE → Affected classes",
        href: "/admin/affected",
        intro: "Every class over the next 7 or 14 days whose room was taken by a skill lab, an event or a booking, and that has not been moved yet, with free rooms and times where it could go.",
        steps: [
          "Pick the first day and 7 or 14 days, and press Show.",
          "Each class lists up to four suggestions: the same time in another room first, then other times that day, then the next days. Press one to move the class there.",
          "Or open Pick a room and time and choose the day, start time and room yourself. A section or faculty clash is shown and stops the move unless you tick Move anyway; a room in use is always refused.",
          "To move many at once, tick them and press Move ticked classes. Each goes to the place shown as its bulk plan, chosen so that no two classes share a room.",
          "Under Sections at events and skill labs, tick the sections that attend an event or skill lab and press Add sections. Their classes in its times are released, which frees rooms for the others.",
          "Press Class changes to share (print / PDF) for a sheet of every class moved between two dates, for all classes or one. Print it or save it as a PDF and send it to faculty and students.",
        ],
        tips: [
          "Students and faculty see a moved class as \"Moved from <room>\" on their timetable.",
          "A class shared by two sections is only released when both attend the event.",
        ],
      },
      {
        id: "room-details",
        title: "Room details",
        where: "Admin → Rooms → Room details",
        href: "/admin/rooms",
        intro: "Each room's name, seats, kind (classroom, lab or seminar hall), projector and notes. Faculty filter by these on Free slots, and the planners use them to pick suitable rooms.",
        steps: [
          "Change a room's details and press Save. The room's code stays the same when you rename it.",
          "Under Add a room, type its code, seats, kind and notes, and press Add room.",
          "Archive a room you no longer use: it leaves the schedule but keeps its history. A room with no classes or bookings yet can be deleted.",
        ],
      },
      {
        id: "calendar",
        title: "Holidays, day swaps, make-up days and notices",
        where: "Admin → Rooms → Calendar & notices",
        href: "/admin/holidays",
        intro: "Everything about the calendar on one page. Changes show for everyone at once.",
        steps: [
          "Notices: type a short message and the From and Until dates, and press Add notice. It shows at the top of the home page between those dates.",
          "Day swaps: pick a date and which weekday it Follows, add a note, and press Save swap. A Saturday or Sunday that follows a weekday runs the full day; one that follows Saturday ends at 2 PM.",
          "Make up for a holiday: pick the holiday and the make-up day (usually a Sunday) and press Save make-up day. Suggested make-up days lists the best Sundays, checked for bookings, leave and long weekends; press Use this day on one.",
          "Holidays: pick a date from tomorrow on, type its name, and press Add holiday. Press Edit to change a holiday, or Remove to delete it.",
        ],
        warning: "Adding a holiday removes that day's classes for everyone. Holidays can only be added from tomorrow on; past holidays stay as they were.",
        tips: ["Copy last year's holidays from Semester → Start a new semester, then fix festivals that move each year here."],
      },
    ],
  },
  {
    id: "timetables",
    title: "Timetables",
    sections: [
      {
        id: "room-timetable",
        title: "The room timetable",
        where: "Admin → Timetables → Room & class timetables → Room timetable",
        href: "/admin/timetable",
        intro: "The regular week for every room. Change one cell, or upload the department's Word file. Changes take effect from tomorrow.",
        steps: [
          "To change cells: pick the Day of the week, the Start and End time and the Room, type the Subject and section (leave it empty to make the slot free) and the Faculty initials, and press Save change. Tick Another department's class for a class of, say, CSE.",
          "To upload the Word file: choose the file under Upload the timetable as a Word file and press Check for changes. It must have the layout of the Room Allocation Time Table, with a \"Room Name: …\" line above each room's table.",
          "Read every change listed, then press Apply. Only the rooms in the file change.",
          "Below, Regular timetable shows one day of the week for every room, and Recent timetable changes lists what was changed.",
        ],
      },
      {
        id: "class-timetable",
        title: "The class timetable",
        where: "Admin → Timetables → Room & class timetables → Class timetable",
        href: "/admin/class-timetable",
        intro: "Each class's week (3A, 3B, … and the whole-semester subjects), built from the room timetable. Edit a class from its own week.",
        steps: [
          "Pick the class.",
          "Press the pencil on a class to change its subject, faculty initials or room (only free rooms are offered), then Save or Delete.",
          "Press a free slot to add a class there.",
        ],
        tips: ["Initials that are not in the faculty list are marked, so typos stand out."],
      },
      {
        id: "health",
        title: "Health check",
        where: "Admin → Timetables → Room & class timetables → Health check",
        href: "/admin/health",
        intro: "The timetable from tomorrow, checked for clashes and loose ends. To fix: a faculty member double-booked, unknown initials, a duty clash. To check: things that may be fine, such as lab batches.",
        steps: ["Read each problem.", "Press Fix in <class> to open that class in the class timetable editor and correct it."],
        tips: ["Unknown initials are usually a typo, or someone not on the faculty list yet. Add them under Sign-in list & names."],
      },
      {
        id: "semester-end",
        title: "Ending a semester's classes",
        where: "Admin → Timetables → Semester → End a semester's classes",
        href: "/admin/semester-end",
        intro: "When a semester's classes end, release its rooms. From the day after its last day, the timetable no longer shows that semester's classes, so its rooms are free and faculty can request them. Bookings stay, and past days keep their timetable.",
        steps: ["Pick the semester and its Last day of classes.", "Press End classes and release rooms, and confirm.", "To undo, press Bring classes back on its row below."],
        tips: ["A class taught to two semesters together stays until both have ended."],
      },
      {
        id: "rollover",
        title: "Starting a new semester",
        where: "Admin → Timetables → Semester → Start a new semester",
        href: "/admin/rollover",
        intro: "Everything to start a new semester, in six steps. The old timetable and every booking stay in the history.",
        steps: [
          "Download a backup: one Excel workbook with the timetable, bookings, requests, faculty, leave and the activity log.",
          "Upload the new timetable on Room timetable.",
          "Clear last semester's details: tick what no longer applies (other duties, subjects, ended leave) and press Clear for the new semester.",
          "Give faculty their new subjects from the new timetable.",
          "Carry holidays forward: copy the holidays between two dates to the same dates a year later.",
          "Check the new timetable with the Health check.",
        ],
        warning: "Clearing last semester's details can't be undone. Download the backup first.",
      },
    ],
  },
  {
    id: "faculty",
    title: "Faculty",
    sections: [
      {
        id: "people",
        title: "Who can sign in",
        where: "Admin → Faculty → Faculty profiles → Sign-in list & names",
        href: "/admin/people",
        intro: "Only people on this list can sign in. Initials link each person to their classes in the timetable.",
        steps: [
          "Under Add faculty (or Add admin), type the @bmsce.ac.in email, full name and title, pick their initials from the timetable, and press Add faculty (or Add admin).",
          "To change someone, press Edit on their row, then Save. To stop someone signing in, delete them: their pending requests are withdrawn, and past requests keep their name.",
          "To add many people, use Import a list: upload a CSV or paste rows of email, full name, initials, title, role, and press Import. Existing people are updated. Download a template shows the layout.",
          "Faculty names and initials lists every set of initials in the timetable with the name shown for it. Add a name where only initials show.",
        ],
        tips: ["A person marked \"Not in the timetable\" has no classes matched. Check their initials."],
      },
      {
        id: "profiles",
        title: "Faculty profiles and other duties",
        where: "Admin → Faculty → Faculty profiles",
        href: "/admin/faculty",
        intro: "One card for every faculty member with their classes a week, other duties and free slots. Press a card to open their profile.",
        steps: [
          "In a profile: Name and initials, Sign-in (email, role, access), HoD cluster, Subjects, and their Weekly timetable.",
          "To add another duty (proctoring, a committee, lab in-charge), pick the day and slots, type the duty and save. Leave the duty empty to clear those slots, or press Clear all duties.",
          "To load duties for many people at once, use Upload faculty timetables: one slot per line, initials, day, start time, duty (for example \"AKN, Mon, 8:00, Proctoring\").",
          "Put each faculty member in Cluster A or Cluster B and press Save clusters. The free and busy cards and the meeting finder use these groups.",
        ],
        tips: ["The Faculty availability button opens who is free by day or by week, and Find a meeting time. The Week tab is only for admins."],
      },
      {
        id: "leave",
        title: "Leave and substitutes",
        where: "Admin → Faculty → Leave & substitutes",
        href: "/admin/leave",
        intro: "Mark a faculty member on leave and they show as busy everywhere, so they are never suggested as a substitute. Their classes in the next two weeks are listed with the colleagues free to take each one, best fit first.",
        steps: [
          "Pick the Faculty member, the From date and the To date (leave To empty for one day), and a reason if you like. Press Add leave.",
          "Under each of their classes, read who is free to take it: same course or class first, then the lightest day.",
          "Press Assign on a colleague to give them the class. It shows as theirs everywhere and under Class cover.",
          "Press Edit to change the dates, or Remove to end the leave early.",
        ],
      },
      {
        id: "subjects",
        title: "Subjects",
        where: "Admin → Faculty → Subjects",
        href: "/admin/subjects",
        intro: "Faculty pick one of their subjects when they request a room for a class. Someone with no subjects can only request rooms for events.",
        steps: [
          "Press Add subjects from the timetable to give everyone the subjects next to their initials in the current timetable. Subjects already allotted are kept.",
          "Or, under Add a subject by hand, pick the faculty member, type the Subject and section (for example DBMS-3B) and press Add subject.",
          "Press Rename to rename a subject, or the × to remove it. Removing a subject never changes past requests.",
        ],
      },
    ],
  },
  {
    id: "records",
    title: "Records",
    sections: [
      {
        id: "report",
        title: "The report",
        where: "Admin → Records → Report",
        href: "/admin/report",
        intro: "Every event, CIE, extra class, dropped or cancelled class and class exchange between two dates, with its mode of request, ready to print with signature lines for HoD (Cluster A) and HoD (Cluster B).",
        steps: [
          "Pick the From date and To date and, if you like, a range of slots. Press Show report.",
          "Read the Mode of request column: Faculty request, Admin allotment, Faculty mutually agreed, admin approved, Dropped by faculty, Removed by admin or Cancelled for CIE by admin.",
          "Press Download CSV for a spreadsheet, or Print / save as PDF for signatures.",
          "To correct a record, press Edit on it to change its name, description or faculty. To delete one, press Delete: its time goes back to the regular timetable, and the old entry stays in the history.",
        ],
      },
      {
        id: "usage",
        title: "Usage: rooms and faculty workload",
        where: "Admin → Records → Usage",
        href: "/admin/usage",
        intro: "Room usage shows how full each room is in a week, the busiest and most idle rooms, and a busy-hours chart. Workload shows each faculty member's regular week: classes and other duties.",
        steps: [
          "On the Rooms tab, move between weeks with the arrows. Darker cells in Busy hours are busier.",
          "On the Faculty workload tab, pick the whole department or a cluster. Blue in the load bar is classes, amber is other duties. Press Download Excel for a copy.",
        ],
      },
      {
        id: "activity",
        title: "Activity log",
        where: "Admin → Records → Activity log",
        href: "/admin/activity",
        intro: "Two tabs. All changes: every change to requests, bookings, the timetable, faculty, rooms and the calendar, with who made it and when. Bookings and decisions: every allotment and rejected request, which nobody can edit or delete.",
        steps: ["Filter by email, or press a name to see only their changes.", "Search the page, and press Older activity to go further back."],
      },
    ],
  },
];

const FAQ: ManualQuestion[] = [
  { q: "I changed the timetable but today still shows the old class.", a: "Timetable changes take effect from tomorrow. To change today, allot or free the room for today on Allot / free rooms." },
  { q: "A faculty member can't sign in.", a: "Add their @bmsce.ac.in email under Sign-in list & names. If they are on the list, check that Access is set to Can sign in on their Faculty profile." },
  { q: "A faculty member sees no classes on their dashboard.", a: "Their initials are missing or don't match the timetable. Set them on their Faculty profile or under Sign-in list & names, and check the Health check for unknown initials." },
  { q: "A faculty member can't request a room for a class.", a: "They have no subjects. Add them under Subjects, or press Add subjects from the timetable." },
  { q: "I approved the wrong request.", a: "Under Recently decided on Room requests, press Undo before the class starts. The room is freed and the request goes back to pending." },
  { q: "I need to record a CIE or event that already happened.", a: "Use Allot / free rooms and pick the earlier date. Only admins can add past records." },
  { q: "A CIE cancelled a class that should still run.", a: "Restore that slot from Upcoming changes to the timetable on Allot / free rooms." },
  { q: "Who changed this, and when?", a: "Open Records → Activity log and filter by person. Bookings and decisions keeps every allotment and rejected request permanently." },
  { q: "How do I give someone admin rights?", a: "Open their Faculty profile, set Role to admin under Sign-in and save, or add them under Add admin on Sign-in list & names." },
];

const GLOSSARY: ManualTerm[] = [
  { term: "Allotment", meaning: "A room given for a CIE, SEE, event or class by an admin, or by approving a request." },
  { term: "Mode of request", meaning: "How a record came about, shown in the report: a faculty request, an admin allotment, an exchange, a drop, a removal or a CIE cancellation." },
  { term: "Restore", meaning: "Putting a slot back to the regular timetable, undoing a booking or a freed room." },
  { term: "Affected class", meaning: "A class whose room was taken by a skill lab, an event or a booking and that has not been moved yet." },
  { term: "Released class", meaning: "A class whose section is at a skill lab or event, so it doesn't run and its room is free." },
  { term: "Class cover", meaning: "Any class handed to someone else: an exchange between faculty, or a substitute you assigned." },
  { term: "Day swap", meaning: "A day that runs another weekday's timetable." },
  { term: "Health check", meaning: "An automatic check of the timetable for clashes and unknown initials." },
  { term: "Cluster A / Cluster B", meaning: "The two groups of faculty under each HoD." },
];

/** How to use the admin pages, task by task. */
export default function AdminManual() {
  return (
    <Manual
      title="Admin manual"
      subtitle="Everything an admin can do: approve requests and class exchanges, allot rooms, run a CIE week or a skill lab, keep the calendar and timetables up to date, manage faculty, and pull reports."
      quickStart={QUICK_START}
      parts={PARTS}
      faq={FAQ}
      glossary={GLOSSARY}
      other={{ href: "/faculty/manual", label: "Faculty manual" }}
    />
  );
}
