import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { IconAlert, IconArrowRight, IconCalendar, IconCalendarCheck, IconCheck, IconFlag, IconInbox, IconLeave, IconMegaphone, IconSwap } from "@/components/Icons";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import Substitutes from "@/components/Substitutes";
import type { Cell } from "@/lib/classTimetable";
import { getDayOrders, getHolidays, getNotices } from "@/lib/data";
import { loadHealth } from "@/lib/healthData";
import { groupRequests } from "@/lib/requests";
import { findSubstitutes } from "@/lib/substitutes";
import { createClient } from "@/lib/supabase/server";
import type { RequestRow, ScheduleRow } from "@/lib/types";
import { formatDate, formatDateTime, isSunday, slotEnded, todayIST, WEEKDAY_NAMES } from "@/lib/time";

export const dynamic = "force-dynamic";

type Leave = { id: number; initials: string; starts_on: string; ends_on: string; reason: string };

function Panel({ title, icon, href, linkText, children }: { title: string; icon: React.ReactNode; href: string; linkText: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-brand-100 px-4 py-3 dark:border-brand-900">
        <h2 className="inline-flex items-center gap-2 font-semibold [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brand-500">
          {icon} {title}
        </h2>
        <PendingLink href={href} className="inline-flex items-center gap-1 py-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          {linkText} <IconArrowRight className="h-3.5 w-3.5" />
        </PendingLink>
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

/** The admin's morning glance: what needs a decision, who is away, and what's coming up. */
export default async function AdminHome() {
  const today = todayIST();
  const supabase = await createClient();
  const [pendingRes, leaveRes, dirRes, peopleRes, scheduleRes, timetableRes, holidays, orders, notices, health] = await Promise.all([
    supabase.from("requests").select("*").eq("status", "pending").gte("date", today).order("created_at"),
    supabase.from("faculty_leave").select("id, initials, starts_on, ends_on, reason").lte("starts_on", today).gte("ends_on", today),
    supabase.from("faculty_directory").select("initials, title, full_name"),
    supabase.from("people").select("initials, title, full_name").not("initials", "is", null),
    supabase.rpc("get_day_schedule", { p_date: today }),
    supabase.rpc("get_timetable", { p_date: today }),
    getHolidays(),
    getDayOrders(),
    getNotices(today),
    loadHealth(),
  ]);
  const { slots, problems } = health;
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const label = (id: number) => slotById.get(id)?.label ?? "";

  // Requests waiting, oldest first
  const pending = groupRequests((pendingRes.data ?? []) as RequestRow[], slotById).filter((g) => !slotEnded(g.first.date, slotById.get(g.first.slot_id)!));

  // Today's leave, with each class still to run and who is free to take it
  const names = new Map<string, string>();
  for (const p of [...(dirRes.data ?? []), ...(peopleRes.data ?? [])] as { initials: string; title: string | null; full_name: string }[]) {
    names.set(p.initials, p.full_name.trim() ? `${p.title ? p.title + " " : ""}${p.full_name}` : (names.get(p.initials) ?? p.initials));
  }
  const workingToday = !isSunday(today) && !holidays.has(today);
  const leave = workingToday ? ((leaveRes.data ?? []) as Leave[]) : [];
  const held = new Set(((scheduleRes.data ?? []) as ScheduleRow[]).filter((r) => r.status === "class").map((r) => `${r.room_id}|${r.slot_id}`));
  const cells = (timetableRes.data ?? []) as Cell[];
  const away = leave.map((l) => ({
    l,
    classes: cells
      .filter((c) => !c.is_department && c.faculty_initials.includes(l.initials) && held.has(`${c.room_id}|${c.slot_id}`) && !slotEnded(today, slotById.get(c.slot_id)!))
      .sort((a, b) => a.slot_id - b.slot_id)
      .map((c) => ({ room_id: c.room_id, date: today, slot_id: c.slot_id, subject: c.subject })),
  }));
  const toCover = away.flatMap((a) => a.classes);
  const subs = toCover.length ? await findSubstitutes(toCover) : new Map();

  const mustFix = problems.filter((p) => p.level === "problem");
  const nextHolidays = [...holidays.entries()].filter(([d]) => d > today).sort(([a], [b]) => a.localeCompare(b)).slice(0, 3);
  const nextSwaps = [...orders.values()].filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const liveNotices = notices.filter((n) => n.starts_on <= today);

  return (
    <div className="space-y-6">
      <PageHeader title="Admin home" subtitle={`${formatDate(today, { weekday: "long" })}: what needs you today, at a glance.`} />

      <section className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Requests waiting" value={pending.length} tone={pending.length ? "navy" : "light"} icon={<IconInbox />} href="/admin" linkText="Decide" />
        <KpiCard label="On leave today" value={leave.length} icon={<IconLeave />} href="/admin/leave" linkText="Leave" />
        <KpiCard label="Classes to cover" value={toCover.length} icon={<IconCalendarCheck />} hint="Today, still to run" />
        <KpiCard label="Timetable problems" value={mustFix.length} tone="ink" icon={<IconAlert />} href="/admin/health" linkText="Health check" />
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          { href: "/admin/allot", label: "Allot a room", icon: <IconFlag className="h-4 w-4" /> },
          { href: "/admin/leave", label: "Add leave", icon: <IconLeave className="h-4 w-4" /> },
          { href: "/admin/holidays#notices", label: "Add a notice", icon: <IconMegaphone className="h-4 w-4" /> },
          { href: "/admin/cie", label: "Book a CIE week", icon: <IconCalendarCheck className="h-4 w-4" /> },
        ].map((a) => (
          <PendingLink key={a.href} href={a.href} className="btn-secondary py-2.5 sm:py-2">
            {a.icon} {a.label}
          </PendingLink>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Waiting for a decision" icon={<IconInbox />} href="/admin" linkText="All requests">
          {pending.length === 0 ? (
            <EmptyState icon={<IconCheck />} title="All caught up">No requests are waiting.</EmptyState>
          ) : (
            <ul className="divide-y divide-brand-100 text-sm dark:divide-brand-900">
              {pending.slice(0, 5).map((g) => (
                <li key={g.group_id} className="py-2 first:pt-0 last:pb-0">
                  <Link href="/admin" className="block hover:underline">
                    <span className="font-medium">{g.first.requester_name}</span> · {g.first.room_id} · {formatDate(g.first.date, { year: undefined })} {g.range}
                  </Link>
                  <span className="muted text-xs">
                    {g.first.type === "event" ? "Event" : (g.first.subject ?? "Class")} · sent {formatDateTime(g.first.created_at)}
                  </span>
                </li>
              ))}
              {pending.length > 5 && <li className="muted pt-2 text-xs">and {pending.length - 5} more</li>}
            </ul>
          )}
        </Panel>

        <Panel title="On leave today" icon={<IconLeave />} href="/admin/leave" linkText="Leave & substitutes">
          {!workingToday ? (
            <p className="muted text-sm">No classes today.</p>
          ) : away.length === 0 ? (
            <EmptyState icon={<IconCheck />} title="Everyone is in today" />
          ) : (
            <ul className="space-y-3 text-sm">
              {away.map(({ l, classes }) => (
                <li key={l.id}>
                  <div className="font-medium">
                    {names.get(l.initials) ?? l.initials} <span className="muted font-normal">· {l.initials}{l.reason && ` · ${l.reason}`}</span>
                  </div>
                  {classes.length === 0 ? (
                    <p className="muted text-xs">No classes left today.</p>
                  ) : (
                    classes.map((c) => (
                      <div key={`${c.room_id}|${c.slot_id}`} className="mt-1.5 rounded-lg bg-brand-50/70 px-3 py-2 dark:bg-brand-950/40">
                        <span className="font-medium">{label(c.slot_id)}</span> · {c.subject} · {c.room_id}
                        <Substitutes people={subs.get(`${c.room_id}|${c.date}|${c.slot_id}`)?.people ?? []} />
                      </div>
                    ))
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Timetable health" icon={<IconAlert />} href="/admin/health" linkText="Health check">
          {problems.length === 0 ? (
            <EmptyState icon={<IconCheck />} title="No clashes or loose ends" />
          ) : (
            <ul className="space-y-2 text-sm">
              {[...mustFix, ...problems.filter((p) => p.level !== "problem")].slice(0, 4).map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    className={`mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      p.level === "problem" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                    }`}
                  >
                    {p.level === "problem" ? "Fix" : "Check"}
                  </span>
                  <span>
                    <span className="font-medium">{p.when}</span> · {p.text}
                  </span>
                </li>
              ))}
              {problems.length > 4 && <li className="muted text-xs">and {problems.length - 4} more</li>}
            </ul>
          )}
        </Panel>

        <Panel title="Coming up" icon={<IconCalendar />} href="/admin/holidays" linkText="Calendar & notices">
          {nextHolidays.length + nextSwaps.length + liveNotices.length === 0 ? (
            <EmptyState icon={<IconCalendar />} title="Nothing special coming up">No holidays, day swaps or notices are set.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {liveNotices.map((n) => (
                <li key={`n${n.id}`} className="flex gap-2">
                  <IconMegaphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    {n.message} <span className="muted text-xs">· until {formatDate(n.ends_on, { year: undefined })}</span>
                  </span>
                </li>
              ))}
              {nextSwaps.map((o) => (
                <li key={`s${o.date}`} className="flex gap-2">
                  <IconSwap className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span>
                    {formatDate(o.date, { weekday: "long", year: undefined })} follows {WEEKDAY_NAMES[o.follows - 1]}
                  </span>
                </li>
              ))}
              {nextHolidays.map(([d, name]) => (
                <li key={`h${d}`} className="flex gap-2">
                  <IconCalendar className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span>
                    {formatDate(d, { weekday: "long", year: undefined })} · {name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
