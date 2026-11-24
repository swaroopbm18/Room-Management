/**
 * Every page in the side navigation, in sections. The side nav shows the sections the signed-in
 * person can use: everyone's pages, their own, and the admin pages for admins.
 */
export type IconName =
  | "home" | "calendarCheck" | "calendar" | "users" | "dashboard" | "plus" | "book" | "inbox" | "swap" | "flag"
  | "door" | "megaphone" | "archive" | "user" | "leave" | "tag" | "file" | "chart" | "activity";

/** `also`: other pages that are views of this item, reached from tabs inside the page. */
export type NavItem = { href: string; label: string; icon: IconName; also?: string[]; badge?: "pending" };
export type NavSection = { label: string; icon?: IconName; items: NavItem[]; admin?: boolean };

export const GENERAL: NavSection = {
  label: "Rooms & classes",
  items: [
    { href: "/", label: "Home", icon: "home", also: ["/room", "/slot"] },
    { href: "/free", label: "Free slots", icon: "calendarCheck" },
    { href: "/classes", label: "Class timetables", icon: "calendar", also: ["/today"] },
    { href: "/faculty-status", label: "Faculty availability", icon: "users" },
  ],
};

export const MINE: NavSection = {
  label: "My work",
  items: [
    { href: "/faculty", label: "My dashboard", icon: "dashboard", also: ["/faculty/exchange"] },
    { href: "/request", label: "Request a room", icon: "plus" },
    { href: "/help", label: "Help", icon: "book", also: ["/faculty/manual", "/admin/manual"] },
  ],
};

/** The admin pages in six groups. */
export const ADMIN: NavSection[] = [
  { label: "Admin home", icon: "dashboard", admin: true, items: [{ href: "/admin/home", label: "Admin home", icon: "dashboard" }] },
  {
    label: "Requests",
    icon: "inbox",
    admin: true,
    items: [
      { href: "/admin", label: "Room requests", icon: "inbox", badge: "pending" },
      { href: "/admin/exchanges", label: "Class cover", icon: "swap" },
    ],
  },
  {
    label: "Rooms",
    icon: "flag",
    admin: true,
    items: [
      { href: "/admin/allot", label: "Allot / free rooms", icon: "flag" },
      { href: "/admin/cie", label: "Bulk allot & events", icon: "calendarCheck", also: ["/admin/skill-lab", "/admin/affected", "/admin/events"] },
      { href: "/admin/rooms", label: "Room details", icon: "door" },
      { href: "/admin/holidays", label: "Calendar & notices", icon: "megaphone" },
    ],
  },
  {
    label: "Timetables",
    icon: "calendar",
    admin: true,
    items: [
      { href: "/admin/timetable", label: "Room & class timetables", icon: "calendar", also: ["/admin/class-timetable", "/admin/timetable-pdfs", "/admin/health"] },
      { href: "/admin/semester-end", label: "Semester", icon: "archive", also: ["/admin/rollover"] },
    ],
  },
  {
    label: "Faculty",
    icon: "users",
    admin: true,
    items: [
      { href: "/admin/faculty", label: "Faculty profiles", icon: "user", also: ["/admin/free-time", "/admin/people"] },
      { href: "/admin/leave", label: "Leave & substitutes", icon: "leave" },
      { href: "/admin/subjects", label: "Subjects", icon: "tag" },
    ],
  },
  {
    label: "Records",
    icon: "file",
    admin: true,
    items: [
      { href: "/admin/report", label: "Report", icon: "file" },
      { href: "/admin/usage", label: "Usage", icon: "chart", also: ["/admin/workload"] },
      { href: "/admin/activity", label: "Activity log", icon: "activity", also: ["/admin/history"] },
    ],
  },
];

const under = (path: string, href: string) => (href === "/" || href === "/admin" || href === "/faculty" ? path === href : path === href || path.startsWith(href + "/"));

/** Whether the page at `path` is this item (or one of its views). */
export const isOn = (path: string, item: NavItem) => [item.href, ...(item.also ?? [])].some((h) => under(path, h));
