import Manual, { type ManualSection } from "@/components/Manual";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Faculty user manual" };

const SECTIONS: ManualSection[] = [
  {
    id: "sign-in",
    title: "Signing in",
    where: "Sign in, top right",
    href: "/login",
    intro: "Sign in with your college Google account. Your timetable initials (for example SBM) link you to your classes, so the site knows which classes are yours.",
    steps: [
      "Press Sign in at the top right and choose your college Google account.",
      "You land on My dashboard. Your name and role show in the top bar.",
      "If My upcoming classes says your initials are not set, ask an admin to add them under Sign-in list & names.",
    ],
  },
  {
    id: "home",
    title: "The home page",
    where: "Home",
    href: "/",
    intro: "The home page shows every room in the chosen slot, free and busy faculty for the department and each cluster, notices, and upcoming events and booked slots.",
    steps: [
      "Pick a date and a slot at the top, or press Now to come back to the current slot.",
      "Click a room to see its timetable for the whole week.",
      "Type initials, a name or a class (for example 5A) in the search box to see where they are in every slot of the day.",
      "Under Upcoming events and booked slots, press the amber Classes affected button on a card to open the classes that event, CIE or booking replaced. Close the pop-up with the × or Close button.",
    ],
  },
  {
    id: "class-changes",
    title: "Class timetables and class changes",
    where: "Home → Class timetables",
    href: "/classes/changes",
    intro: "Students and faculty can see which classes are altered over the next seven days: cancelled, moved, taken by another faculty member, or replaced by an event or CIE.",
    steps: [
      "On the home page, find Class timetables and press your class (for example 3A), or All class changes for every class.",
      "Each day lists only what changed. Classes that run as usual are left out, so an empty day reads Classes as usual.",
      "The Class timetables page has three tabs for the class you picked: Week (its regular week), Today (today as it actually runs) and Changes (the next seven days).",
    ],
  },
  {
    id: "dashboard",
    title: "Your dashboard",
    where: "My dashboard → Overview",
    href: "/faculty",
    intro: "The Overview tab shows free slots today, your classes for the next seven days, classes you dropped, your calendar link and your regular week.",
    tips: ["Add the calendar link to Google Calendar or Outlook once, and your classes, bookings and substitute classes stay up to date there by themselves."],
  },
  {
    id: "exchange",
    title: "Exchanging a class with a colleague",
    where: "My dashboard → Overview → My upcoming classes → Exchange",
    href: "/faculty",
    intro:
      "Can't take a class? Ask a free colleague to take it. A class, lab or tutorial that runs over two or more back-to-back slots is one line and one request, and only colleagues free for every one of those slots are suggested.",
    steps: [
      "Under My upcoming classes, press Exchange next to the class. A two-slot lab shows as one line, for example 2:00 PM – 3:50 PM, 2 slots back to back.",
      "Pick a colleague. Teach this class lists those who already teach the same class, so they can take their own subject; Other free faculty lists everyone else free then, lightest day first.",
      "Add a note if you like, and press Send request.",
      "Your colleague accepts or declines under Exchange requests. Once they accept, it waits for an admin's final approval.",
      "When the admin approves, the class shows as your colleague's everywhere: home page, room week, free and busy faculty, calendars and the report. In the report its mode reads Faculty mutually agreed, admin approved.",
    ],
    tips: [
      "If the admin denies the request, even after your colleague agreed, nothing on the timetable changes and the class stays yours.",
      "You can withdraw a request from My requests until the admin decides.",
    ],
  },
  {
    id: "exchange-inbox",
    title: "Answering an exchange request",
    where: "My dashboard → Exchange requests",
    href: "/faculty?tab=exchange",
    intro: "When a colleague asks you to take their class, it shows under Exchange requests with an amber count on the tab.",
    steps: ["Read the class, time and room, and any note.", "Add a reply if you like, then press Accept or Decline.", "An accepted request still needs an admin's approval before the timetable changes."],
  },
  {
    id: "drop",
    title: "Dropping a class",
    where: "My dashboard → Overview → My upcoming classes → Drop",
    href: "/faculty",
    intro: "Dropping a class frees the room for others. A back-to-back class is dropped in all its slots at once.",
    steps: ["Type a short reason next to the class and press Drop.", "Dropped by mistake? Press Undo drop under Classes I dropped, any time before it starts, as long as nobody has been given the room."],
  },
  {
    id: "request-room",
    title: "Requesting a free room",
    where: "Free slots → a free room → Request",
    href: "/free",
    intro: "Book a free room for an extra class or an event. An admin approves or declines it.",
    steps: [
      "Open Free slots, pick the day and find a free room. Filter by seats or projector if you need to.",
      "Press the room and choose the slots, whether it is a class or an event, the subject and a description.",
      "For an event, attach the permission letter if you have one.",
      "Follow your request under My dashboard → My requests. You can edit or withdraw it while it is pending.",
    ],
  },
  {
    id: "meetings",
    title: "Finding a meeting time",
    where: "Faculty availability → Find a meeting time",
    href: "/faculty-status/meetings",
    intro: "Tick the colleagues who should attend and the site lists every time in the next six working days when all of them are free. Find a meeting time is also a button on your dashboard.",
  },
  {
    id: "equipment",
    title: "Equipment and resources",
    where: "Equipment",
    href: "/equipment",
    intro: "Book a portable projector, mic, speaker or kit for a class or event, first come first served. For supplies or anything that needs an admin's OK, send a request at the bottom of the page.",
  },
];

/** How to use the faculty side of the site, task by task. */
export default async function FacultyManual() {
  const person = await requireStaff();
  return (
    <Manual
      title="Faculty dashboard"
      subtitle="Everything a faculty member can do on the site: see the day, exchange or drop a class, answer a colleague, request a room and book equipment."
      sections={SECTIONS}
      other={person.role === "admin" ? { href: "/admin/manual", label: "Admin manual" } : undefined}
    />
  );
}
