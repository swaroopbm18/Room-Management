import { IconArrowRight, IconUsers } from "./Icons";
import PendingLink from "./PendingLink";

const TONES = {
  navy: "bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white shadow-lg shadow-brand-900/20",
  ink: "bg-gradient-to-br from-ink via-brand-950 to-brand-900 text-white shadow-lg shadow-black/20 dark:border dark:border-brand-900",
  light: "card",
};

/** A home-page KPI card: how many faculty of a group are free and busy in the chosen slot, linking to who. */
export default function FacultyCard({
  label,
  free,
  busy,
  href,
  ready,
  tone,
}: {
  label: string;
  free: number;
  busy: number;
  href: string;
  ready: boolean;
  tone: keyof typeof TONES;
}) {
  const dark = tone !== "light";
  const sub = dark ? "text-brand-200" : "text-brand-700 dark:text-brand-300";
  const total = free + busy;
  return (
    <PendingLink href={href} className={`group flex flex-col rounded-2xl p-4 transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand-400 sm:p-5 ${TONES[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{label}</div>
          <div className={`text-xs ${sub}`}>{ready ? `${total} faculty` : "Not available yet"}</div>
        </div>
        <span className={`hidden rounded-lg p-1.5 sm:inline-flex ${dark ? "bg-white/10" : "bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-200"}`}>
          <IconUsers />
        </span>
      </div>
      <div className={`mt-3 grid grid-cols-2 divide-x ${dark ? "divide-white/15" : "divide-brand-100 dark:divide-brand-900"}`}>
        <div className="pr-3">
          <div className={`text-xs font-medium ${sub}`}>Free</div>
          <div className="text-3xl font-semibold tracking-tight sm:text-4xl">{ready ? free : "—"}</div>
        </div>
        <div className="pl-3">
          <div className={`text-xs font-medium ${sub}`}>Busy</div>
          <div className={`text-3xl font-semibold tracking-tight sm:text-4xl ${dark ? "text-white/70" : "text-neutral-500 dark:text-neutral-400"}`}>{ready ? busy : "—"}</div>
        </div>
      </div>
      {ready && total > 0 && (
        <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-brand-100 dark:bg-brand-950"}`} aria-hidden>
          <div className={`h-full rounded-full ${dark ? "bg-white" : "bg-brand-600 dark:bg-brand-500"}`} style={{ width: `${Math.round((free / total) * 100)}%` }} />
        </div>
      )}
      <span className={`mt-3 inline-flex items-center gap-1 text-xs font-medium group-hover:underline sm:text-sm ${dark ? "text-white" : "text-brand-600 dark:text-brand-400"}`}>
        See who is free and busy <IconArrowRight className="h-4 w-4" />
      </span>
    </PendingLink>
  );
}
