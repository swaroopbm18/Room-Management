import { IconCheck, IconFlag } from "./Icons";
import PendingLink from "./PendingLink";
import StatusBadge from "./StatusBadge";
import { STATUS_LABEL } from "@/lib/status";
import { formatDate, mondayOf, todayIST } from "@/lib/time";
import type { Slot, SlotStatus, UpcomingRow } from "@/lib/types";

const STATUS: Record<string, SlotStatus> = { class_request: "booked", event_request: "event", cie: "cie", event: "event" };
const SHOWN = 8;

/** Events, CIEs and approved bookings in the coming days, consecutive slots of the same booking merged. */
export default function UpcomingBookings({ rows, slots, days }: { rows: UpcomingRow[]; slots: Slot[]; days: number }) {
  const pos = new Map(slots.map((s, i) => [s.id, i]));
  type Group = UpcomingRow & { first: Slot; last: Slot };
  const groups: Group[] = [];
  for (const r of rows) {
    const slot = slots[pos.get(r.slot_id)!];
    const prev = groups.find(
      (g) =>
        g.date === r.date && g.room_id === r.room_id && g.kind === r.kind && g.title === r.title &&
        g.faculty_name === r.faculty_name && g.reason === r.reason && g.approved_by === r.approved_by && pos.get(g.last.id)! + 1 === pos.get(r.slot_id),
    );
    if (prev) prev.last = slot;
    else groups.push({ ...r, first: slot, last: slot });
  }
  groups.sort((a, b) => a.date.localeCompare(b.date) || pos.get(a.first.id)! - pos.get(b.first.id)! || a.room_id.localeCompare(b.room_id));
  const today = todayIST();

  // Each booking is a KPI-style card: events navy, CIEs ink, approved bookings light.
  const TONE: Record<string, string> = {
    event: "bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white shadow-lg shadow-brand-900/20",
    event_request: "bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white shadow-lg shadow-brand-900/20",
    cie: "bg-gradient-to-br from-ink via-brand-950 to-brand-900 text-white shadow-lg shadow-black/20 dark:border dark:border-brand-900",
    class_request: "border border-brand-100 bg-white shadow-sm dark:border-brand-900 dark:bg-brand-950/40",
  };
  const item = (g: Group) => {
    const dark = g.kind !== "class_request";
    const sub = dark ? "text-brand-200" : "text-brand-700 dark:text-brand-300";
    const requested = g.kind === "class_request" || g.kind === "event_request";
    return (
      <li key={`${g.date}|${g.room_id}|${g.first.id}`}>
        <PendingLink
          href={`/room/${encodeURIComponent(g.room_id)}?week=${mondayOf(g.date)}`}
          className={`flex h-full flex-col rounded-2xl p-3 transition sm:p-4 hover:-translate-y-0.5 hover:ring-2 hover:ring-brand-400 ${TONE[g.kind]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className={`text-xs font-medium sm:text-sm ${sub}`}>{g.date === today ? "Today" : formatDate(g.date, { year: undefined })}</span>
            {dark ? (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white ring-1 ring-white/25 ring-inset">{STATUS_LABEL[STATUS[g.kind]]}</span>
            ) : (
              <StatusBadge status={STATUS[g.kind]} />
            )}
          </div>
          <div className="mt-2 line-clamp-2 text-base leading-snug sm:text-lg font-semibold tracking-tight">{g.title || (g.kind === "cie" ? "CIE" : "Event")}</div>
          <div className={`mt-auto pt-3 text-xs sm:text-sm ${sub}`}>
            <span className="font-semibold">{g.room_id}</span> · {g.first.label.split(" – ")[0]} – {g.last.label.split(" – ")[1]}
          </div>
          {/* Requested by (for faculty requests), then who approved it, then what it is for, each on its own line. */}
          {requested && g.faculty_name && (
            <div className={`mt-0.5 line-clamp-2 text-xs ${dark ? "text-brand-200/80" : "muted"}`}>Requested by {g.faculty_name}</div>
          )}
          {g.approved_by && (
            <div
              className={`mt-2 inline-flex max-w-full items-start gap-1 self-start rounded-xl px-2 py-0.5 text-[11px] font-medium sm:text-xs ${
                dark ? "bg-white/15 text-white ring-1 ring-white/25 ring-inset" : "bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset dark:bg-brand-900/60 dark:text-brand-100 dark:ring-brand-800"
              }`}
            >
              <IconCheck className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>Approved by {g.approved_by}</span>
            </div>
          )}
          {g.reason && <div className={`mt-1.5 line-clamp-2 text-xs ${dark ? "text-brand-100/90" : "text-neutral-600 dark:text-neutral-300"}`}>{g.reason}</div>}
        </PendingLink>
      </li>
    );
  };
  const grid = "grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4 lg:grid-cols-4";

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-100 px-4 py-3 dark:border-brand-900">
        <h2 className="inline-flex items-center gap-2 font-semibold">
          <IconFlag className="h-4 w-4 text-brand-500" /> Upcoming events and booked slots
        </h2>
        <span className="muted text-xs">Next {days} days · {groups.length} {groups.length === 1 ? "booking" : "bookings"}</span>
      </div>
      {groups.length === 0 ? (
        <p className="muted px-4 py-6 text-sm">No events, CIEs or extra classes booked in the next {days} days.</p>
      ) : (
        <>
          <ul className={grid}>{groups.slice(0, SHOWN).map(item)}</ul>
          {groups.length > SHOWN && (
            <details className="group border-t border-brand-100 dark:border-brand-900">
              <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-brand-600 group-open:hidden dark:text-brand-400 [&::-webkit-details-marker]:hidden">
                Show {groups.length - SHOWN} more
              </summary>
              <ul className={grid}>{groups.slice(SHOWN).map(item)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
