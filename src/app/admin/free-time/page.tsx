import Link from "next/link";
import { IconCalendarCheck, IconClock, IconUsers } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import AvailabilityTabs from "@/components/AvailabilityTabs";
import { getSlots } from "@/lib/data";
import { cellKey, CLUSTERS, DAY_NAMES, DAY_SLOTS, DAYS, getFacultyWeeks, isFree, isOpen, type ClusterKey } from "@/lib/faculty";

export const dynamic = "force-dynamic";

type Search = { c?: string; d?: string; s?: string; who?: string; len?: string; p?: string | string[] };

/** Share of faculty free from which a slot is highlighted in the spot colour. */
const HIGH = 0.6;

/** Spot-colour shades for a highlighted slot: the more faculty free, the stronger it stands out. Quieter slots stay grey. */
function heat(share: number) {
  if (share < HIGH) return "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400";
  const step = (share - HIGH) / (1 - HIGH);
  if (step >= 0.8) return "bg-spot-600 text-white dark:bg-spot-400 dark:text-spot-950";
  if (step >= 0.6) return "bg-spot-500 text-spot-950 dark:bg-spot-600 dark:text-white";
  if (step >= 0.4) return "bg-spot-300 text-spot-950 dark:bg-spot-800 dark:text-white";
  if (step >= 0.2) return "bg-spot-200 text-spot-900 dark:bg-spot-900 dark:text-spot-100";
  return "bg-spot-100 text-spot-800 dark:bg-spot-950 dark:text-spot-300";
}

export default async function FreeTime({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const cluster: ClusterKey | "all" = sp.c === "A" || sp.c === "B" ? sp.c : "all";
  const [slots, { faculty: everyone, weeks, clustersReady }] = await Promise.all([getSlots(), getFacultyWeeks()]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const daySlots = slots.filter((s) => DAY_SLOTS.includes(s.id));
  const inCluster = (c: ClusterKey | "all") => (c === "all" ? everyone : everyone.filter((f) => f.cluster === c));
  const faculty = inCluster(cluster);
  const groupLabel = cluster === "all" ? "the department" : CLUSTERS[cluster].label;
  const total = faculty.length;

  const freeAt = (wd: number, slotId: number) => faculty.filter((f) => isFree(weeks, f.initials, wd, slotId));
  const cells = DAY_NAMES.flatMap((_, i) => daySlots.filter((s) => isOpen(i + 1, s.id)).map((s) => ({ wd: i + 1, slot: s, free: freeAt(i + 1, s.id).length })));
  const best = [...cells].sort((a, b) => b.free - a.free)[0];
  const shade = (n: number) => heat(total ? n / total : 0);
  const avg = cells.length ? cells.reduce((n, c) => n + c.free, 0) / cells.length : 0;

  const pickDay = Number(sp.d);
  const pickSlot = slotById.get(Number(sp.s));
  const picked = pickDay >= 1 && pickDay <= 6 && pickSlot && isOpen(pickDay, pickSlot.id) ? { wd: pickDay, slot: pickSlot } : null;
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set("c", cluster);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/admin/free-time?${p.toString()}`;
  };

  const what = (ini: string, wd: number, ids: number[]) =>
    [...new Set(ids.flatMap((id) => (weeks.get(ini)?.get(cellKey(wd, id)) ?? []).map((b) => b.activity)))].join(", ");

  return (
    <div className="space-y-8">
      <PageHeader title="Faculty availability" subtitle="Who is free in each slot of the regular week, from every faculty member's timetable. To find a meeting time on real dates, use Find a meeting time.">
        <Link href="/admin/faculty" className="btn-secondary">
          <IconUsers className="h-4 w-4" /> Faculty profiles
        </Link>
      </PageHeader>
      <AvailabilityTabs view="week" cluster={cluster} signedIn admin />

      <div className="flex flex-wrap gap-2" role="tablist">
        {(["all", "A", "B"] as const).map((k) => (
          <Link
            key={k}
            href={k === "all" ? "/admin/free-time" : `/admin/free-time?c=${k}`}
            scroll={false}
            role="tab"
            aria-selected={k === cluster}
            className={`rounded-xl border px-4 py-2 text-sm ${
              k === cluster
                ? "border-brand-700 bg-brand-700 text-white dark:border-brand-500 dark:bg-brand-600"
                : "border-brand-200 bg-white text-brand-900 hover:bg-brand-50 dark:border-brand-900 dark:bg-ink dark:text-brand-100 dark:hover:bg-brand-950"
            }`}
          >
            <span className="font-semibold">{k === "all" ? "Whole department" : CLUSTERS[k].label}</span>
            <span className={`block text-xs ${k === cluster ? "text-brand-100" : "muted"}`}>{inCluster(k).length} faculty</span>
          </Link>
        ))}
      </div>

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard
          label={`Most free in ${cluster === "all" ? "the department" : CLUSTERS[cluster].label}`}
          value={best && total ? `${DAYS[best.wd - 1]} ${best.slot.label.split(" – ")[0].replace(/ (AM|PM)$/, "")}` : "—"}
          hint={best && total ? `${best.free} of ${total} faculty free` : undefined}
          tone="navy"
          icon={<IconCalendarCheck />}
        />
        <KpiCard label="Free in an average slot" value={Math.round(avg)} hint={`of ${total} faculty`} icon={<IconClock />} />
        <KpiCard label="Faculty counted" value={total} hint={`In ${groupLabel}, from classes and other duties`} tone="ink" icon={<IconUsers />} />
      </section>

      {!clustersReady && (
        <div className="card muted p-4 text-sm">Clusters couldn&apos;t be read just now, so everyone shows together.</div>
      )}
      {clustersReady && cluster !== "all" && total === 0 && (
        <div className="card p-4 text-sm">
          Nobody is in {groupLabel} yet.{" "}
          <Link href="/admin/faculty" className="font-medium text-brand-600 underline dark:text-brand-400">
            Put faculty into clusters
          </Link>{" "}
          on the Faculty profiles page.
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 px-4 py-3 text-xs dark:border-brand-900/70">
          <span className="font-semibold">
            {cluster === "all" ? "Whole department" : CLUSTERS[cluster].label} · faculty free in each slot
          </span>
          <span className="muted flex items-center gap-2">
            <span className="flex overflow-hidden rounded" aria-hidden>
              {["bg-spot-100 dark:bg-spot-950", "bg-spot-200 dark:bg-spot-900", "bg-spot-300 dark:bg-spot-800", "bg-spot-500 dark:bg-spot-600", "bg-spot-600 dark:bg-spot-400"].map((c) => (
                <span key={c} className={`h-3 w-3 ${c}`} />
              ))}
            </span>
            {Math.round(HIGH * 100)}% or more of faculty free, stronger means more. Click a slot to see who.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1.5 p-2 text-sm">
            <thead>
              <tr>
                <th className="w-28 rounded-lg bg-brand-950 px-3 py-2 text-left text-xs font-semibold tracking-wide text-brand-100 uppercase">Day</th>
                {daySlots.map((s) => (
                  <th key={s.id} className="rounded-lg bg-brand-900 px-2 py-2 text-left font-medium whitespace-nowrap text-white dark:bg-brand-950">
                    <div className="text-sm">{s.label.split(" – ")[0]}</div>
                    <div className="text-[11px] font-normal text-brand-300">to {s.label.split(" – ")[1]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_NAMES.map((d, i) => (
                <tr key={d}>
                  <th className="rounded-lg bg-brand-100 px-3 py-2 text-left font-semibold text-brand-950 dark:bg-brand-950 dark:text-brand-100">{d}</th>
                  {daySlots.map((s) => {
                    if (!isOpen(i + 1, s.id))
                      return (
                        <td key={s.id} title="Saturday classes end at 2 PM" className="muted rounded-lg border border-dashed border-brand-200 px-3 py-2 text-xs dark:border-brand-900">
                          No classes
                        </td>
                      );
                    const n = freeAt(i + 1, s.id).length;
                    const on = picked?.wd === i + 1 && picked.slot.id === s.id;
                    return (
                      <td key={s.id} className="p-0">
                        <Link
                          href={`${keep({ d: String(i + 1), s: String(s.id) })}#who`}
                          scroll={false}
                          className={`block rounded-lg px-3 py-2 transition hover:opacity-90 ${shade(n)} ${on ? "ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-black" : ""}`}
                        >
                          <span className="text-lg font-semibold">{n}</span>
                          <span className="text-xs opacity-80"> / {total} free</span>
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {picked && (
        <section id="who" className="card scroll-mt-4 p-5">
          <h2 className="font-semibold">
            {DAY_NAMES[picked.wd - 1]}, {picked.slot.label}
          </h2>
          {(() => {
            const free = freeAt(picked.wd, picked.slot.id);
            const busy = faculty.filter((f) => !free.includes(f));
            return (
              <div className="mt-3 grid gap-5 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-medium text-brand-700 dark:text-brand-300">Free · {free.length}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {free.map((f) => (
                      <span key={f.initials} className="rounded-md bg-brand-100 px-2 py-0.5 text-xs text-brand-900 dark:bg-brand-900/70 dark:text-brand-100">
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="muted mb-2 text-sm font-medium">Busy · {busy.length}</div>
                  <ul className="space-y-0.5 text-xs">
                    {busy.map((f) => (
                      <li key={f.initials}>
                        <span className="font-medium">{f.name}</span> <span className="muted">· {what(f.initials, picked.wd, [picked.slot.id])}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })()}
        </section>
      )}

    </div>
  );
}
