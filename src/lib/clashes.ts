// Warnings for a room request that clashes with something else in the same slot: the faculty
// member already teaching (or on duty) elsewhere, or the class's section already in a class.
// These are warnings only; the room itself is free.

/** A class running somewhere that day, as far as clashes go. */
export type SectionRow = { slot_id: number; room_id: string; subject: string };

/** What a faculty member is doing in a slot, when busy. */
export type BusyAt = { activity: string | null; room_id: string | null };

export type Clash = { slot_id: number; kind: "faculty" | "section"; what: string; room: string | null };

/** "SML-5A" → "5A", "KDD-5" → "5"; null when the subject names no section. */
export function sectionOf(subject: string | null | undefined): string | null {
  const m = subject?.trim().match(/-\s*(\d{1,2}[A-Z]?)$/i);
  return m ? m[1].toUpperCase() : null;
}

/** The same section, or a whole-semester class ("5") and one of its sections ("5A"). */
export function sameStudents(a: string, b: string): boolean {
  const sem = (x: string) => x.replace(/[A-Z]$/, "");
  return a === b || (/^\d+$/.test(a) && sem(b) === a) || (/^\d+$/.test(b) && sem(a) === b);
}

/**
 * Clashes for a request for `room` in `slotIds`. `busy` maps a slot to what the requester is
 * doing then; `day` is every class that day; `subject` is the class's subject, if it is one.
 */
export function findClashes({
  room,
  slotIds,
  subject,
  busy,
  day,
}: {
  room: string;
  slotIds: number[];
  subject?: string | null;
  busy: Map<number, BusyAt>;
  day: SectionRow[];
}): Clash[] {
  const out: Clash[] = [];
  const section = sectionOf(subject);
  for (const id of slotIds) {
    const b = busy.get(id);
    if (b) out.push({ slot_id: id, kind: "faculty", what: b.activity ?? "Busy", room: b.room_id });
    if (!section) continue;
    for (const r of day) {
      const s = sectionOf(r.subject);
      // A class the requester teaches is already listed above
      if (r.slot_id === id && r.room_id !== room && r.room_id !== b?.room_id && s && sameStudents(s, section)) out.push({ slot_id: id, kind: "section", what: r.subject, room: r.room_id });
    }
  }
  return out;
}

/** The day's classes and class bookings that name a section. */
export const sectionRows = (rows: { slot_id: number; room_id: string; subject: string | null; status: string }[]): SectionRow[] =>
  rows.filter((r) => (r.status === "class" || r.status === "booked") && sectionOf(r.subject)).map((r) => ({ slot_id: r.slot_id, room_id: r.room_id, subject: r.subject! }));

/** "You have SML-5A in 105 at 10:20 AM" / "The class SML-5A is in 105 at 10:20 AM". */
export function clashText(c: Clash, who: string, slotLabel: string): string {
  const where = c.room ? ` in ${c.room}` : "";
  return c.kind === "faculty" ? `${who} ${who === "You" ? "have" : "has"} ${c.what}${where} at ${slotLabel}` : `The class ${c.what} is${where} at ${slotLabel}`;
}
