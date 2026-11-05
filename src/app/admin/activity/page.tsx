import Link from "next/link";
import { IconActivity } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { AREAS, tablesOf, toActions, type Area, type LogRow } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Log rows read per page; one action can be many rows, e.g. a CIE week. */
const PAGE = 500;

const BADGE: Record<Area, string> = {
  requests: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  bookings: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  timetable: "bg-brand-100 text-brand-900 dark:bg-brand-900/70 dark:text-brand-100",
  faculty: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  rooms: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  calendar: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

/** Who changed what and when, newest first. */
export default async function Activity({ searchParams }: { searchParams: Promise<{ area?: string; who?: string; before?: string }> }) {
  const sp = await searchParams;
  const area = sp.area && sp.area in AREAS ? (sp.area as Area) : null;
  const who = (sp.who ?? "").trim().toLowerCase();
  const before = Number(sp.before) || 0;
  const supabase = await createClient();
  let q = supabase.from("activity_log").select("*").order("id", { ascending: false }).limit(PAGE);
  if (area) q = q.in("tbl", tablesOf(area));
  if (who) q = q.ilike("actor", `%${who}%`);
  if (before) q = q.lt("id", before);
  const { data, error } = await q;
  const rows = (data ?? []) as LogRow[];
  const actions = toActions(rows);
  const oldest = rows.length === PAGE ? rows[rows.length - 1].id : 0;
  const href = (p: Record<string, string>) => {
    const qs = new URLSearchParams({ ...(area ? { area } : {}), ...(who ? { who } : {}), ...p });
    for (const [k, v] of [...qs.entries()]) if (!v) qs.delete(k);
    const s = qs.toString();
    return `/admin/activity${s ? `?${s}` : ""}`;
  };
  const chip = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-brand-700 text-white dark:bg-brand-600" : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"}`;
  // Group by day for easy reading
  const byDay = new Map<string, typeof actions>();
  for (const a of actions) {
    const d = new Date(a.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Activity log" subtitle="Every change to requests, bookings, the timetable, faculty, rooms and the calendar, with who made it and when. Changes made in one go show as one entry." />
      {error && <div className="card muted p-4 text-sm">Run supabase/migrations/0023_leave_and_activity_log.sql in the Supabase SQL Editor to start the activity log.</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Link href={href({ area: "", before: "" })} scroll={false} className={chip(!area)}>
            Everything
          </Link>
          {(Object.keys(AREAS) as Area[]).map((k) => (
            <Link key={k} href={href({ area: k, before: "" })} scroll={false} className={chip(area === k)}>
              {AREAS[k]}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {area && <input type="hidden" name="area" value={area} />}
          <input name="who" defaultValue={sp.who} placeholder="Filter by email" className="input w-56 py-1.5" />
          <button className="btn-secondary py-1.5">Filter</button>
        </form>
      </div>

      {!error && actions.length === 0 && <p className="card muted p-6 text-sm">Nothing recorded yet. Changes show here from the moment migration 0023 was run.</p>}

      {[...byDay.entries()].map(([d, list]) => (
        <section key={d} className="space-y-2">
          <h2 className="text-sm font-semibold">{d}</h2>
          <ol className="card divide-y divide-brand-100 dark:divide-brand-900">
            {list.map((a) => (
              <li key={a.id} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_14rem]">
                <span className="muted text-xs tabular-nums sm:pt-0.5">{formatDateTime(a.at).split(", ").pop()}</span>
                <div className="min-w-0 space-y-0.5 text-sm">
                  {a.lines.map((l, i) => (
                    <p key={i} className={i ? "muted" : ""}>
                      {l}
                    </p>
                  ))}
                </div>
                <div className="flex flex-wrap items-start gap-1.5 text-xs sm:justify-end">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${BADGE[a.area]}`}>{AREAS[a.area]}</span>
                  {a.actor ? (
                    <Link href={href({ who: a.actor, before: "" })} className="truncate text-brand-700 hover:underline dark:text-brand-300" title={a.actor}>
                      {a.actor}
                    </Link>
                  ) : (
                    <span className="muted">SQL Editor</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {oldest > 0 && (
        <div className="flex justify-center">
          <Link href={href({ before: String(oldest) })} className="btn-secondary">
            <IconActivity className="h-4 w-4" /> Older activity
          </Link>
        </div>
      )}
    </div>
  );
}
