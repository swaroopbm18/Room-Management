import GetForm from "@/components/GetForm";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import SubmitButton from "@/components/SubmitButton";
import { bySection, shortDay, slotRange } from "@/lib/affected";
import { getClassSemesters, getSlots, getUpcomingBookings } from "@/lib/data";
import { EVENT_KIND_LABEL, groupEvents, type EventKind, type UpcomingEvent } from "@/lib/events";
import { todayIST } from "@/lib/time";
import type { Slot } from "@/lib/types";
import AreaTabs from "../AreaTabs";
import { getAffected, workingDays } from "../affected/data";
import { addSectionsToEvent, cancelEvent, editEvent } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upcoming events", robots: { index: false } };

const TONE: Record<EventKind, string> = {
  event: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  event_request: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  skill_lab: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  cie: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  see: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

/**
 * Upcoming events: every event, skill lab, CIE and SEE still to come, each with its days, rooms,
 * sections and the classes it affects. An admin renames one or changes its description on all its
 * days, adds the sections attending, or cancels it on one day or all; the timetable, Classes
 * affected and the home page follow, since they all read the same bookings.
 */
export default async function UpcomingEvents({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const span = [14, 28].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const today = todayIST();
  const [rows, slots, semesters, dates] = await Promise.all([getUpcomingBookings(span), getSlots(), getClassSemesters(today), workingDays(today, 14)]);
  const events = groupEvents(rows ?? [], slots);
  // Classes each event took a room from, in the next 14 days (as Classes affected lists them)
  const affected = events.length && dates.length ? (await getAffected(dates)).rows : [];
  const count = new Map<string, number>();
  for (const a of affected) count.set(a.takenBy, (count.get(a.takenBy) ?? 0) + 1);
  const allSections = semesters.flatMap((x) => x.classes).filter((k) => /^\d[A-Z]$/.test(k)).sort(bySection);
  const back = `/admin/events?days=${span}`;

  return (
    <div className="space-y-6">
      <AreaTabs area="cie" current="/admin/events" />
      <PageHeader
        title="Upcoming events"
        subtitle="Every event, skill lab, CIE and SEE still to come. Rename one or change its description on all its days, add the sections attending (their own classes are released), or cancel it on one day or all: its rooms, and any classes released, cancelled or moved for it, go back to how they were. The timetable and Classes affected change with it."
      />
      <GetForm className="card flex flex-wrap items-end gap-3 p-4" message="Finding upcoming events…">
        <div>
          <label className="label" htmlFor="days">Show the next</label>
          <select id="days" name="days" defaultValue={String(span)} className="input">
            <option value="14">14 days</option>
            <option value="28">28 days</option>
          </select>
        </div>
        <button className="btn-secondary">Show</button>
        <PendingLink href="/admin/cie?kind=event" className="btn-primary ml-auto">
          Allot an event or skill lab
        </PendingLink>
      </GetForm>

      {rows === null && <div className="card p-6 text-sm text-red-700 dark:text-red-300">Could not read the upcoming bookings. Please refresh.</div>}
      {rows !== null && events.length === 0 ? (
        <div className="card p-6 text-sm">
          <p className="font-medium">No events, skill labs, CIEs or SEEs in the next {span} days.</p>
          <p className="muted mt-1">Allot one from Bulk allotment.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {events.map((e) => (
            <EventCard key={`${e.kind}|${e.title}`} e={e} slots={slots} affected={count.get(e.title) ?? 0} allSections={allSections} back={back} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ e, slots, affected, allSections, back }: { e: UpcomingEvent; slots: Slot[]; affected: number; allSections: string[]; back: string }) {
  const dates = e.days.map((d) => d.date);
  const forSections = e.kind === "event" || e.kind === "skill_lab" || e.kind === "event_request";
  const id = `${e.kind}-${e.title}`.replace(/[^\w-]/g, "_");
  const hidden = (
    <>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="title" value={e.title} />
      <input type="hidden" name="dates" value={dates.join(",")} />
    </>
  );
  return (
    <article className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg leading-snug font-semibold">{e.title}</div>
          {e.faculty && <div className="muted text-sm">{e.faculty}</div>}
          {e.reason && <div className="mt-0.5 text-sm">{e.reason}</div>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONE[e.kind]}`}>{EVENT_KIND_LABEL[e.kind]}</span>
      </div>

      <ul className="space-y-1 text-sm">
        {e.days.map((d) => (
          <li key={d.date} className="flex flex-wrap gap-x-2">
            <span className="w-28 shrink-0 font-medium">{shortDay(d.date)}</span>
            <span className="min-w-0 flex-1">
              {mergeTimes(d.runs, slots)
                .map((m) => `${m.time}: ${m.rooms.join(", ")}`)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {forSections &&
          (e.sections.length ? (
            <span>
              Sections: <span className="font-semibold">{e.sections.join(", ")}</span>
            </span>
          ) : (
            <span className="muted">No sections named</span>
          ))}
        <PendingLink
          href={`/admin/affected?${new URLSearchParams({ start: dates[0] < todayIST() ? todayIST() : dates[0], days: "14" }).toString()}`}
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${affected ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"}`}
        >
          {affected ? `${affected} ${affected === 1 ? "class" : "classes"} affected →` : "No class affected"}
        </PendingLink>
      </div>

      <div className="flex flex-wrap gap-2">
        <details className="w-full rounded-lg border border-brand-100 p-3 dark:border-brand-900">
          <summary className="cursor-pointer text-sm font-medium">Edit name and description</summary>
          <form action={editEvent} className="mt-3 grid gap-3 sm:grid-cols-2">
            {hidden}
            <input type="hidden" name="sections" value={e.sections.join(",")} />
            <div>
              <label className="label" htmlFor={`l-${id}`}>Name</label>
              <input id={`l-${id}`} name="label" required maxLength={60} defaultValue={e.sections.length ? e.label : e.title} className="input" />
              {e.sections.length > 0 && <p className="muted mt-1 text-xs">Its sections stay: &quot;… - {e.sections.join("/")}&quot;.</p>}
            </div>
            <div>
              <label className="label" htmlFor={`r-${id}`}>Description</label>
              <input id={`r-${id}`} name="reason" required minLength={5} defaultValue={e.reason ?? ""} className="input" />
            </div>
            <div className="flex justify-end sm:col-span-2">
              <SubmitButton className="btn-primary py-2 text-sm" pendingText="Saving…">
                Save on all {e.days.length} {e.days.length === 1 ? "day" : "days"}
              </SubmitButton>
            </div>
          </form>
        </details>

        {forSections && (
          <details className="w-full rounded-lg border border-brand-100 p-3 dark:border-brand-900">
            <summary className="cursor-pointer text-sm font-medium">Add sections attending</summary>
            <form action={addSectionsToEvent} className="mt-3 space-y-3">
              {hidden}
              <input type="hidden" name="known" value={e.sections.join(",")} />
              <p className="muted text-xs">Their own classes in its times are released, and their classes whose room it took are no longer affected.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {allSections.map((k) => (
                  <label key={k} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="section"
                      value={k}
                      defaultChecked={e.sections.includes(k)}
                      disabled={e.sections.includes(k)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    {k}
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <SubmitButton
                  className="btn-secondary py-1.5 text-sm"
                  pendingText="Adding…"
                  confirm={`Add the ticked sections to ${e.label} and release their classes in its times?`}
                  confirmLabel="Yes, add them"
                >
                  Add sections
                </SubmitButton>
              </div>
            </form>
          </details>
        )}

        <details className="w-full rounded-lg border border-red-200 p-3 dark:border-red-900">
          <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-300">Cancel</summary>
          <form action={cancelEvent} className="mt-3 flex flex-wrap items-end gap-3">
            {hidden}
            <div>
              <label className="label" htmlFor={`c-${id}`}>Cancel on</label>
              <select id={`c-${id}`} name="day" defaultValue="all" className="input">
                <option value="all">All {e.days.length} {e.days.length === 1 ? "day" : "days"}</option>
                {e.days.length > 1 && dates.map((d) => <option key={d} value={d}>{shortDay(d)}</option>)}
              </select>
            </div>
            <p className="muted min-w-0 flex-1 text-xs">Its rooms, and the classes released, cancelled or moved for it, go back to how they were before it.</p>
            <SubmitButton className="btn-danger py-2 text-sm" pendingText="Cancelling…" confirm={`Cancel ${e.title}? Its rooms and classes go back to how they were.`} confirmLabel="Yes, cancel it">
              Cancel event
            </SubmitButton>
          </form>
        </details>
      </div>
    </article>
  );
}

/** One day's rooms by time: "8:00 AM – 12:30 PM: MEL-LAB-01, MEL-LAB-02". */
function mergeTimes(runs: { room: string; slots: number[] }[], slots: Slot[]) {
  const out: { time: string; rooms: string[] }[] = [];
  for (const r of runs) {
    const time = slotRange(slots, r.slots);
    const m = out.find((x) => x.time === time);
    if (m) m.rooms.push(r.room);
    else out.push({ time, rooms: [r.room] });
  }
  return out;
}
