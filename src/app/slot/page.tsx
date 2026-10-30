import Link from "next/link";
import { notFound } from "next/navigation";
import { IconClock, IconInbox, IconPlus } from "@/components/Icons";
import Flash from "@/components/Flash";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import RenameBooking from "@/components/RenameBooking";
import RequestStatus from "@/components/RequestStatus";
import StatusBadge from "@/components/StatusBadge";
import { getPerson } from "@/lib/auth";
import { getDaySchedule, getHolidays, getSlotRequests } from "@/lib/data";
import { bookableDates, DATE_RE, formatDate, formatDateTime, mondayOf } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Slot requests",
  robots: { index: false },
};

/** One room, one date, one slot: what's on, and every request for it. Open to everyone. */
export default async function SlotPage({ searchParams }: { searchParams: Promise<{ room?: string; date?: string; slot?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  if (!sp.room || !sp.date || !DATE_RE.test(sp.date) || !sp.slot) notFound();
  const date = sp.date;
  const [person, holidays, day, all] = await Promise.all([getPerson(), getHolidays(), getDaySchedule(date), getSlotRequests(sp.room, date, date)]);
  const row = day.find((r) => r.room_id === sp.room && String(r.slot_id) === sp.slot);
  if (!row) notFound();
  const holiday = holidays.get(date);
  const requests = (all ?? []).filter((r) => r.slot_id === row.slot_id);
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");
  const canRequest = row.status === "free" && !row.ended && !holiday && bookableDates().includes(date);
  const who = row.status === "department" ? `${row.subject} department` : row.faculty_name;

  const item = (r: (typeof requests)[number], place?: number) => (
    <li key={r.id} className="flex gap-4 px-4 py-4 sm:px-5">
      {place !== undefined && (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 dark:bg-brand-900/70 dark:text-brand-100">
          {place}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">{r.requester_name}</span>
          <RequestStatus status={r.status} expired={row.ended} />
          <span className="muted text-xs">
            {r.type === "event" ? "Event" : "Class"}
            {r.subject && <> · {r.subject}</>}
          </span>
        </div>
        <p className="mt-1 text-sm break-words">{r.description}</p>
        <div className="muted mt-1 text-xs">
          Requested {formatDateTime(r.created_at)}
          {r.decided_at && <> · {r.status === "approved" ? "Approved" : "Rejected"} {formatDateTime(r.decided_at)}</>}
        </div>
      </div>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Room ${row.room_name}`}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <IconClock className="h-4 w-4" />
            {formatDate(date, { weekday: "long" })} · {row.slot_label}
          </span>
        }
      >
        <PendingLink href={`/room/${encodeURIComponent(row.room_id)}?week=${mondayOf(date)}`} className="btn-secondary py-2">
          ‹ Week view
        </PendingLink>
      </PageHeader>

      <Flash msg={sp.msg} error={sp.error} />

      <section className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="muted text-xs uppercase">In this slot</div>
          {holiday ? (
            <div className="mt-1 font-medium">Holiday: {holiday}</div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={row.status} />
              {row.status !== "free" && <span className="font-medium">{row.subject}</span>}
              {who && row.status !== "department" && <span className="muted text-sm">{who}</span>}
            </div>
          )}
          {row.reason && <div className="muted mt-1 text-sm">{row.reason}</div>}
          {row.status === "closed" && <div className="muted mt-1 text-sm">Saturday classes end at 2 PM, so this slot can&apos;t be requested.</div>}
          {row.ended && <div className="muted mt-1 text-sm">This slot has ended.</div>}
          {person?.role === "admin" && !row.ended && !holiday && (row.status === "booked" || row.status === "cie" || row.status === "event") && (
            <div className="mt-2">
              <RenameBooking
                room={row.room_id}
                date={date}
                slot={row.slot_id}
                title={row.subject ?? ""}
                back={`/slot?room=${encodeURIComponent(row.room_id)}&date=${date}&slot=${row.slot_id}`}
              />
            </div>
          )}
        </div>
        {canRequest &&
          (person ? (
            <Link href={`/request?room=${encodeURIComponent(row.room_id)}&date=${date}&slot=${row.slot_id}`} className="btn-primary">
              <IconPlus className="h-4 w-4" /> Request this slot
            </Link>
          ) : (
            <Link href="/login" className="btn-secondary">
              Sign in to request
            </Link>
          ))}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-100 px-4 py-3 sm:px-5 dark:border-brand-900">
          <h2 className="inline-flex items-center gap-2 font-semibold">
            <IconInbox className="h-4 w-4 text-brand-500" /> Requests for this slot
          </h2>
          <span className="muted text-xs">
            {pending.length} pending · {decided.length} decided
          </span>
        </div>
        {all === null ? (
          <p className="muted px-5 py-6 text-sm">Requests can&apos;t be shown right now.</p>
        ) : requests.length === 0 ? (
          <p className="muted px-5 py-6 text-sm">Nobody has requested this slot.</p>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <div className="muted bg-brand-50/60 px-4 py-2 text-xs font-medium sm:px-5 dark:bg-brand-950/40">Pending, in the order the admin will look at them</div>
                <ul className="divide-y divide-brand-100 dark:divide-brand-900">{pending.map((r, i) => item(r, i + 1))}</ul>
              </>
            )}
            {decided.length > 0 && (
              <>
                <div className="muted border-t border-brand-100 bg-brand-50/60 px-4 py-2 text-xs font-medium sm:px-5 dark:border-brand-900 dark:bg-brand-950/40">Decided</div>
                <ul className="divide-y divide-brand-100 dark:divide-brand-900">{decided.map((r) => item(r))}</ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
