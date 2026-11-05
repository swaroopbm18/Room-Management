import type { Room } from "./types";

export type Group = { name: string; students: number };
/** Roll numbers `from`..`to` of one class sit in a room. */
export type Seat = { group: string; from: number; to: number };
export type RoomPlan = { room: Room; seats: number; parts: Seat[]; used: number };

/** "3A 62", "3A, 62" or "3A: 62" per line; anything else is reported. */
export function parseGroups(text: string): { groups: Group[]; bad: string[] } {
  const groups: Group[] = [];
  const bad: string[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(.+?)[\s,:;=-]+(\d{1,4})$/);
    if (m && Number(m[2]) > 0) groups.push({ name: m[1].trim().toUpperCase(), students: Number(m[2]) });
    else bad.push(line);
  }
  return { groups, bad };
}

/**
 * Seats each class in the free rooms, biggest class first, filling the biggest rooms first
 * (classrooms and seminar halls before labs). `share` is the part of each room's seats used,
 * e.g. 0.5 for every other seat. A room left part-empty by one class takes the next one, so
 * no room is wasted. Rooms with no seat count are skipped.
 */
export function planSeating(groups: Group[], rooms: Room[], share: number): { plan: RoomPlan[]; unseated: Seat[]; spare: Room[] } {
  const usable = rooms
    .filter((r) => r.capacity && Math.floor(r.capacity * share) > 0)
    .sort((a, b) => Number(a.kind === "lab") - Number(b.kind === "lab") || (b.capacity ?? 0) - (a.capacity ?? 0) || a.sort_order - b.sort_order);
  const plan: RoomPlan[] = [];
  const unseated: Seat[] = [];
  let i = 0;
  for (const g of [...groups].sort((a, b) => b.students - a.students)) {
    let next = 1;
    while (next <= g.students) {
      let cur = plan[plan.length - 1];
      if (!cur || cur.used >= cur.seats) {
        const r = usable[i++];
        if (!r) break;
        cur = { room: r, seats: Math.floor(r.capacity! * share), parts: [], used: 0 };
        plan.push(cur);
      }
      const n = Math.min(cur.seats - cur.used, g.students - next + 1);
      cur.parts.push({ group: g.name, from: next, to: next + n - 1 });
      cur.used += n;
      next += n;
    }
    if (next <= g.students) unseated.push({ group: g.name, from: next, to: g.students });
  }
  return { plan, unseated, spare: usable.slice(i) };
}
