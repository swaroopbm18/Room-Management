import Link from "next/link";
import { IconAlert, IconCheck, IconPencil } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import { KINDS, type Problem } from "@/lib/health";
import { loadHealth } from "@/lib/healthData";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** The timetable from tomorrow, checked for clashes and loose ends. */
export default async function Health() {
  const { tomorrow, slots, cells, problems } = await loadHealth();
  const byKind = new Map<Problem["kind"], Problem[]>();
  for (const p of problems) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
  const must = problems.filter((p) => p.level === "problem").length;
  const end = new Map(slots.map((s) => [s.id, s.label.split(" – ")[1]]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable health check"
        subtitle={`The timetable as it runs from tomorrow, ${formatDate(tomorrow, { weekday: "long" })}, checked for clashes and loose ends. Click Fix to open that class in the class timetable editor.`}
      />

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="To fix" value={must} tone={must ? "navy" : "light"} icon={<IconAlert />} hint="A faculty member double-booked, unknown initials, a duty clash" />
        <KpiCard label="To check" value={problems.length - must} icon={<IconAlert />} hint="May be fine, e.g. lab batches" />
        <KpiCard label="Classes checked" value={cells.filter((c) => !c.is_department).length} tone="ink" icon={<IconCheck />} hint="Class slots in the week" />
      </section>

      {problems.length === 0 && (
        <p className="card flex items-center gap-2 p-6 text-sm">
          <IconCheck className="h-5 w-5 text-emerald-600" /> Everything looks right: no clashes or loose ends.
        </p>
      )}

      {(Object.keys(KINDS) as Problem["kind"][])
        .filter((k) => byKind.has(k))
        .map((k) => {
          const list = byKind.get(k)!;
          const level = list[0].level;
          return (
            <section key={k} className="space-y-2">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {KINDS[k]} <span className="muted text-sm font-normal">· {list.length}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    level === "problem" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  }`}
                >
                  {level === "problem" ? "Fix" : "Check"}
                </span>
              </h2>
              <ul className="card divide-y divide-brand-100 dark:divide-brand-900">
                {list.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {p.when}
                        {p.slotIds.length > 1 && ` to ${end.get(p.slotIds[p.slotIds.length - 1])}`}
                      </span>
                      <span className="muted"> · </span>
                      {p.text}
                    </span>
                    {p.cls && (
                      <Link href={`/admin/class-timetable?class=${encodeURIComponent(p.cls)}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                        <IconPencil className="h-3.5 w-3.5" /> Fix in {p.cls}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      {byKind.has("unknown") && (
        <p className="muted text-xs">
          Unknown initials are usually a typo in the timetable, or someone who isn&apos;t on the faculty list yet. Add them under <Link href="/admin/people" className="underline">Sign-in list &amp; names</Link>.
        </p>
      )}
    </div>
  );
}
