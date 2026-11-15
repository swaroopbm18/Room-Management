import { createClient } from "@supabase/supabase-js";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

type Row = {
  date: string;
  room_id: string;
  room_name: string;
  slot_id: number;
  starts: string;
  ends: string;
  status: string;
  subject: string | null;
  faculty_name: string | null;
  reason: string | null;
  owner: string;
};

/** Text for a calendar line: backslashes, semicolons, commas and newlines are escaped. */
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 bytes are folded, as calendar apps expect. */
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
};
const stamp = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.slice(0, 5).replace(":", "")}00`;

/**
 * A faculty member's calendar feed: their classes and bookings from a week back to four weeks
 * ahead, back-to-back slots of the same class joined into one event. Calendar apps fetch it
 * with the private token in the address, so no sign-in is needed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, "");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error) return new Response("This calendar isn't available right now.", { status: 503 });
  const rows = (data ?? []) as Row[];
  if (!rows.length && !/^[0-9a-f]{64}$/.test(token)) return new Response("Calendar not found.", { status: 404 });

  // Join back-to-back slots of the same class in the same room
  const events: (Row & { last: number })[] = [];
  for (const r of rows) {
    const prev = events.at(-1);
    if (prev && prev.date === r.date && prev.room_id === r.room_id && prev.subject === r.subject && prev.status === r.status && prev.ends === r.starts) {
      prev.ends = r.ends;
      prev.last = r.slot_id;
    } else events.push({ ...r, last: r.slot_id });
  }

  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const owner = rows[0]?.owner ?? "My classes";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${SITE_NAME}//Calendar//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`Classes · ${owner}`)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Kolkata",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0530",
    "TZOFFSETTO:+0530",
    "TZNAME:IST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of events) {
    const what = e.status === "booked" ? "Booked" : "Class";
    const notes = [what === "Booked" ? "Booked room" : "Timetable class", e.reason ?? ""].filter(Boolean).join(". ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.date}-${e.room_id}-${e.slot_id}-${e.last}@room-management`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Asia/Kolkata:${stamp(e.date, e.starts)}`,
      `DTEND;TZID=Asia/Kolkata:${stamp(e.date, e.ends)}`,
      `SUMMARY:${esc(e.subject || what)}`,
      `LOCATION:${esc(e.room_name || e.room_id)}`,
      `DESCRIPTION:${esc(notes)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="classes.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
