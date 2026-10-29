import { IconArrowRight, IconUser, IconUsers } from "./Icons";
import PendingLink from "./PendingLink";

/** A home-page KPI card for the faculty free or busy in the chosen slot, linking to the full list. */
export default function FacultyCard({
  kind,
  count,
  clusters,
  href,
  ready,
}: {
  kind: "free" | "busy";
  count: number;
  clusters: { A: number; B: number };
  href: string;
  ready: boolean;
}) {
  const free = kind === "free";
  const box = free
    ? "bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 shadow-brand-900/20"
    : "bg-gradient-to-br from-ink via-brand-950 to-brand-900 shadow-black/20 dark:border dark:border-brand-900";
  return (
    <PendingLink
      href={href}
      className={`group flex flex-col rounded-2xl p-3 text-white shadow-lg transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand-400 sm:p-5 ${box}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-brand-200 sm:text-sm">{free ? "Free faculty" : "Busy faculty"}</div>
        <span className="hidden rounded-lg bg-white/10 p-1.5 sm:inline-flex">{free ? <IconUser /> : <IconUsers />}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight sm:text-4xl">{ready ? count : "—"}</div>
      <div className="mt-1 text-xs text-brand-200/80">{ready ? (free ? "No class or duty in this slot" : "Teaching or on a duty in this slot") : "Not available yet"}</div>
      {ready && (
        <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3">
          {(["A", "B"] as const).map((c) => (
            <span key={c} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium ring-1 ring-white/20 ring-inset sm:text-xs">
              Cluster {c} · {clusters[c]}
            </span>
          ))}
        </div>
      )}
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium group-hover:underline sm:mt-3 sm:text-sm">
        See who, by slot and cluster <IconArrowRight className="h-4 w-4" />
      </span>
    </PendingLink>
  );
}
