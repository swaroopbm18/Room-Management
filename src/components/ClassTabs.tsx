import SubTabs from "./SubTabs";

/** Class timetables, three views of one class: its regular week, today as it runs, and changes ahead. */
export default function ClassTabs({ view, cls }: { view: "week" | "today" | "changes"; cls?: string | null }) {
  const q = cls && cls !== "*" ? `?class=${encodeURIComponent(cls)}` : "";
  return (
    <SubTabs
      label="Class timetables"
      tabs={[
        { label: "Week", href: `/classes${q}`, on: view === "week" },
        { label: "Today", href: `/today${q}`, on: view === "today" },
        { label: "Changes", href: `/classes/changes${q}`, on: view === "changes" },
      ]}
    />
  );
}
