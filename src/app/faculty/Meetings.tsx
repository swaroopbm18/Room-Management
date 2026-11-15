import MeetingPicker from "@/components/MeetingPicker";
import { IconSearch } from "@/components/Icons";
import { CLUSTERS, type ClusterKey } from "@/lib/faculty";
import { bestMeetings, datedMeetings, upcomingStatus } from "@/lib/meetings";
import { getSlots } from "@/lib/data";
import { formatDate } from "@/lib/time";

export type MeetingSearch = { who?: string; len?: string; p?: string | string[] };

/**
 * Find a meeting time in the next six working days, for the whole department, one cluster or
 * the faculty ticked. Uses each day's real timetable: bookings, dropped classes, duties and leave.
 */
export default async function Meetings({ sp }: { sp: MeetingSearch }) {
  const [slots, { dates, byDate, people }] = await Promise.all([getSlots(), upcomingStatus(6)]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const who: ClusterKey | "all" = sp.who === "A" || sp.who === "B" ? sp.who : "all";
  const group = who === "all" ? people : people.filter((p) => p.cluster === who);
  const ticked = new Set([sp.p ?? []].flat().filter((ini) => group.some((f) => f.initials === ini)));
  const length = Math.min(3, Math.max(1, Number(sp.len) || 1));
  const attendees = ticked.size ? group.filter((f) => ticked.has(f.initials)) : group;
  const all = attendees.length ? datedMeetings(byDate, dates, attendees, slots, length) : [];
  const best = bestMeetings(all);
  const allFree = all.filter((m) => m.busy.length === 0);
  const runLabel = (ids: number[]) => `${slotById.get(ids[0])!.label.split(" – ")[0]} – ${slotById.get(ids[ids.length - 1])!.label.split(" – ")[1]}`;
  const day = (d: string) => formatDate(d, { year: undefined });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Find a meeting time</h2>
        <p className="muted text-sm">
          For the whole department, one cluster, or only the faculty you tick, over the next six working days ({dates.length ? `${day(dates[0])} to ${day(dates[dates.length - 1])}` : "none open"}). It
          goes by each day&apos;s real timetable, so bookings, dropped classes, duties and leave count.
        </p>
      </div>
      <form action="/faculty#meeting" className="card grid gap-4 p-5 sm:grid-cols-3" id="meeting">
        <input type="hidden" name="tab" value="meetings" />
        <MeetingPicker
          faculty={people}
          groups={[
            { value: "all", label: "Whole department" },
            { value: "A", label: CLUSTERS.A.label },
            { value: "B", label: CLUSTERS.B.label },
          ]}
          group={who}
          ticked={[...ticked]}
        >
          <div>
            <label className="label" htmlFor="meet-len">How long</label>
            <select id="meet-len" name="len" defaultValue={String(length)} className="input">
              <option value="1">1 slot (55 minutes)</option>
              <option value="2">2 slots in a row</option>
              <option value="3">3 slots in a row</option>
            </select>
          </div>
          <p className="muted self-end pb-2 text-sm">Shows the 3 best times, then every time all of them are free.</p>
        </MeetingPicker>
        <div className="flex justify-end sm:col-span-3">
          <button className="btn-primary">
            <IconSearch className="h-4 w-4" /> Find times
          </button>
        </div>
      </form>

      {attendees.length > 0 && (
        <>
          <p className="muted text-sm">
            Best times for {ticked.size ? attendees.map((f) => f.initials).join(", ") : `everyone in ${who === "all" ? "the department" : CLUSTERS[who].label}`} · {attendees.length} faculty
          </p>
          <ol className="grid gap-3 lg:grid-cols-3">
            {best.map((m, i) => (
              <li key={`${m.date}-${m.slotIds.join()}`} className={i === 0 ? "rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-4 text-white shadow-lg shadow-brand-900/20" : "card p-4"}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`text-xs font-medium ${i === 0 ? "text-brand-200" : "text-brand-700 dark:text-brand-300"}`}>{i === 0 ? "Option 1 · Best time" : `Option ${i + 1}`}</div>
                    <div className="text-lg font-semibold">{day(m.date)}</div>
                    <div className={`text-sm ${i === 0 ? "text-brand-100" : "muted"}`}>{runLabel(m.slotIds)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold tracking-tight">
                      {m.free.length}
                      <span className={`text-sm font-normal ${i === 0 ? "text-brand-200" : "muted"}`}> / {attendees.length}</span>
                    </div>
                    <div className={`text-xs ${i === 0 ? "text-brand-200" : "muted"}`}>can attend</div>
                  </div>
                </div>
                {m.busy.length > 0 ? (
                  <details className="mt-3 text-xs">
                    <summary className={`cursor-pointer font-medium ${i === 0 ? "text-white" : "text-brand-600 dark:text-brand-400"}`}>{m.busy.length} can&apos;t make it</summary>
                    <ul className="mt-2 space-y-0.5">
                      {m.busy.map((b) => (
                        <li key={b.person.initials}>
                          <span className="font-medium">{b.person.name}</span>
                          <span className={i === 0 ? "text-brand-200" : "muted"}> · {b.what}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <div className={`mt-3 text-xs font-medium ${i === 0 ? "text-white" : "text-brand-700 dark:text-brand-300"}`}>Everyone is free</div>
                )}
              </li>
            ))}
            {best.length === 0 && <li className="card muted p-6 text-sm lg:col-span-3">No meeting times left in the next six working days.</li>}
          </ol>

          <div className="card overflow-hidden">
            <div className="border-b border-brand-100 px-4 py-3 dark:border-brand-900/70">
              <h3 className="font-semibold">When all {attendees.length} are free</h3>
              <p className="muted text-xs">
                {allFree.length
                  ? `${allFree.length} ${allFree.length === 1 ? "time" : "times"}${length > 1 ? `, ${length} slots in a row` : ""}.`
                  : `No time has all ${attendees.length} free${length > 1 ? ` for ${length} slots in a row` : ""}. Try a shorter meeting or fewer people.`}
              </p>
            </div>
            <div className="grid gap-px bg-brand-100 sm:grid-cols-2 lg:grid-cols-3 dark:bg-brand-900/70">
              {dates.map((d) => {
                const times = allFree.filter((m) => m.date === d);
                return (
                  <div key={d} className="bg-white p-4 dark:bg-ink">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{day(d)}</span>
                      <span className={`text-xs ${times.length ? "font-medium text-brand-700 dark:text-brand-300" : "muted"}`}>{times.length ? `${times.length} ${times.length === 1 ? "time" : "times"}` : "None"}</span>
                    </div>
                    {times.length ? (
                      <ul className="space-y-1.5">
                        {times.map((m) => (
                          <li key={m.slotIds.join()} className="rounded-lg bg-gradient-to-br from-brand-700 to-brand-900 px-3 py-1.5 text-sm font-medium text-white">
                            {runLabel(m.slotIds)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted rounded-lg border border-dashed border-brand-200 px-3 py-1.5 text-sm dark:border-brand-900">No time with everyone free</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
