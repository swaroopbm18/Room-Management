import { strFromU8, unzipSync } from "fflate";

/**
 * Reading a list of holidays from an Excel sheet (.xlsx) or a CSV file, in the browser, so
 * only the holidays are sent to the server. Small enough that no spreadsheet library is needed.
 *
 * The sheet has a Date column and a Name column, and optionally a Make-up day column (Yes/No).
 * A header row is found by its words; without one, column A is the date and column B the name.
 */

export type SheetHoliday = {
  /** Row number in the sheet, as Excel shows it, for messages. */
  row: number;
  date: string;
  name: string;
  /** False when the Make-up day column says No. */
  makeup: boolean;
};
export type SheetResult = { holidays: SheetHoliday[]; problems: { row: number; text: string }[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** The text of every <t> run inside a piece of XML (a shared string or an inline string). */
const runs = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+$/, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** The first sheet of an .xlsx file as rows of cells. Numbers stay numbers (Excel keeps dates as day numbers). */
export function readXlsxRows(bytes: Uint8Array): { row: number; cells: (string | number)[] }[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("That file isn't an Excel workbook (.xlsx). Save it as .xlsx or .csv and try again.");
  }
  const text = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  // The first sheet in the workbook's order, through its relationship
  const firstId = text("xl/workbook.xml").match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const target = firstId && text("xl/_rels/workbook.xml.rels").match(new RegExp(`<Relationship\\b[^>]*Id="${firstId}"[^>]*Target="([^"]+)"`))?.[1];
  const path = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`) : "xl/worksheets/sheet1.xml";
  const sheet = text(path) || text("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("That workbook has no sheet to read.");
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));

  const out: { row: number; cells: (string | number)[] }[] = [];
  for (const r of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNum = Number(r[1].match(/\br="(\d+)"/)?.[1] ?? out.length + 1);
    const cells: (string | number)[] = [];
    let next = 0;
    for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const i = ref ? colIndex(ref) : next;
      next = i + 1;
      const body = c[2] ?? "";
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value: string | number = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = runs(body);
      else if (type === "str" || type === "e") value = unescapeXml(v ?? "");
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined && v !== "") value = Number(v);
      cells[i] = value;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    out.push({ row: rowNum, cells });
  }
  return out;
}

/** Rows of a CSV file, with quoted fields. */
export function readCsvRows(text: string): { row: number; cells: string[] }[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cur.push(field);
      field = "";
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.map((cells, i) => ({ row: i + 1, cells }));
}

const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * A date from a sheet cell: an Excel day number, 2026-12-25, 25/12/2026 (day first, as in
 * India; also with - or .), 25 Dec 2026, 25-Dec-26 or December 25, 2026.
 */
export function parseSheetDate(v: string | number): string | null {
  if (typeof v === "number") {
    // Excel counts days from 30 December 1899 (with its 1900 leap-year quirk built in)
    if (!Number.isFinite(v) || v < 1 || v > 2958465) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10);
  }
  const s = v.trim().replace(/\s+/g, " ").replace(/,/g, "");
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseSheetDate(Number(s));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return iso(fullYear(+m[3]), +m[2], +m[1]);
  const month = (w: string) => MONTHS.indexOf(w.slice(0, 3).toLowerCase()) + 1;
  // Weekday names in front ("Fri 25 Dec 2026") are ignored
  const t = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.? /i, "");
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?[- ]([a-z]+)\.?[- ](\d{2}|\d{4})$/i);
  if (m && month(m[2])) return iso(fullYear(+m[3]), month(m[2]), +m[1]);
  m = t.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/i);
  if (m && month(m[1])) return iso(+m[3], month(m[1]), +m[2]);
  return null;
}

const NO = /^(no|n|false|0|none|not needed|no make-?up( day)?)$/i;

/** The holidays in a sheet's rows, and a line for each row that couldn't be read. */
export function holidaysFromRows(rows: { row: number; cells: (string | number)[] }[]): SheetResult {
  const str = (v: string | number | undefined) => (v === undefined ? "" : String(v).trim());
  const nonEmpty = rows.filter((r) => r.cells.some((c) => str(c) !== ""));
  // A header row: the first row naming a date column, among the first few
  let header = -1;
  let dateCol = 0;
  let nameCol = 1;
  let makeupCol = -1;
  for (let i = 0; i < Math.min(5, nonEmpty.length); i++) {
    const words = nonEmpty[i].cells.map((c) => str(c).toLowerCase());
    const d = words.findIndex((w) => /\bdate\b/.test(w));
    if (d < 0) continue;
    header = i;
    dateCol = d;
    const mk = words.findIndex((w) => /make.?up|compensat/.test(w));
    makeupCol = mk;
    const n = words.findIndex((w, j) => j !== d && j !== mk && /name|holiday|occasion|festival|description|reason|particular|event/.test(w));
    nameCol = n >= 0 ? n : words.findIndex((w, j) => j !== d && j !== mk && w !== "" && !/^(s\.?\s?no\.?|sl\.?\s?no\.?|#|day|weekday)$/.test(w));
    break;
  }

  const holidays: SheetHoliday[] = [];
  const problems: SheetResult["problems"] = [];
  for (const r of nonEmpty.slice(header + 1)) {
    const rawDate = r.cells[dateCol];
    const name = str(r.cells[nameCol]).replace(/\s+/g, " ").slice(0, 80);
    const date = rawDate === undefined ? null : parseSheetDate(rawDate);
    if (!date) {
      problems.push({ row: r.row, text: str(rawDate) ? `"${str(rawDate)}" isn't a date I can read` : "No date" });
      continue;
    }
    if (!name) {
      problems.push({ row: r.row, text: "No holiday name" });
      continue;
    }
    holidays.push({ row: r.row, date, name, makeup: makeupCol < 0 || !NO.test(str(r.cells[makeupCol])) });
  }
  if (!holidays.length && !problems.length) problems.push({ row: 0, text: "The sheet is empty" });
  return { holidays, problems };
}

/** Reads an uploaded holiday list, .xlsx or .csv. */
export function readHolidaySheet(fileName: string, bytes: Uint8Array): SheetResult {
  if (/\.xls$/i.test(fileName)) throw new Error("Old .xls files can't be read. Open it in Excel and save it as .xlsx, or as .csv.");
  if (/\.(csv|txt)$/i.test(fileName)) return holidaysFromRows(readCsvRows(strFromU8(bytes)));
  return holidaysFromRows(readXlsxRows(bytes));
}
