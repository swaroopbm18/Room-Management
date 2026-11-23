import SubTabs from "@/components/SubTabs";

/** The views of each admin menu entry that covers more than one page, as tabs at the top of each. */
const AREAS = {
  cie: {
    label: "Bulk allotment, classes affected and upcoming events",
    tabs: [
      { label: "Bulk allotment", href: "/admin/cie" },
      { label: "Classes affected", href: "/admin/affected" },
      { label: "Upcoming events", href: "/admin/events" },
      { label: "CIE seating plan", href: "/admin/seating" },
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
