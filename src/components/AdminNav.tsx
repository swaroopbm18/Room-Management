"use client";

import { usePathname } from "next/navigation";
import { IconCalendar, IconCalendarCheck, IconClock, IconDoor, IconFile, IconFlag, IconHistory, IconInbox, IconMegaphone, IconTag, IconUser, IconUsers } from "./Icons";
import PendingLink from "./PendingLink";

type Tab = { href: string; label: string; icon: React.ReactNode };
type Group = { label: string; icon: React.ReactNode; tabs: Tab[] };

const i = "h-4 w-4";

/** The admin pages in five groups; each group opens on its first page. */
const GROUPS: Group[] = [
  { label: "Requests", icon: <IconInbox className={i} />, tabs: [{ href: "/admin", label: "Requests", icon: <IconInbox className={i} /> }] },
  {
    label: "Rooms",
    icon: <IconFlag className={i} />,
    tabs: [
      { href: "/admin/allot", label: "Allot / free rooms", icon: <IconFlag className={i} /> },
      { href: "/admin/cie", label: "CIE week", icon: <IconCalendarCheck className={i} /> },
      { href: "/admin/rooms", label: "Room details & QR", icon: <IconDoor className={i} /> },
      { href: "/admin/holidays", label: "Calendar & notices", icon: <IconMegaphone className={i} /> },
    ],
  },
  {
    label: "Timetables",
    icon: <IconCalendar className={i} />,
    tabs: [
      { href: "/admin/timetable", label: "Room timetable", icon: <IconCalendar className={i} /> },
      { href: "/admin/class-timetable", label: "Class timetable", icon: <IconCalendarCheck className={i} /> },
    ],
  },
  {
    label: "Faculty",
    icon: <IconUsers className={i} />,
    tabs: [
      { href: "/admin/faculty", label: "Faculty profiles", icon: <IconUser className={i} /> },
      { href: "/admin/free-time", label: "Availability & meetings", icon: <IconClock className={i} /> },
      { href: "/admin/subjects", label: "Subjects", icon: <IconTag className={i} /> },
      { href: "/admin/people", label: "Sign-in list & names", icon: <IconUsers className={i} /> },
    ],
  },
  {
    label: "Records",
    icon: <IconFile className={i} />,
    tabs: [
      { href: "/admin/report", label: "Report", icon: <IconFile className={i} /> },
      { href: "/admin/workload", label: "Workload", icon: <IconClock className={i} /> },
      { href: "/admin/history", label: "History", icon: <IconHistory className={i} /> },
    ],
  },
];

const isOn = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));

export default function AdminNav({ pending }: { pending: number }) {
  const path = usePathname();
  const group = GROUPS.find((g) => g.tabs.some((t) => isOn(path, t.href))) ?? GROUPS[0];
  return (
    <nav className="mb-6 space-y-2 print:hidden" aria-label="Admin">
      <div className="flex flex-wrap gap-1 rounded-xl bg-brand-950 p-1 text-sm shadow-sm dark:border dark:border-brand-900 dark:bg-ink">
        {GROUPS.map((g) => {
          const on = g === group;
          return (
            <PendingLink
              key={g.label}
              href={g.tabs[0].href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${on ? "bg-white text-brand-950" : "text-brand-100 hover:bg-white/10 hover:text-white"}`}
            >
              {g.icon}
              {g.label}
              {g.label === "Requests" && pending > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] leading-[18px] font-semibold text-black">{pending}</span>}
            </PendingLink>
          );
        })}
      </div>
      {group.tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 text-sm">
          {group.tabs.map((t) => {
            const on = isOn(path, t.href);
            return (
              <PendingLink
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium ${
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
