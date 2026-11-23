"use client";

import { usePathname } from "next/navigation";
import { IconActivity, IconDashboard, IconArchive, IconCalendar, IconChart, IconLeave, IconCalendarCheck, IconDoor, IconFile, IconFlag, IconInbox, IconMegaphone, IconTag, IconSwap, IconUser, IconUsers, IconBook } from "./Icons";
import PendingLink from "./PendingLink";

/** `also`: other pages that are views of this tab, reached from tabs inside the page. */
type Tab = { href: string; label: string; icon: React.ReactNode; also?: string[] };
type Group = { label: string; icon: React.ReactNode; tabs: Tab[] };

const i = "h-4 w-4";

/** The admin pages in six groups; each group opens on its first page. */
const GROUPS: Group[] = [
  { label: "Home", icon: <IconDashboard className={i} />, tabs: [{ href: "/admin/home", label: "Admin home", icon: <IconDashboard className={i} /> }] },
  {
    label: "Requests",
    icon: <IconInbox className={i} />,
    tabs: [
      { href: "/admin", label: "Room requests", icon: <IconInbox className={i} /> },
      { href: "/admin/exchanges", label: "Class cover", icon: <IconSwap className={i} /> },
    ],
  },
  {
    label: "Rooms",
    icon: <IconFlag className={i} />,
    tabs: [
      { href: "/admin/allot", label: "Allot / free rooms", icon: <IconFlag className={i} /> },
      { href: "/admin/cie", label: "Bulk allot & events", icon: <IconCalendarCheck className={i} />, also: ["/admin/skill-lab", "/admin/affected", "/admin/events"] },
      { href: "/admin/rooms", label: "Room details", icon: <IconDoor className={i} /> },
      { href: "/admin/holidays", label: "Calendar & notices", icon: <IconMegaphone className={i} /> },
    ],
  },
  {
    label: "Timetables",
    icon: <IconCalendar className={i} />,
    tabs: [
      { href: "/admin/timetable", label: "Room & class timetables", icon: <IconCalendar className={i} />, also: ["/admin/class-timetable", "/admin/timetable-pdfs", "/admin/health"] },
      { href: "/admin/semester-end", label: "Semester", icon: <IconArchive className={i} />, also: ["/admin/rollover"] },
    ],
  },
  {
    label: "Faculty",
    icon: <IconUsers className={i} />,
    tabs: [
      { href: "/admin/faculty", label: "Faculty profiles", icon: <IconUser className={i} />, also: ["/admin/free-time", "/admin/people"] },
      { href: "/admin/leave", label: "Leave & substitutes", icon: <IconLeave className={i} /> },
      { href: "/admin/subjects", label: "Subjects", icon: <IconTag className={i} /> },
    ],
  },
  {
    label: "Records",
    icon: <IconFile className={i} />,
    tabs: [
      { href: "/admin/report", label: "Report", icon: <IconFile className={i} /> },
      { href: "/admin/usage", label: "Usage", icon: <IconChart className={i} />, also: ["/admin/workload"] },
      { href: "/admin/activity", label: "Activity log", icon: <IconActivity className={i} />, also: ["/admin/history"] },
    ],
  },
  {
    label: "Help",
    icon: <IconBook className={i} />,
    tabs: [
      { href: "/admin/manual", label: "Admin manual", icon: <IconBook className={i} /> },
      { href: "/faculty/manual", label: "Faculty manual", icon: <IconUser className={i} /> },
    ],
  },
];

const under = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
const isOn = (path: string, t: Tab) => [t.href, ...(t.also ?? [])].some((h) => under(path, h));

export default function AdminNav({ pending }: { pending: number }) {
  const path = usePathname();
  const group = GROUPS.find((g) => g.tabs.some((t) => isOn(path, t))) ?? GROUPS[0];
  return (
    <nav className="mb-6 space-y-2 print:hidden" aria-label="Admin">
      {/* One scrolling row on a phone, wrapping from tablet width up */}
      <div className="-mx-1 flex gap-1 overflow-x-auto rounded-xl bg-brand-950 p-1 text-sm shadow-sm [scrollbar-width:none] sm:mx-0 sm:flex-wrap dark:border dark:border-brand-900 dark:bg-ink">
        {GROUPS.map((g) => {
          const on = g === group;
          return (
            <PendingLink
              key={g.label}
              href={g.tabs[0].href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-medium whitespace-nowrap sm:py-1.5 ${on ? "bg-white text-brand-950" : "text-brand-100 hover:bg-white/10 hover:text-white"}`}
            >
              {g.icon}
              {g.label}
              {g.label === "Requests" && pending > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] leading-[18px] font-semibold text-black">{pending}</span>}
            </PendingLink>
          );
        })}
      </div>
      {group.tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto text-sm [scrollbar-width:none] sm:flex-wrap">
          {group.tabs.map((t) => {
            const on = isOn(path, t);
            return (
              <PendingLink
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-medium whitespace-nowrap sm:py-1.5 ${
                  on ? "bg-brand-100 text-brand-900 dark:bg-brand-900/70 dark:text-brand-100" : "text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950"
                }`}
              >
                {t.icon}
                {t.label}
              </PendingLink>
            );
          })}
        </div>
      )}
    </nav>
  );
}
