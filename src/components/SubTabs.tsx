import PendingLink from "./PendingLink";

export type SubTab = { label: string; href: string; on: boolean; count?: number };

/**
 * Tabs inside one page, for a job that has a few views (CIE: book and seat; Records: changes and
 * bookings). Each tab is its own address, so a link or a refresh keeps the view.
 */
export default function SubTabs({ tabs, label }: { tabs: SubTab[]; label: string }) {
  if (tabs.length < 2) return null;
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto rounded-xl bg-brand-100 p-1 text-sm [scrollbar-width:none] sm:mx-0 sm:inline-flex sm:flex-wrap print:hidden dark:bg-brand-950" aria-label={label}>
      {tabs.map((t) => (
        <PendingLink
          key={t.href}
          href={t.href}
          aria-current={t.on ? "page" : undefined}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 font-medium whitespace-nowrap sm:py-1.5 ${t.on ? "bg-white text-brand-950 shadow-sm dark:bg-brand-700 dark:text-white" : "text-brand-700 hover:bg-white/60 dark:text-brand-300 dark:hover:bg-brand-900"}`}
        >
          {t.label}
          {!!t.count && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] leading-[18px] font-semibold text-black">{t.count}</span>}
        </PendingLink>
      ))}
    </nav>
  );
}
