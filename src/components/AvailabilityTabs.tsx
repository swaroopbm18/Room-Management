import PendingLink from "./PendingLink";

/**
 * The one "Faculty availability" page, seen two ways: one day (everyone) and the whole week
 * with the meeting finder (admins). Shown at the top of both.
 */
export default function AvailabilityTabs({ view, cluster, showWeek }: { view: "day" | "week"; cluster?: string; showWeek: boolean }) {
  const c = cluster === "A" || cluster === "B" ? cluster : null;
  const tabs = [
    { key: "day", label: "Day", href: `/faculty-status${c ? `?c=${c}` : ""}` },
    ...(showWeek ? [{ key: "week", label: "Week & meetings", href: `/admin/free-time${c ? `?c=${c}` : ""}` }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-brand-100 p-1 text-sm dark:bg-brand-950" role="tablist" aria-label="Faculty availability">
      {tabs.map((t) => (
        <PendingLink
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={t.key === view}
          className={`rounded-lg px-4 py-1.5 font-medium ${t.key === view ? "bg-white text-brand-950 shadow-sm dark:bg-brand-700 dark:text-white" : "text-brand-700 hover:bg-white/60 dark:text-brand-300 dark:hover:bg-brand-900"}`}
        >
          {t.label}
        </PendingLink>
      ))}
    </div>
  );
}
