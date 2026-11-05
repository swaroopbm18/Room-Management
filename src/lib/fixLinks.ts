/**
 * Where to go to fix the problem an error message describes, so the message can link there.
 * Matched on the wording of the database's errors; anything else gets no link.
 */
export function fixFor(message: string): { href: string; label: string } | undefined {
  const q = (s: string) => encodeURIComponent(s);
  const rules: [RegExp, (m: RegExpMatchArray) => { href: string; label: string }][] = [
    [/^(\S+) still has \d+ class slot/, (m) => ({ href: `/admin/class-timetable?find=${q(m[1])}#finder`, label: `Show ${m[1]}'s classes` })],
    [/^Room (\S+) (still )?has classes in the timetable/, () => ({ href: "/admin/timetable#grid", label: "Open the room timetable" })],
    [/^Room (\S+) has requests or bookings coming up/, () => ({ href: "/admin/allot", label: "Open Allot / free rooms" })],
    [/^Room (\S+) has requests or bookings on record/, (m) => ({ href: `/admin/history?room=${q(m[1])}`, label: `Show ${m[1]}'s history` })],
    [/^(\S+) is already on leave/, (m) => ({ href: `/admin/leave`, label: `Show ${m[1]}'s leave` })],
    [/^Initials (\S+) (are already used|already belong)/, (m) => ({ href: `/admin/people?find=${q(m[1])}`, label: `Show who has ${m[1]}` })],
    [/already a holiday/i, () => ({ href: "/admin/holidays#holidays", label: "Show the holidays" })],
    [/^There is already equipment called/, () => ({ href: "/equipment#manage", label: "Show the equipment" })],
    [/^You already have a pending request/, () => ({ href: "/faculty#requests", label: "Show my requests" })],
    [/has already been decided|already decided/, () => ({ href: "/admin/history", label: "Show decided requests" })],
    [/^(Slot .* is|The slot is) no longer free/, () => ({ href: "/admin/allot", label: "Show the day's rooms" })],
    [/^Already booked by/, () => ({ href: "/equipment", label: "Show who has it" })],
  ];
  for (const [re, to] of rules) {
    const m = message.match(re);
    if (m) return to(m);
  }
  return undefined;
}
