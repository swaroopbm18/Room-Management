import Link from "next/link";
import { IconCalendarCheck, IconClock, IconSearch, IconUsers } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import MeetingPicker from "@/components/MeetingPicker";
import PageHeader from "@/components/PageHeader";
import { getSlots } from "@/lib/data";
import { cellKey, CLUSTERS, DAY_NAMES, DAY_SLOTS, DAYS, getFacultyWeeks, isFree, suggestMeetings, type ClusterKey } from "@/lib/faculty";

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
  const cells = DAY_NAMES.flatMap((_, i) => daySlots.map((s) => ({ wd: i + 1, slot: s, free: freeAt(i + 1, s.id).length })));
  const best = [...cells].sort((a, b) => b.free - a.free)[0];
  const shade = (n: number) => heat(total ? n / total : 0);
  const avg = cells.length ? cells.reduce((n, c) => n + c.free, 0) / cells.length : 0;

  const pickDay = Number(sp.d);
  const pickSlot = slotById.get(Number(sp.s));
  const picked = pickDay >= 1 && pickDay <= 6 && pickSlot ? { wd: pickDay, slot: pickSlot } : null;
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set("c", cluster);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/admin/free-time?${p.toString()}`;
  };

  // Meeting finder: a cluster or the whole department, narrowed to the faculty ticked in it
  const who: ClusterKey | "all" = sp.who === "A" || sp.who === "B" || sp.who === "all" ? sp.who : sp.who === "some" ? "all" : cluster;
  const group = inCluster(who);
  const chosen = new Set([sp.p ?? []].flat().filter((ini) => group.some((f) => f.initials === ini)));
  const length = Math.min(3, Math.max(1, Number(sp.len) || 1));
  const attendees = chosen.size ? group.filter((f) => chosen.has(f.initials)) : group;
  const suggestions = attendees.length ? suggestMeetings(weeks, attendees, slots, DAY_SLOTS, length) : [];
  const runLabel = (ids: number[]) => `${slotById.get(ids[0])!.label.split(" – ")[0]} – ${slotById.get(ids[ids.length - 1])!.label.split(" – ")[1]}`;
  const what = (ini: string, wd: number, ids: number[]) =>
    [...new Set(ids.flatMap((id) => (weeks.get(ini)?.get(cellKey(wd, id)) ?? []).map((b) => b.activity)))].join(", ");

  return (
    <div className="space-y-8">
      <PageHeader title="Faculty free time" subtitle="Who is free in each slot of the week, from every faculty member's timetable, and the best times for a meeting.">
        <Link href="/admin/faculty" className="btn-secondary">
          <IconUsers className="h-4 w-4" /> Faculty timetables
        </Link>
      </PageHeader>

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
        <div className="card muted p-4 text-sm">Run supabase/migrations/0014_faculty_clusters.sql in the Supabase SQL Editor, then put faculty into Cluster A and Cluster B on the Faculty timetables page.</div>
      )}
      {clustersReady && cluster !== "all" && total === 0 && (
        <div className="card p-4 text-sm">
          Nobody is in {groupLabel} yet.{" "}
          <Link href="/admin/faculty" className="font-medium text-brand-600 underline dark:text-brand-400">
            Put faculty into clusters
          </Link>{" "}
          on the Faculty timetables page.
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

      <section id="meeting" className="scroll-mt-4 space-y-4">
        <h2 className="text-lg font-semibold">Suggest a meeting time</h2>
        <form action="/admin/free-time#meeting" className="card grid gap-4 p-5 sm:grid-cols-3">
          {cluster !== "all" && <input type="hidden" name="c" value={cluster} />}
          <MeetingPicker
            faculty={everyone.map(({ initials, name, cluster }) => ({ initials, name, cluster }))}
            groups={[
              { value: "all", label: "Whole department" },
              { value: "A", label: CLUSTERS.A.label },
              { value: "B", label: CLUSTERS.B.label },
            ]}
            group={who}
            ticked={[...chosen]}
          >
            <div>
              <label className="label" htmlFor="meet-len">How long</label>
              <select id="meet-len" name="len" defaultValue={String(length)} className="input">
                <option value="1">1 slot (55 minutes)</option>
                <option value="2">2 slots in a row</option>
                <option value="3">3 slots in a row</option>
              </select>
            </div>
            <p className="muted self-end pb-2 text-sm">The 3 best times, Monday to Saturday, 8:00 AM to 4:45 PM.</p>
          </MeetingPicker>
          <div className="flex justify-end sm:col-span-3">
            <button className="btn-primary">
              <IconSearch className="h-4 w-4" /> Find times
            </button>
          </div>
        </form>

        {attendees.length > 0 && (
          <p className="muted text-sm">
            Best times for {chosen.size ? attendees.map((f) => f.initials).join(", ") : `everyone in ${who === "all" ? "the department" : CLUSTERS[who].label}`} · {attendees.length} faculty
          </p>
        )}
        <ol className="grid gap-3 lg:grid-cols-3">
          {suggestions.map((m, i) => {
            const share = attendees.length ? m.free.length / attendees.length : 0;
            return (
              <li key={`${m.weekday}-${m.slotIds.join()}`} className={i === 0 ? "rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-4 text-white shadow-lg shadow-brand-900/20" : "card p-4"}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`text-xs font-medium ${i === 0 ? "text-brand-200" : "text-brand-700 dark:text-brand-300"}`}>{i === 0 ? "Option 1 · Best time" : `Option ${i + 1}`}</div>
                    <div className="text-lg font-semibold">
                      {DAY_NAMES[m.weekday - 1]}, {runLabel(m.slotIds)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold tracking-tight">
                      {m.free.length}
                      <span className={`text-sm font-normal ${i === 0 ? "text-brand-200" : "muted"}`}> / {attendees.length}</span>
                    </div>
                    <div className={`text-xs ${i === 0 ? "text-brand-200" : "muted"}`}>can attend</div>
                  </div>
                </div>
                <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${i === 0 ? "bg-white/20" : "bg-brand-100 dark:bg-brand-950"}`}>
                  <div className={`h-full rounded-full ${i === 0 ? "bg-white" : "bg-brand-600 dark:bg-brand-500"}`} style={{ width: `${Math.round(share * 100)}%` }} />
                </div>
                {m.busy.length > 0 ? (
                  <details className="mt-3 text-xs">
                    <summary className={`cursor-pointer font-medium ${i === 0 ? "text-white" : "text-brand-600 dark:text-brand-400"}`}>
                      {m.busy.length} can&apos;t make it
                    </summary>
                    <ul className="mt-2 space-y-0.5">
                      {m.busy.map((f) => (
                        <li key={f.initials}>
                          <span className="font-medium">{f.name}</span>
                          <span className={i === 0 ? "text-brand-200" : "muted"}> · {what(f.initials, m.weekday, m.slotIds)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <div className={`mt-3 text-xs font-medium ${i === 0 ? "text-white" : "text-brand-700 dark:text-brand-300"}`}>Everyone is free</div>
                )}
              </li>
            );
          })}
          {suggestions.length === 0 && <li className="card muted p-6 text-sm lg:col-span-3">Nobody to invite yet. Pick a group with faculty in it.</li>}
        </ol>
      </section>
    </div>
  );
}
