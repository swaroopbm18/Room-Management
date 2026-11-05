import Link from "next/link";
import { IconChart, IconClock, IconDoor } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import { kindLabel, roomSummary } from "@/lib/rooms";
import { getRooms } from "@/lib/data";
import { addDays, DATE_RE, formatDate, mondayOf, todayIST } from "@/lib/time";
import { getWeekUsage, pct } from "@/lib/usage";

export const dynamic = "force-dynamic";

const SORTS = { busy: "Busiest first", idle: "Most idle first", name: "Room" } as const;
type Sort = keyof typeof SORTS;

/** A cell shade for a share of rooms in use: the busier, the darker. */
function shade(p: number) {
  if (p >= 85) return "bg-brand-700 text-white dark:bg-brand-500 dark:text-black";
  if (p >= 65) return "bg-brand-500 text-white dark:bg-brand-600";
  if (p >= 45) return "bg-brand-300 text-brand-950 dark:bg-brand-800 dark:text-brand-50";
  if (p >= 25) return "bg-brand-200 text-brand-950 dark:bg-brand-900 dark:text-brand-100";
  if (p > 0) return "bg-brand-100 text-brand-900 dark:bg-brand-950 dark:text-brand-200";
  return "bg-white text-neutral-400 dark:bg-ink dark:text-neutral-600";
}

/** How busy each room is in a week, which rooms sit idle, and the peak hours. */
export default async function RoomUsage({ searchParams }: { searchParams: Promise<{ week?: string; sort?: string }> }) {
  const sp = await searchParams;
  const week = mondayOf(sp.week && DATE_RE.test(sp.week) ? sp.week : todayIST());
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : "busy";
  const [u, details] = await Promise.all([getWeekUsage(week), getRooms()]);
  const info = new Map(details.map((r) => [r.id, r]));
  const rooms = [...u.rooms].sort((a, b) =>
    sort === "name" ? (info.get(a.id)?.sort_order ?? 0) - (info.get(b.id)?.sort_order ?? 0) : sort === "idle" ? pct(a.used, a.open) - pct(b.used, b.open) : pct(b.used, b.open) - pct(a.used, a.open),
  );
  const ranked = [...u.rooms].filter((r) => r.open).sort((a, b) => pct(b.used, b.open) - pct(a.used, a.open));
  const busiest = ranked[0];
  const idlest = ranked[ranked.length - 1];
  const idle = ranked.filter((r) => pct(r.used, r.open) < 25);
  const peak = u.slots.map((s) => ({ s, v: u.bySlot.get(s.id) ?? [0, 0] })).sort((a, b) => pct(b.v[0], b.v[1]) - pct(a.v[0], a.v[1]))[0];
  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams({ week, ...(sort !== "busy" ? { sort } : {}), ...p });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/admin/usage?${q.toString()}`;
  };
  const chip = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-brand-700 text-white dark:bg-brand-600" : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"}`;
  const range = `${formatDate(u.monday, { day: "numeric", month: "short" })} to ${formatDate(addDays(u.monday, 5), { day: "numeric", month: "short", year: "numeric" })}`;
  const start = (label: string) => label.split(" – ")[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Room usage" subtitle="How full each room is in a week: classes, bookings and CIEs or events, out of the slots the room is open. Saturday after 2 PM and holidays don't count unless something was booked." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Link href={href({ week: addDays(u.monday, -7) })} scroll={false} className={chip(false)} aria-label="Previous week">
            ←
          </Link>
          <span className="px-2 text-sm font-semibold">{range}</span>
          <Link href={href({ week: addDays(u.monday, 7) })} scroll={false} className={chip(false)} aria-label="Next week">
            →
          </Link>
          {u.monday !== mondayOf(todayIST()) && (
            <Link href={href({ week: "" })} scroll={false} className="ml-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              This week
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="muted">Sort</span>
          {(Object.keys(SORTS) as Sort[]).map((k) => (
            <Link key={k} href={href({ sort: k === "busy" ? "" : k })} scroll={false} className={chip(sort === k)}>
              {SORTS[k]}
            </Link>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Rooms in use" value={`${pct(u.used, u.open)}%`} hint={`${u.used} of ${u.open} room slots this week`} tone="navy" icon={<IconChart />} />
        <KpiCard label="Busiest room" value={busiest ? busiest.name : "None"} hint={busiest ? `${pct(busiest.used, busiest.open)}% full` : undefined} icon={<IconDoor />} />
        <KpiCard
          label="Most idle room"
          value={idlest ? idlest.name : "None"}
          hint={idlest ? `${pct(idlest.used, idlest.open)}% full · ${idle.length} room${idle.length === 1 ? "" : "s"} under 25%` : undefined}
          icon={<IconDoor />}
        />
        <KpiCard label="Peak time" value={peak ? start(peak.s.label) : "None"} hint={peak ? `${pct(peak.v[0], peak.v[1])}% of rooms in use` : undefined} tone="ink" icon={<IconClock />} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Busy hours</h2>
        <div className="card overflow-x-auto p-3">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th className="w-24 text-left font-medium text-neutral-500">Day</th>
                {u.slots.map((s) => (
                  <th key={s.id} className="font-medium whitespace-nowrap text-neutral-500">
                    {start(s.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {u.days.map((d) => (
                <tr key={d.date}>
                  <th className="text-left font-medium whitespace-nowrap">
                    {formatDate(d.date, { weekday: "short", day: "numeric", month: "short" })}
                    {d.holiday && <span className="muted block text-[10px] font-normal">{d.holiday}</span>}
                  </th>
                  {u.slots.map((s) => {
                    const v = u.byCell.get(`${d.date}|${s.id}`);
                    if (!v) return <td key={s.id} className="rounded-md border border-dashed border-brand-200 py-2 dark:border-brand-900" title="Closed" />;
                    const p = pct(v[0], v[1]);
                    return (
                      <td key={s.id} className={`rounded-md py-2 font-semibold tabular-nums ${shade(p)}`} title={`${v[0]} of ${v[1]} rooms in use`}>
                        {p}%
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th className="pt-1 text-left font-semibold">Whole week</th>
                {u.slots.map((s) => {
                  const v = u.bySlot.get(s.id) ?? [0, 0];
                  const p = pct(v[0], v[1]);
                  return (
                    <td key={s.id} className="pt-1 align-bottom">
                      <div className="mx-auto flex h-12 w-6 items-end rounded bg-brand-50 dark:bg-brand-950">
                        <div className="w-full rounded bg-brand-600 dark:bg-brand-400" style={{ height: `${p}%` }} />
                      </div>
                      <div className="mt-1 font-semibold tabular-nums">{p}%</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted text-xs">Each cell is the share of rooms in use in that slot. Darker is busier; a dashed cell is closed.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Rooms <span className="muted text-sm font-normal">· {rooms.length}</span>
        </h2>
        <div className="card divide-y divide-brand-100 dark:divide-brand-900">
          {rooms.map((r) => {
            const p = pct(r.used, r.open);
            const d = info.get(r.id);
            const w = (n: number) => `${r.open ? (100 * n) / r.open : 0}%`;
            return (
              <div key={r.id} className="grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_14rem]">
                <div className="min-w-0">
                  <Link href={`/room/${encodeURIComponent(r.id)}?week=${u.monday}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <div className="muted truncate text-xs">{(d && roomSummary(d)) || kindLabel(d?.kind)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-brand-50 dark:bg-brand-950" role="img" aria-label={`${p}% in use`}>
                    <span className="bg-brand-700 dark:bg-brand-400" style={{ width: w(r.class) }} />
                    <span className="bg-emerald-500" style={{ width: w(r.booked) }} />
                    <span className="bg-amber-400" style={{ width: w(r.other) }} />
                  </div>
                  <span className={`w-12 text-right text-sm font-semibold tabular-nums ${p < 25 ? "text-amber-700 dark:text-amber-300" : ""}`}>{p}%</span>
                </div>
                <div className="muted text-xs sm:text-right">
                  {r.class} classes · {r.booked} booked · {r.other} CIE/event · {r.open - r.used} free
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {[
            ["bg-brand-700 dark:bg-brand-400", "Regular class"],
            ["bg-emerald-500", "Booked on request"],
            ["bg-amber-400", "CIE, event or department"],
          ].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-4 rounded-sm ${c}`} /> {l}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
