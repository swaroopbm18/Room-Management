import type { Substitute } from "@/lib/substitutes";

/** Faculty free when a dropped class would have run, best fits first. */
export default function Substitutes({ people }: { people: Substitute[] }) {
  if (!people.length) return <span className="muted mt-1.5 block text-xs">Nobody else is free then.</span>;
  const shown = people.slice(0, 8);
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="muted">Free to take it:</span>
      {shown.map((p) => (
        <span
          key={p.initials}
          className={`rounded-md px-2 py-0.5 ${p.why ? "bg-brand-600 text-white dark:bg-brand-500 dark:text-black" : "bg-brand-100 text-brand-900 dark:bg-brand-900/70 dark:text-brand-100"}`}
          title={p.why}
        >
          {p.name}
          {p.why && <span className="opacity-80"> · {p.why}</span>}
        </span>
      ))}
      {people.length > shown.length && <span className="muted">and {people.length - shown.length} more</span>}
    </span>
  );
}
