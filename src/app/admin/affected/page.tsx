import GetForm from "@/components/GetForm";
import { IconPrinter } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import SubmitButton from "@/components/SubmitButton";
import { bySection, rowKey, shortDay, slotRange, type Suggestion, type Taker } from "@/lib/affected";
import { addDays, DATE_RE, todayIST } from "@/lib/time";
import type { Room, Slot } from "@/lib/types";
import AreaTabs from "../AreaTabs";
import { addSectionsToEvent, bulkMoveAffected, moveAffected } from "./actions";
import { getAffected, workingDays, type AffectedRow } from "./data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affected classes", robots: { index: false } };

/**
 * Affected classes: every class over the coming days whose room was taken (a skill lab, an event,
 * a booking) and that has not been moved, with where it could go. Move it to a suggestion in one
 * press, or pick a room and time by hand; then print the changes for faculty and students.
 */
export default async function AffectedClasses({ searchParams }: { searchParams: Promise<{ start?: string; days?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const start = sp.start && DATE_RE.test(sp.start) && sp.start >= today ? sp.start : today;
  const span = [7, 14].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const dates = await workingDays(start, span);
  const { rows, rooms, slots, plan, takers, semesterSections } = dates.length
    ? await getAffected(dates)
    : { rows: [], rooms: [], slots: [], plan: [], takers: [], semesterSections: {} as Record<string, string[]> };
  const planned = new Map(plan.map((p) => [rowKey(p.a), p.to]));
  const placed = plan.filter((p) => p.to).length;
  const allSections = Object.values(semesterSections).flat().filter((k) => /^\d[A-Z]$/.test(k)).sort(bySection);
  const end = addDays(start, span - 1);
  const back = `/admin/affected?${new URLSearchParams({ start, days: String(span) }).toString()}`;
  const byDay = dates.map((d) => ({ date: d, rows: rows.filter((r) => r.date === d) })).filter((d) => d.rows.length);

  return (
    <div className="space-y-6">
      <AreaTabs area="cie" current="/admin/affected" />
      <PageHeader
        title="Affected classes"
        subtitle="Classes whose room was taken by a skill lab, an event or a booking, and that have not been moved yet. Each lists free rooms and times where it could go: the class's section is free, the room suits it (practicals in labs), and its faculty are free then and in the slot just before and after. Move it with one press, or pick a room and time yourself."
      />
      <GetForm className="card flex flex-wrap items-end gap-3 p-4" message="Finding affected classes…">
        <div>
          <label className="label" htmlFor="start">From</label>
          <input id="start" type="date" name="start" min={today} defaultValue={start} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="days">For</label>
          <select id="days" name="days" defaultValue={String(span)} className="input">
            <option value="7">7 days</option>
            <option value="14">14 days</option>
          </select>
        </div>
        <button className="btn-secondary">Show</button>
        <PendingLink href={`/admin/affected/print?${new URLSearchParams({ start, end }).toString()}`} className="btn-primary ml-auto">
          <IconPrinter className="h-4 w-4" /> Class changes to share (print / PDF)
        </PendingLink>
      </GetForm>

      {rows.length > 0 && (
        <form id="bulk" action={bulkMoveAffected} className="card flex flex-wrap items-center gap-3 p-4">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="start" value={start} />
          <input type="hidden" name="days" value={String(span)} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Move in bulk</p>
            <p className="muted">
              Each ticked class goes to the room and time under &quot;Bulk plan&quot; on its card, chosen so that no two classes get the same room
              and no section or faculty member is in two places. {placed} of {rows.length} {rows.length === 1 ? "class has" : "classes have"} a place. Untick
              any you want to move yourself.
            </p>
          </div>
          <SubmitButton
            className="btn-primary py-2"
            pendingText="Moving…"
            confirm="Move every ticked class to its place in the bulk plan?"
            confirmLabel="Yes, move them"
          >
            Move ticked classes
          </SubmitButton>
        </form>
      )}

      {byDay.length === 0 ? (
        <div className="card p-6 text-sm">
          <p className="font-medium">No affected classes from {shortDay(start)} to {shortDay(end)}.</p>
          <p className="muted mt-1">Every class whose room was taken has been moved, or no room was taken from a class.</p>
        </div>
      ) : (
        byDay.map((d) => (
          <section key={d.date} className="space-y-3">
            <h2 className="font-semibold">
              {shortDay(d.date)} <span className="muted text-sm font-normal">· {d.rows.length} {d.rows.length === 1 ? "class" : "classes"}</span>
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {d.rows.map((r) => (
                <AffectedCard
                  key={`${r.room}-${r.slots[0]}-${r.subject}`}
                  r={r}
                  rooms={rooms}
                  slots={slots}
                  dates={dates.filter((x) => x >= r.date)}
                  back={back}
                  bulk={planned.get(rowKey(r)) ?? null}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {takers.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">Sections at events and skill labs</h2>
            <p className="muted text-sm">
              Add the sections that attend an event or skill lab. Their classes whose room it took are no longer affected, and their own classes in
              its times are released, so those rooms are free for the classes above.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {takers.map((t) => (
              <TakerCard key={`${t.date}-${t.title}`} t={t} slots={slots} allSections={allSections} back={back} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TakerCard({ t, slots, allSections, back }: { t: Taker; slots: Slot[]; allSections: string[]; back: string }) {
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const ids = [...t.slots].sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
  return (
    <article className="card space-y-3 p-4">
      <div>
        <div className="font-semibold">{t.title}</div>
        <div className="muted text-sm">
          {shortDay(t.date)} · {slotRange(slots, [ids[0], ids[ids.length - 1]])} · {t.rooms.join(", ")}
        </div>
        <div className="mt-1 text-sm">{t.sections.length ? `Sections: ${t.sections.join(", ")}` : "No sections named yet"}</div>
      </div>
      <form action={addSectionsToEvent} className="space-y-3">
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="date" value={t.date} />
        <input type="hidden" name="title" value={t.title} />
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {allSections.map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="section"
                value={k}
                defaultChecked={t.sections.includes(k)}
                disabled={t.sections.includes(k)}
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
            confirm={`Add the ticked sections to ${t.label} on ${shortDay(t.date)} and release their classes in its times?`}
            confirmLabel="Yes, add them"
          >
            Add sections
          </SubmitButton>
        </div>
      </form>
    </article>
  );
}

function Hidden({ r, back }: { r: AffectedRow; back: string }) {
  return (
    <>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="from_date" value={r.date} />
      <input type="hidden" name="from_room" value={r.room} />
      <input type="hidden" name="from_slots" value={r.slots.join(",")} />
      <input type="hidden" name="subject" value={r.subject} />
      <input type="hidden" name="faculty" value={r.faculty.join(",")} />
      <input type="hidden" name="why" value={r.takenBy} />
    </>
  );
}

function suggestionLabel(sg: Suggestion, slots: Slot[]) {
  if (sg.sameTime) return "same time";
  return `${sg.sameDay ? "" : `${shortDay(sg.date)}, `}${slotRange(slots, sg.slots)}`;
}

function AffectedCard({
  r,
  rooms,
  slots,
  dates,
  back,
  bulk,
}: {
  r: AffectedRow;
  rooms: Room[];
  slots: Slot[];
  dates: string[];
  back: string;
  bulk: Suggestion | null;
}) {
  return (
    <article className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{r.subject}</div>
          <div className="muted text-sm">
            {r.room} · {slotRange(slots, r.slots)}
            {r.facultyName ? ` · ${r.facultyName}` : r.faculty.length ? ` · ${r.faculty.join(", ")}` : ""}
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Room taken: {r.takenBy}
        </span>
      </div>

      <div>
        <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">Suggestions</p>
        {r.suggestions.length ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {r.suggestions.map((sg) => (
              <form key={`${sg.date}-${sg.room}-${sg.slots[0]}`} action={moveAffected}>
                <Hidden r={r} back={back} />
                <input type="hidden" name="to_date" value={sg.date} />
                <input type="hidden" name="to_room" value={sg.room} />
                <input type="hidden" name="to_start" value={sg.slots[0]} />
                <SubmitButton
                  className="btn-secondary py-1.5 text-sm"
                  pendingText="Moving…"
                  confirm={`Move ${r.subject} to ${sg.room}, ${sg.sameTime ? "at the same time" : `${shortDay(sg.date)}, ${slotRange(slots, sg.slots)}`}?`}
                  confirmLabel="Yes, move it"
                >
                  <span className="font-semibold">{sg.room}</span> · {suggestionLabel(sg, slots)}
                </SubmitButton>
              </form>
            ))}
          </div>
        ) : (
          <p className="muted mt-1 text-sm">No free room at a time the class and its faculty are free in these days. Pick one below to move it anyway.</p>
        )}
      </div>

      <label className={`flex items-center gap-2 text-sm ${bulk ? "" : "muted"}`}>
        <input type="checkbox" form="bulk" name="pick" value={rowKey(r)} defaultChecked={!!bulk} disabled={!bulk} className="h-4 w-4 accent-brand-600" />
        {bulk ? (
          <span>
            Bulk plan: <span className="font-semibold">{bulk.room}</span> · {suggestionLabel(bulk, slots)}
          </span>
        ) : (
          <span>No free room left for it in the bulk plan</span>
        )}
      </label>

      <details className="rounded-lg border border-brand-100 p-3 dark:border-brand-900">
        <summary className="cursor-pointer text-sm font-medium">Pick a room and time</summary>
        <form action={moveAffected} className="mt-3 grid gap-3 sm:grid-cols-3">
          <Hidden r={r} back={back} />
          <div>
            <label className="label" htmlFor={`d-${r.room}-${r.slots[0]}`}>Day</label>
            <select id={`d-${r.room}-${r.slots[0]}`} name="to_date" defaultValue={r.date} className="input">
              {dates.map((d) => (
                <option key={d} value={d}>{shortDay(d)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`t-${r.room}-${r.slots[0]}`}>Start time</label>
            <select id={`t-${r.room}-${r.slots[0]}`} name="to_start" defaultValue={r.slots[0]} className="input">
              {slots.slice(0, slots.length - r.slots.length + 1).map((s, i) => (
                <option key={s.id} value={s.id}>{slotRange(slots, slots.slice(i, i + r.slots.length).map((x) => x.id))}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`r-${r.room}-${r.slots[0]}`}>Room</label>
            <select id={`r-${r.room}-${r.slots[0]}`} name="to_room" required defaultValue="" className="input">
              <option value="" disabled>Pick a room</option>
              {rooms.filter((x) => x.id !== r.room).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="force" className="h-4 w-4 accent-brand-600" />
            Move anyway if its section or faculty are busy then (never into a room that is in use)
          </label>
          <div className="flex justify-end">
            <SubmitButton className="btn-primary py-2 text-sm" pendingText="Moving…">Move class</SubmitButton>
          </div>
        </form>
      </details>
    </article>
  );
}
