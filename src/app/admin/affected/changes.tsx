import { classDay, LINE_STATE, type ClassLine } from "@/lib/classDay";
import { sectionsInText } from "@/lib/affected";
import { classesOf, type Cell } from "@/lib/classTimetable";
import { getHolidays, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, isClosedSunday } from "@/lib/time";
import type { ScheduleRow, Slot } from "@/lib/types";

/**
 * Every change to the classes between two dates, as shared with faculty and students: classes
 * moved to another room or time, extra classes, classes cancelled or released (for an event, a
 * skill lab or a CIE or SEE), classes whose room was taken and that are not moved yet, and
 * classes taken by another faculty member. Read from the same bookings as the timetable.
 */

export type ChangeDay = { date: string; lines: ClassLine[] };

/** A change worth sharing: anything but a class running as planned. A class moved to another time is listed once, at its new time. */
const isChange = (l: ClassLine) => l.state !== "on" && !(l.state === "taken" && /^Moved to /.test(l.note ?? ""));

export async function loadChanges(start: string, end: string, chosen: string): Promise<{ days: ChangeDay[]; slots: Slot[] }> {
  const supabase = await createClient();
  const [slots, holidays, { data, error }] = await Promise.all([getSlots(), getHolidays(), supabase.rpc("get_class_days", { p_from: start, p_to: end })]);
  if (error) throw new Error(error.message);
  const byDay = new Map(((data ?? []) as { day: string; timetable: Omit<Cell, "weekday">[]; schedule: ScheduleRow[] }[]).map((d) => [d.day, d]));
  const days: ChangeDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isClosedSunday(d) || holidays.has(d)) continue;
    const day = byDay.get(d);
    days.push({ date: d, lines: day ? classDay(chosen, day.timetable, day.schedule, slots).filter(isChange).map((l) => atTheEvent(l, day.schedule)) : [] });
  }
  return { days, slots };
}

/**
 * A class whose room went to an event that names its sections only in its description ("Skill lab
 * for 3B and 3D") is not waiting for a room: its students are at the event, as Classes affected has it.
 */
function atTheEvent(l: ClassLine, schedule: ScheduleRow[]): ClassLine {
  if (l.state !== "taken") return l;
  const r = schedule.find((x) => x.room_id === l.room && x.slot_id === l.slotIds[0]);
  if (!r || r.status !== "event" || classesOf(r.subject ?? "").length) return l;
  const named = sectionsInText(r.reason);
  const mine = classesOf(l.subject);
  return mine.length && mine.every((k) => named.includes(k)) ? { ...l, state: "cancelled", note: `At ${r.subject} (${r.room_id})` } : l;
}

const isMoved = (l: ClassLine) => l.state === "extra" && /^Moved from /.test(l.note ?? "");

/** Where a moved class was: its room, and its day and time there when it moved to another time. */
const movedFromText = (l: ClassLine) => {
  const [room, ...rest] = (l.note ?? "").replace(/^Moved from /, "").split(", ");
  return rest.length ? `${room} (${rest.join(", ")})` : room;
};

/** What happened to the class, in a word or two. */
function changeOf(l: ClassLine): { label: string; cls: string } {
  if (isMoved(l)) return { label: "Moved", cls: LINE_STATE.extra.cls };
  if (l.state === "extra") return { label: /skill\s*lab/i.test(l.subject) ? "Skill lab" : "Extra class", cls: LINE_STATE.extra.cls };
  if (l.state === "cancelled" && /^(?:Class dropped: )?(?:At |[\d A-Z,/]+ at )/.test(l.note ?? "")) return { label: "At an event", cls: LINE_STATE.cancelled.cls };
  if (l.state === "taken") return { label: "Room taken, not moved yet", cls: LINE_STATE.taken.cls };
  return LINE_STATE[l.state];
}

/** The usual room, from the timetable. */
function wasOf(l: ClassLine) {
  if (isMoved(l)) return movedFromText(l);
  if (l.state === "extra" || l.state === "exam") return "";
  return l.room;
}

/** Where the class is now, or why it is not held. */
function nowOf(l: ClassLine) {
  const note = (l.note ?? "").replace(/^Class dropped: /, "");
  if (l.state === "extra") return <span className="font-medium">{l.room}</span>;
  if (l.state === "taken") return `Taken by ${note}`;
  if (l.state === "changed") return note ? `${l.room} · ${note}` : l.room;
  if (l.state === "cancelled") return note || "Not held";
  return note;
}

export function ChangesTable({ days, slots, emptyText = "No class changes in this period." }: { days: ChangeDay[]; slots: Slot[]; emptyText?: string }) {
  const slotBy = new Map(slots.map((s) => [s.id, s]));
  const time = (ids: number[]) => `${slotBy.get(ids[0])?.label.split(" – ")[0]} – ${slotBy.get(ids[ids.length - 1])?.label.split(" – ")[1]}`;
  const total = days.reduce((n, d) => n + d.lines.length, 0);
  return (
    <div className="overflow-x-auto">
      <table className="report-table w-full border-collapse text-sm">
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Class</th>
            <th>Change</th>
            <th>Timetable room</th>
            <th>Now</th>
            <th>Faculty</th>
          </tr>
        </thead>
        <tbody>
          {total === 0 && (
            <tr>
              <td colSpan={7} className="text-center">{emptyText}</td>
            </tr>
          )}
          {days.map((d) =>
            d.lines.map((l, i) => {
              const c = changeOf(l);
              return (
                <tr key={`${d.date}-${i}`} className={i === 0 ? "border-t-2" : ""}>
                  <td className="whitespace-nowrap">{i === 0 ? formatDate(d.date, { weekday: "short", year: undefined }) : ""}</td>
                  <td className="whitespace-nowrap">{time(l.slotIds)}</td>
                  <td>{l.subject}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap print:bg-transparent print:p-0 print:text-black ${c.cls}`}>{c.label}</span>
                  </td>
                  <td>{wasOf(l)}</td>
                  <td>{nowOf(l)}</td>
                  <td>{l.who ?? ""}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

export const changeCount = (days: ChangeDay[]) => days.reduce((n, d) => n + d.lines.length, 0);
