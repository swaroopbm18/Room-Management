import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import { IconBook, IconClock, IconDashboard, IconInbox, IconPlus, IconSwap } from "@/components/Icons";
import { displayName, requireStaff } from "@/lib/auth";
import { getHolidays, getSlots } from "@/lib/data";
import { getMyExchanges, stageOf, isOpenStage } from "@/lib/exchanges";
import { groupRequests } from "@/lib/requests";
import { createClient } from "@/lib/supabase/server";
import type { RequestRow } from "@/lib/types";
import { slotEnded } from "@/lib/time";
import ExchangeInbox from "./ExchangeInbox";
import Meetings, { type MeetingSearch } from "./Meetings";
import MyRequests from "./MyRequests";
import Overview from "./Overview";

export const dynamic = "force-dynamic";

const TABS = ["overview", "exchange", "requests", "meetings"] as const;
type Tab = (typeof TABS)[number];

export default async function FacultyDashboard({ searchParams }: { searchParams: Promise<MeetingSearch & { tab?: string }> }) {
  const person = await requireStaff();
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const supabase = await createClient();
  await getHolidays(); // also loads make-up Sundays

  const [slots, { data: reqData }, exchanges, { data: subjectData }] = await Promise.all([
    getSlots(),
    supabase.from("requests").select("*").eq("requester_email", person.email).order("created_at", { ascending: false }).limit(50),
    getMyExchanges(person.email),
    tab === "requests" ? supabase.from("faculty_subjects").select("subject").eq("email", person.email).order("subject") : Promise.resolve({ data: [] }),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  // One entry per request, however many slots it covers. A request is over once its first slot ends.
  const groups = groupRequests((reqData ?? []) as RequestRow[], slotById).map((g) => ({ ...g, ended: slotEnded(g.first.date, slotById.get(g.first.slot_id)!) }));
  const pendingRooms = groups.filter((g) => g.first.status === "pending" && !g.ended).length;
  const sent = exchanges?.sent ?? [];
  const received = exchanges?.received ?? [];
  const waitingOnMe = received.filter((x) => stageOf(x, slotById) === "pending").length;
  const openSent = sent.filter((x) => isOpenStage(stageOf(x, slotById))).length;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number; alert?: boolean }[] = [
    { key: "overview", label: "Overview", icon: <IconDashboard className="h-4 w-4" /> },
    { key: "exchange", label: "Exchange requests", icon: <IconSwap className="h-4 w-4" />, count: waitingOnMe, alert: true },
    { key: "requests", label: "My requests", icon: <IconInbox className="h-4 w-4" />, count: pendingRooms + openSent },
    { key: "meetings", label: "Meetings", icon: <IconClock className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${displayName(person)}`} subtitle={person.email}>
        <Link href="/faculty/manual" className="btn-secondary">
          <IconBook className="h-4 w-4" /> User manual
        </Link>
        <Link href="/free" className="btn-primary">
          <IconPlus className="h-4 w-4" /> Request a free room
        </Link>
      </PageHeader>

      <nav className="-mx-1 flex gap-1 overflow-x-auto rounded-xl bg-brand-100 p-1 text-sm [scrollbar-width:none] sm:mx-0 sm:inline-flex sm:flex-wrap dark:bg-brand-950" aria-label="Dashboard">
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <PendingLink
              key={t.key}
              href={t.key === "overview" ? "/faculty" : `/faculty?tab=${t.key}`}
              aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 font-medium whitespace-nowrap sm:py-1.5 ${
                on ? "bg-white text-brand-950 shadow-sm dark:bg-brand-700 dark:text-white" : "text-brand-700 hover:bg-white/60 dark:text-brand-300 dark:hover:bg-brand-900"
              }`}
            >
              {t.icon}
              {t.label}
              {!!t.count && (
                <span className={`rounded-full px-1.5 text-[11px] leading-[18px] font-semibold ${t.alert ? "bg-amber-400 text-black" : on ? "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100" : "bg-white text-brand-800 dark:bg-brand-900 dark:text-brand-100"}`}>
                  {t.count}
                </span>
              )}
            </PendingLink>
          );
        })}
      </nav>

      {tab === "overview" && <Overview person={person} pending={pendingRooms + openSent} waitingOnMe={waitingOnMe} sent={sent} />}
      {tab === "exchange" && <ExchangeInbox received={received} slots={slots} ready={exchanges !== null} />}
      {tab === "requests" && (
        <MyRequests groups={groups} mySubjects={((subjectData ?? []) as { subject: string }[]).map((x) => x.subject)} sent={sent} slots={slots} exchangesReady={exchanges !== null} />
      )}
      {tab === "meetings" && <Meetings sp={sp} />}
    </div>
  );
}
