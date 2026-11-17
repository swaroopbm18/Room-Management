import Link from "next/link";
import PrintButton from "./PrintButton";

export type ManualSection = {
  id: string;
  title: string;
  /** Where in the site this is done, e.g. "My dashboard → Overview". */
  where?: string;
  /** The page to open, for the "Open" link. */
  href?: string;
  intro: string;
  steps?: string[];
  tips?: string[];
};

/**
 * A user manual: a table of contents, then one card per task with numbered steps and tips.
 * Prints cleanly for anyone who wants a paper copy.
 */
export default function Manual({ title, subtitle, sections, other }: { title: string; subtitle: string; sections: ManualSection[]; other?: { href: string; label: string } }) {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-6 text-white shadow-lg shadow-brand-900/20 print:bg-none print:p-0 print:text-black print:shadow-none">
        <div className="text-xs font-semibold tracking-wider text-brand-200 uppercase print:text-black">User manual</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-brand-100 print:text-black">{subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          <PrintButton label="Print or save as PDF" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-brand-950 hover:bg-brand-100" />
          {other && (
            <Link href={other.href} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium hover:bg-white/10">
              {other.label}
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Contents" className="card h-max p-4 text-sm lg:sticky lg:top-20 print:hidden">
          <div className="muted mb-2 text-xs font-semibold">Contents</div>
          <ol className="space-y-1">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex gap-2 rounded-lg px-2 py-1 text-brand-800 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-950">
                  <span className="muted w-5 shrink-0 tabular-nums">{i + 1}.</span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-4">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="card scroll-mt-20 space-y-3 p-5 print:break-inside-avoid print:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">
                    <span className="muted mr-1.5 tabular-nums">{i + 1}.</span>
                    {s.title}
                  </h2>
                  {s.where && <div className="muted text-xs">{s.where}</div>}
                </div>
                {s.href && (
                  <Link href={s.href} className="btn-secondary py-1 text-xs print:hidden">
                    Open
                  </Link>
                )}
              </div>
              <p className="text-sm leading-relaxed">{s.intro}</p>
              {s.steps && s.steps.length > 0 && (
                <ol className="space-y-1.5 text-sm">
                  {s.steps.map((step, j) => (
                    <li key={j} className="flex gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white dark:bg-brand-500 dark:text-black">{j + 1}</span>
                      <span className="pt-0.5 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
              {s.tips && s.tips.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200 ring-inset dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-900">
                  {s.tips.map((t, j) => (
                    <li key={j} className="flex gap-2">
                      <span aria-hidden className="font-semibold">Tip</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
