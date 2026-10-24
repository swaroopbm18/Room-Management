import { unzipSync, strFromU8 } from "fflate";

// Reads the department's Room Allocation Time Table (.docx), the same layout as
// scripts/parse_timetable.py: for every room, a one-row table "Room Name: …" followed by a
// grid whose first two rows hold the times and whose next rows are MON..SAT.

export type ParsedEntry = {
  room_id: string;
  weekday: number;
  slot_id: number;
  subject: string;
  faculty_initials: string[];
  faculty_label: string;
  is_department: boolean;
};

export type ParsedTimetable = { rooms: string[]; entries: ParsedEntry[]; warnings: string[] };

const DAYS: Record<string, number> = { MON: 1, TUE: 2, WED: 3, THU: 4, THUR: 4, FRI: 5, SAT: 6 };
const DEPARTMENTS = new Set(["CSE", "MBA", "ISE", "ECE", "EEE", "MECH", "CIVIL"]);
const FACULTY_RE = /\b(Prof|Dr|Mr|Ms|Mrs)[.,]\s*([A-Z]{2,5})\b/g;
const TIME_RE = /(\d{1,2}):(\d{2})\s*([AP]M)/gi;

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function paragraphText(p: string): string {
  let out = "";
  for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
    out += m[1] !== undefined ? decode(m[1]) : m[0] === "<w:tab/>" ? " " : "\n";
  }
  return out;
}

function cellText(tc: string): string {
  return [...tc.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => paragraphText(m[0])).join("\n").trim();
}

/** Each table as rows of cell texts, with merged cells repeated like python-docx does. */
function readTables(xml: string): string[][][] {
  const tables: string[][][] = [];
  for (const t of xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)) {
    const rows: string[][] = [];
    const above = new Map<number, string>(); // text of the cell a vertical merge started in
    for (const tr of t[0].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)) {
      const row: string[] = [];
      for (const tc of tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)) {
        const span = Number(tc[0].match(/<w:gridSpan w:val="(\d+)"/)?.[1] ?? 1);
        const vmerge = tc[0].match(/<w:vMerge(?: w:val="(\w+)")?\/>/);
        const col = row.length;
        let text = cellText(tc[0]);
        if (vmerge && vmerge[1] !== "restart") text = above.get(col) ?? text;
        else if (vmerge) above.set(col, text);
        for (let i = 0; i < span; i++) row.push(text);
      }
      rows.push(row);
    }
    tables.push(rows);
  }
  return tables;
}

const to24 = (h: string, m: string, ampm: string) => `${String((Number(h) % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${m}`;

/**
 * Parse the uploaded document. `slotByStart` maps "HH:MM" start times to slot ids and
 * `knownRooms` lists the rooms the site has; anything else is reported as a warning.
 */
export function parseTimetableDocx(data: Uint8Array, slotByStart: Map<string, number>, knownRooms: Set<string>): ParsedTimetable {
  let xml: string;
  try {
    const files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" });
    xml = strFromU8(files["word/document.xml"]);
  } catch {
    throw new Error("This file could not be read. Please upload the timetable as a Word (.docx) file.");
  }
  if (!xml) throw new Error("This file could not be read. Please upload the timetable as a Word (.docx) file.");

  const rooms: string[] = [];
  const entries: ParsedEntry[] = [];
  const warnings: string[] = [];
  let room: string | null = null;

  for (const rows of readTables(xml)) {
    if (rows.length === 1) {
      const m = rows[0][0]?.match(/Room Name:\s*(.+)/);
      if (m) {
        room = m[1].trim().replace(/\s+/g, "");
        if (!knownRooms.has(room)) {
          warnings.push(`Room ${room} is not on the site, so it was skipped.`);
          room = null;
        } else if (!rooms.includes(room)) rooms.push(room);
      }
      continue;
    }
    if (!room || rows.length < 3) continue;
    const cols: { i: number; slot: number }[] = [];
    rows[0].forEach((h, i) => {
      if (i === 0 || /BREAK/i.test(h)) return;
      const times = [...h.matchAll(TIME_RE)];
      if (times.length !== 2) return;
      const start = to24(times[0][1], times[0][2], times[0][3]);
      const slot = slotByStart.get(start);
      if (slot) cols.push({ i, slot });
      else warnings.push(`A column starting at ${start} in room ${room} does not match any slot.`);
    });
    for (const cells of rows.slice(2)) {
      const day = DAYS[(cells[0] ?? "").trim().toUpperCase()];
      if (!day) continue;
      for (const { i, slot } of cols) {
        const text = (cells[i] ?? "").trim();
        if (!text || /BREAK/i.test(text)) continue;
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        let subject = lines[0];
        let facText = lines.slice(1).join(" ");
        // "DST-3E/Prof, BHL" style: faculty written on the same line
        if (!facText && subject.includes("/") && new RegExp(FACULTY_RE.source).test(subject)) {
          [subject, facText] = [subject.slice(0, subject.indexOf("/")), subject.slice(subject.indexOf("/") + 1)];
        }
        const faculty = [...facText.matchAll(FACULTY_RE)];
        const initials = faculty.map((f) => f[2]);
        entries.push({
          room_id: room,
          weekday: day,
          slot_id: slot,
          subject: subject.trim(),
          faculty_initials: initials,
          faculty_label: faculty.map((f) => `${f[1]}. ${f[2]}`).join(", "),
          is_department: DEPARTMENTS.has(subject.trim().toUpperCase()) && initials.length === 0,
        });
      }
    }
  }
  if (rooms.length === 0) throw new Error('No rooms were found. Each room needs a "Room Name: …" line above its timetable.');
  return { rooms, entries, warnings };
}
