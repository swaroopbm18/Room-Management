import Link from "next/link";
import { IconClock, IconDownload, IconUser, IconUsers } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import { DAYS } from "@/lib/faculty";
import { clusterLabel, getWorkload } from "@/lib/workload";

export const dynamic = "force-dynamic";

const SORTS = { classes: "Most classes", busy: "Most busy", free: "Most free", name: "Name" } as const;
type Sort = keyof typeof SORTS;

/** Every faculty member's regular week in numbers, to balance the load. */
export default async function Workload({ searchParams }: { searchParams: Promise<{ sort?: string; c?: string }> }) {
  const sp = await searchParams;
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : "classes";
  const cluster = sp.c === "A" || sp.c === "B" ? sp.c : "";
  const all = await getWorkload();
  const list = all
    .filter((w) => !cluster || w.f.cluster === cluster)
    .sort((a, b) =>
      sort === "name"
        ? 0
        : sort === "free"
          ? b.free - a.free
          : sort === "busy"
            ? b.classes + b.duties - (a.classes + a.duties)
            : b.classes - a.classes || b.duties - a.duties,
    );
  const teaching = list.filter((w) => w.classes > 0);
  const avg = teaching.length ? teaching.reduce((n, w) => n + w.classes, 0) / teaching.length : 0;
  const top = teaching.reduce((m, w) => Math.max(m, w.classes), 0);
  const most = Math.max(1, ...list.map((w) => w.classes + w.duties));
  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams({ ...(sort !== "classes" ? { sort } : {}), ...(cluster ? { c: cluster } : {}), ...p });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    const s = q.toString();
    return `/admin/workload${s ? `?${s}` : ""}`;
  };
  const chip = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-brand-700 text-white dark:bg-brand-600" : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Workload" subtitle="Each faculty member's regular week from the room timetable and the duties you've added, Monday to Saturday (Saturday until 2 PM).">
        <a href="/admin/workload/export" download className="btn-primary">
          <IconDownload className="h-4 w-4" /> Download Excel
        </a>
      </PageHeader>

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Average classes a week" value={avg.toFixed(1)} hint={`Across ${teaching.length} teaching faculty`} tone="navy" icon={<IconClock />} />
        <KpiCard label="Most classes a week" value={top} hint={teaching.filter((w) => w.classes === top).map((w) => w.f.initials).join(", ")} icon={<IconUser />} />
        <KpiCard label="Faculty counted" value={list.length} hint={cluster ? `In Cluster ${cluster}` : "Whole department"} tone="ink" icon={<IconUsers />} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["", "A", "B"] as const).map((c) => (
            <Link key={c} href={href({ c })} scroll={false} className={chip(cluster === c)}>
              {c ? `Cluster ${c}` : "Whole department"}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="muted">Sort</span>
          {(Object.keys(SORTS) as Sort[]).map((k) => (
            <Link key={k} href={href({ sort: k === "classes" ? "" : k })} scroll={false} className={chip(sort === k)}>
              {SORTS[k]}
            </Link>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-brand-50 text-left text-xs text-brand-800 uppercase dark:bg-brand-950 dark:text-brand-200">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Faculty</th>
              <th className="px-3 py-2.5 font-semibold">Load</th>
              <th className="px-3 py-2.5 text-right font-semibold">Classes</th>
              <th className="px-3 py-2.5 text-right font-semibold">Duties</th>
              <th className="px-3 py-2.5 text-right font-semibold">Free</th>
              {DAYS.map((d) => (
                <th key={d} className="px-2 py-2.5 text-center font-semibold">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
            {list.map((w) => (
              <tr key={w.f.initials} className="hover:bg-brand-50/60 dark:hover:bg-brand-950/50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/faculty?f=${encodeURIComponent(w.f.initials)}#timetable`} className="font-medium hover:underline">
                    {w.f.name}
                  </Link>
                  <span className="muted ml-1.5 text-xs">
                    {w.f.initials}
                    {clusterLabel(w.f) && ` · ${clusterLabel(w.f)}`}
                  </span>
                  {w.subjects.length > 0 && <div className="muted truncate text-xs">{w.subjects.join(", ")}</div>}
                </td>
                <td className="w-40 px-3 py-2.5">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-950" title={`${w.classes} classes, ${w.duties} other duties`}>
                    <span className="bg-brand-600 dark:bg-brand-500" style={{ width: `${(w.classes / most) * 100}%` }} />
                    <span className="bg-amber-400 dark:bg-amber-500" style={{ width: `${(w.duties / most) * 100}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{w.classes}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{w.duties}</td>
                <td className="px-3 py-2.5 text-right text-brand-600 tabular-nums dark:text-brand-400">{w.free}</td>
                {w.perDay.map((n, i) => (
                  <td key={i} className={`px-2 py-2.5 text-center tabular-nums ${n >= 5 ? "font-semibold text-amber-700 dark:text-amber-300" : n ? "" : "muted"}`}>
                    {n || "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted text-xs">Load bar: blue is classes, amber is other duties. Days with 5 or more busy slots are highlighted.</p>
    </div>
  );
}
