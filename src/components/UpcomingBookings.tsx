import { IconFlag } from "./Icons";
import PendingLink from "./PendingLink";
import StatusBadge from "./StatusBadge";
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
        g.faculty_name === r.faculty_name && g.reason === r.reason && pos.get(g.last.id)! + 1 === pos.get(r.slot_id),
    );
    if (prev) prev.last = slot;
    else groups.push({ ...r, first: slot, last: slot });
  }
  groups.sort((a, b) => a.date.localeCompare(b.date) || pos.get(a.first.id)! - pos.get(b.first.id)! || a.room_id.localeCompare(b.room_id));
  const today = todayIST();

  const item = (g: Group) => (
    <li key={`${g.date}|${g.room_id}|${g.first.id}`}>
      <PendingLink
        href={`/room/${encodeURIComponent(g.room_id)}?week=${mondayOf(g.date)}`}
        className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-1 px-4 py-3 hover:bg-brand-50 sm:grid-cols-[8rem_10rem_7rem_1fr] dark:hover:bg-brand-950"
      >
        <span className="text-sm font-medium">
          {g.date === today ? "Today" : formatDate(g.date, { year: undefined })}
        </span>
        <span className="text-sm whitespace-nowrap">
          {g.first.label.split(" – ")[0]} – {g.last.label.split(" – ")[1]}
        </span>
        <span className="text-sm font-semibold">{g.room_id}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={STATUS[g.kind]} />
            <span className="font-medium">{g.title || (g.kind === "cie" ? "CIE" : "Event")}</span>
          </span>
          {(g.faculty_name || g.reason) && (
            <span className="muted mt-0.5 block truncate text-xs">{[g.faculty_name, g.reason].filter(Boolean).join(" · ")}</span>
          )}
        </span>
      </PendingLink>
    </li>
  );

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
          <ul className="divide-y divide-brand-100 dark:divide-brand-900">{groups.slice(0, SHOWN).map(item)}</ul>
          {groups.length > SHOWN && (
            <details className="group border-t border-brand-100 dark:border-brand-900">
              <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-brand-600 group-open:hidden dark:text-brand-400 [&::-webkit-details-marker]:hidden">
                Show {groups.length - SHOWN} more
              </summary>
              <ul className="divide-y divide-brand-100 dark:divide-brand-900">{groups.slice(SHOWN).map(item)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
