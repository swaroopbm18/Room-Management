import SubTabs from "@/components/SubTabs";

/** The views of each admin menu entry that covers more than one page, as tabs at the top of each. */
const AREAS = {
  cie: {
    label: "Bulk allot / CIE / Skill lab",
    tabs: [
      { label: "1. Bulk allot", href: "/admin/cie" },
      { label: "2. Seating plan", href: "/admin/seating" },
      { label: "Skill lab", href: "/admin/skill-lab" },
      { label: "Affected classes", href: "/admin/affected" },
    ],
  },
  records: {
    label: "Activity log",
    tabs: [
      { label: "All changes", href: "/admin/activity" },
      { label: "Bookings and decisions", href: "/admin/history" },
    ],
  },
  timetables: {
    label: "Timetables",
    tabs: [
      { label: "Room timetable", href: "/admin/timetable" },
      { label: "Class timetable", href: "/admin/class-timetable" },
      { label: "Health check", href: "/admin/health" },
    ],
  },
  supplies: {
    label: "Equipment and supplies",
    tabs: [
      { label: "Supply requests", href: "/admin/resources" },
      { label: "Equipment bookings", href: "/equipment" },
    ],
  },
} as const;

export type Area = keyof typeof AREAS;

export default function AreaTabs({ area, current, counts }: { area: Area; current: string; counts?: Record<string, number> }) {
  const a = AREAS[area];
  return <SubTabs label={a.label} tabs={a.tabs.map((t) => ({ ...t, on: t.href === current, count: counts?.[t.href] }))} />;
}
