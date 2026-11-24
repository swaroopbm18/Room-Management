import Link from "next/link";
import ListSearch from "./ListSearch";
import ManualScroll from "./ManualScroll";
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
  /** Extra facts worth knowing, shown as tips. */
  tips?: string[];
  /** Something that can't be undone or that surprises people, shown as a warning. */
  warning?: string;
};

/** A chapter of the manual: a few sections about one area of the site. */
export type ManualPart = { id: string; title: string; intro?: string; sections: ManualSection[] };

export type ManualQuickStart = { title: string; text: string; href: string };
export type ManualQuestion = { q: string; a: string };
export type ManualTerm = { term: string; meaning: string };

/**
 * A user manual: quick-start cards, a search box, a table of contents by chapter, one card per
 * task with numbered steps, tips and warnings, then common questions and a glossary.
 * Prints cleanly for anyone who wants a paper copy.
 */
export default function Manual({
  title,
  subtitle,
  quickStart = [],
  parts,
  faq = [],
  glossary = [],
}: {
  title: string;
  subtitle: string;
  quickStart?: ManualQuickStart[];
  parts: ManualPart[];
  faq?: ManualQuestion[];
  glossary?: ManualTerm[];
}) {
  const extras = [...(faq.length ? [{ id: "questions", title: "Common questions" }] : []), ...(glossary.length ? [{ id: "glossary", title: "Words used on the site" }] : [])];
  return (
    <div id="manual" className="space-y-6">
      <ManualScroll root="manual" />
      <header className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-6 text-white shadow-lg shadow-brand-900/20 print:bg-none print:p-0 print:text-black print:shadow-none">
        <div className="text-xs font-semibold tracking-wider text-brand-200 uppercase print:text-black">User manual</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-brand-100 print:text-black">{subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          <PrintButton label="Print or save as PDF" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-brand-950 hover:bg-brand-100" />
        </div>
      </header>

      {quickStart.length > 0 && (
        <section aria-label="Quick start" className="print:hidden">
          <h2 className="mb-3 text-lg font-semibold">Quick start</h2>
          <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {quickStart.map((q) => (
              <li key={q.href + q.title}>
                <a href={q.href} className="card flex h-full flex-col gap-1 p-3 hover:ring-2 hover:ring-brand-400 sm:p-4">
                  <span className="font-semibold text-brand-800 dark:text-brand-200">{q.title}</span>
                  <span className="muted text-sm">{q.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label="Contents" className="card h-max max-h-[calc(100vh-6rem)] overflow-y-auto p-4 text-sm lg:sticky lg:top-20 print:hidden">
          <div className="muted mb-2 text-xs font-semibold">Contents</div>
          <ol className="space-y-3">
            {parts.map((p, pi) => (
              <li key={p.id}>
                <a href={`#${p.id}`} className="block px-2 font-semibold text-brand-900 hover:underline dark:text-brand-100">
                  {pi + 1}. {p.title}
                </a>
                <ol className="mt-1 space-y-0.5">
                  {p.sections.map((s, si) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="flex gap-2 rounded-lg px-2 py-0.5 text-brand-800 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-950">
                        <span className="muted w-7 shrink-0 tabular-nums">
                          {pi + 1}.{si + 1}
                        </span>
                        <span>{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
            {extras.map((e) => (
              <li key={e.id}>
                <a href={`#${e.id}`} className="block px-2 font-semibold text-brand-900 hover:underline dark:text-brand-100">
                  {e.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div id="manual-body" className="min-w-0 space-y-8">
          <ListSearch target="manual-body" placeholder="Search the manual" className="print:hidden" />

          {parts.map((p, pi) => (
            <section key={p.id} id={p.id} data-search-group className="scroll-mt-20 space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  <span className="muted mr-1.5 tabular-nums">{pi + 1}.</span>
                  {p.title}
                </h2>
                {p.intro && <p className="muted mt-1 max-w-3xl text-sm">{p.intro}</p>}
              </div>
              {p.sections.map((s, si) => (
                <article key={s.id} id={s.id} data-search={`${p.title} ${s.where ?? ""}`} className="card scroll-mt-20 space-y-3 p-5 print:break-inside-avoid print:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold">
                        <span className="muted mr-1.5 tabular-nums">
                          {pi + 1}.{si + 1}
                        </span>
                        {s.title}
                      </h3>
                      {s.where && <div className="muted text-xs">Where: {s.where}</div>}
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
                  {s.warning && (
                    <p className="flex gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200 ring-inset dark:bg-red-950/30 dark:text-red-100 dark:ring-red-900">
                      <span aria-hidden className="font-semibold">Careful</span>
                      <span>{s.warning}</span>
                    </p>
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
                </article>
              ))}
            </section>
          ))}

          {faq.length > 0 && (
            <section id="questions" data-search-group className="scroll-mt-20 space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">Common questions</h2>
              <div className="card divide-y divide-brand-100 dark:divide-brand-900">
                {faq.map((f) => (
                  <div key={f.q} data-search className="space-y-1 px-5 py-4 print:break-inside-avoid">
                    <h3 className="text-sm font-semibold">{f.q}</h3>
                    <p className="text-sm leading-relaxed">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {glossary.length > 0 && (
            <section id="glossary" data-search-group className="scroll-mt-20 space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">Words used on the site</h2>
              <dl className="card divide-y divide-brand-100 dark:divide-brand-900">
                {glossary.map((g) => (
                  <div key={g.term} data-search className="grid gap-x-6 gap-y-0.5 px-5 py-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)] print:break-inside-avoid">
                    <dt className="font-semibold">{g.term}</dt>
                    <dd className="leading-relaxed">{g.meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
