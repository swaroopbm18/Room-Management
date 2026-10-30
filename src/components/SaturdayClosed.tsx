import { IconClock } from "./Icons";
import PendingLink from "./PendingLink";

/** Shown in place of free and busy faculty when the chosen slot is Saturday after 2 PM. */
export default function SaturdayClosed({ href, label }: { href: string; label: string }) {
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-200">
          <IconClock className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">Saturday classes end at 2 PM</h2>
          <p className="muted text-sm">Nobody is counted as free or busy after that, and no room can be requested.</p>
        </div>
      </div>
      <PendingLink href={href} className="btn-secondary">
        See {label} →
      </PendingLink>
    </section>
  );
}
