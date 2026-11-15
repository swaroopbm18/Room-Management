import { getFacultyStatus, type FacultySlotStatus } from "./data";
import type { ClusterKey } from "./faculty";
import { addDays, isClosedSunday, slotStarted, todayIST } from "./time";
import type { Slot } from "./types";

export type Person = { initials: string; name: string; cluster?: ClusterKey };

/** One meeting time on a real date, with who can come and what keeps the rest busy. */
export type DatedMeeting = { date: string; slotIds: number[]; free: Person[]; busy: { person: Person; what: string }[] };

/**
 * Who is free and busy in each slot over the next `days` working days, from the same data as
 * free and busy faculty: classes, bookings, drops, duties and leave. Holidays come back empty.
 */
export async function upcomingStatus(days = 6): Promise<{ dates: string[]; byDate: Map<string, FacultySlotStatus[]>; people: Person[] }> {
  const dates: string[] = [];
  for (let i = 0; dates.length < days && i < 14; i++) {
    const d = addDays(todayIST(), i);
    if (!isClosedSunday(d)) dates.push(d);
  }
  const rows = await Promise.all(dates.map((d) => getFacultyStatus(d)));
  const byDate = new Map(dates.map((d, i) => [d, rows[i] ?? []]));
  const people = new Map<string, Person>();
  for (const r of rows.flat()) if (r && !people.has(r.initials)) people.set(r.initials, { initials: r.initials, name: r.name, cluster: r.cluster ?? undefined });
  const bare = (p: Person) => p.name.replace(/^(Dr|Prof)\.\s*/, "");
  const unnamed = (p: Person) => (p.name === p.initials ? 1 : 0);
  return { dates: dates.filter((d) => byDate.get(d)!.length > 0), byDate, people: [...people.values()].sort((a, b) => unnamed(a) - unnamed(b) || bare(a).localeCompare(bare(b))) };
}

/**
 * Every meeting time of `length` back-to-back slots on the given dates that hasn't started yet,
 * with who of `attendees` is free for all of it.
 */
export function datedMeetings(byDate: Map<string, FacultySlotStatus[]>, dates: string[], attendees: Person[], slots: Slot[], length: number): DatedMeeting[] {
  const sorted = [...slots].sort((a, b) => a.starts.localeCompare(b.starts));
  const out: DatedMeeting[] = [];
  for (const date of dates) {
    const rows = byDate.get(date) ?? [];
    const at = new Map(rows.map((r) => [`${r.initials}|${r.slot_id}`, r]));
    const open = new Set(rows.map((r) => r.slot_id));
    for (let i = 0; i + length <= sorted.length; i++) {
      const run = sorted.slice(i, i + length);
      if (!run.every((s, j) => open.has(s.id) && (j === 0 || run[j - 1].ends === s.starts))) continue;
      if (slotStarted(date, run[0])) continue;
      const free: Person[] = [];
      const busy: DatedMeeting["busy"] = [];
      for (const p of attendees) {
        const cells = run.map((s) => at.get(`${p.initials}|${s.id}`));
        if (cells.every((c) => c && !c.busy)) free.push(p);
        else busy.push({ person: p, what: [...new Set(cells.filter((c) => c?.busy).map((c) => c!.activity ?? "Busy"))].join(", ") || "Busy" });
      }
      out.push({ date, slotIds: run.map((s) => s.id), free, busy });
    }
  }
  return out;
}

/** The best few: most people free, spread over different days, earlier first among equals. */
export function bestMeetings(all: DatedMeeting[], limit = 3): DatedMeeting[] {
  const left = [...all].sort((a, b) => b.free.length - a.free.length);
  const picked: DatedMeeting[] = [];
  while (picked.length < limit && left.length) {
    const top = left[0].free.length;
    const i = left.findIndex((m) => m.free.length === top && !picked.some((p) => p.date === m.date));
    picked.push(left.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return picked;
}
