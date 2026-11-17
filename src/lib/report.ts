import { isSee } from "./status";
import { getSlots } from "./data";
import { createClient } from "./supabase/server";
import type { AllotmentRow } from "./types";
import { formatDate } from "./time";
import { displayName } from "./auth";
import { expandInitials, getFacultyNames, namedFaculty } from "./facultyNames";

type ReportRow = {
  date: string;
  slot_id: number;
  starts: string;
  ends: string;
  room_id: string;
  kind: AllotmentRow["kind"];
  title: string;
  faculty_name: string | null;
  reason: string;
  subject: string | null;
  /** Null for a class or event an admin allotted directly. */
  request_id?: string | null;
  /** Whose regular class the change replaced */
  original_faculty?: string | null;
};

/** A class handed over through a class exchange that an admin approved (admin_decide_exchange). */
const exchanged = (r: Pick<ReportRow, "kind" | "request_id" | "reason">) => r.kind === "class_request" && !r.request_id && r.reason.startsWith("Class exchange:");

/** A class an admin allotted directly, not a faculty request */
const adminClass = (r: Pick<ReportRow, "kind" | "request_id">) => r.kind === "class_request" && r.request_id === null;

/** A class an admin gave to a substitute because its faculty member is on leave */
const substitute = (r: Pick<ReportRow, "kind" | "request_id" | "reason">) => adminClass(r) && r.reason.startsWith("Substitute for ");

/** What an admin can change on a row (a CIE, event or class; not a dropped class). */
export type ReportEdit = { room: string; date: string; slots: number[]; title: string; reason: string };

/** The slots an admin can delete a row from (put back to the timetable). */
export type ReportDelete = { room: string; date: string; slots: number[] };

export type ReportEntry = { date: string; time: string; room: string; faculty: string; type: string; mode: string; description: string; edit?: ReportEdit; del: ReportDelete };

const TYPE: Partial<Record<AllotmentRow["kind"], string>> = {
  cie: "CIE",
  event: "Event",
  event_request: "Event",
  class_request: "Extra class",
  drop: "Class dropped",
};

/**
 * How the change came about: a faculty member requested that date and time (and an admin approved it),
 * an admin allotted it directly, or the class was dropped by its faculty or removed by an admin.
 */
function modeOf(r: Pick<ReportRow, "kind" | "reason" | "request_id">): string {
  // A class exchange (0029): the two faculty agreed between themselves, then an admin approved it
  if (exchanged(r)) return "Faculty mutually agreed, admin approved";
  if (substitute(r)) return "Substitute for leave, admin assigned";
  if (adminClass(r)) return "Admin allotment";
  switch (r.kind) {
    case "class_request":
    case "event_request":
      return "Faculty request";
    case "cie":
    case "event":
      return "Admin allotment";
    default:
      // admin_free_slots (0005) writes "Removed by admin: …", a CIE day (0030) "Cancelled for CIE: …"; drop_class is the faculty's own
      return r.reason.startsWith("Removed by admin") ? "Removed by admin" : r.reason.startsWith("Cancelled for CIE") ? "Cancelled for CIE by admin" : "Dropped by faculty";
  }
}

const clock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Events, dropped classes and extra classes between two dates, limited to slots between
 * `fromSlot` and `toSlot`. Back-to-back slots of the same change are merged into one line.
 */
export async function getReport(start: string, end: string, fromSlot: number, toSlot: number): Promise<ReportEntry[]> {
  const supabase = await createClient();
  const [slots, { data, error }, names, adminsRes] = await Promise.all([
    getSlots(),
    supabase.rpc("get_change_report", { p_from: start, p_to: end }),
    getFacultyNames(),
    supabase.from("people").select("title, full_name").eq("role", "admin"),
  ]);
  // An event or CIE an admin allotted carries the admin's name until a faculty member is named
  const admins = new Set(((adminsRes.data ?? []) as { title: string | null; full_name: string }[]).map((p) => displayName(p)));
  if (error) throw new Error(error.message);
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const lo = order.get(fromSlot) ?? 0;
  const hi = order.get(toSlot) ?? slots.length - 1;

  // Classes cancelled for a CIE or SEE are not listed one by one: the CIE or SEE itself is
  const examCancel = (r: ReportRow) => r.kind === "drop" && /^Cancelled for (CIE|SEE)\b/.test(r.reason);
  const rows = ((data ?? []) as ReportRow[]).filter((r) => TYPE[r.kind] && !examCancel(r) && order.get(r.slot_id)! >= lo && order.get(r.slot_id)! <= hi);
  const merged: (ReportRow & { last: ReportRow; replaced: string[]; slots: number[] })[] = [];
  // The regular class a booking, CIE or event replaced, e.g. "DBMS-3B (Dr. Ashok Kumar N)"
  const replacedOf = (r: ReportRow) =>
    r.kind !== "drop" && r.subject ? [`${r.subject}${r.original_faculty ? ` (${r.original_faculty})` : ""}`] : [];
  for (const r of rows) {
    const prev = merged.findLast((m) => m.date === r.date && m.room_id === r.room_id);
    const same =
      prev &&
      prev.kind === r.kind &&
      prev.faculty_name === r.faculty_name &&
      prev.reason === r.reason &&
      prev.title === r.title &&
      order.get(prev.last.slot_id)! + 1 === order.get(r.slot_id);
    if (same) {
      prev.last = r;
      prev.slots.push(r.slot_id);
      for (const x of replacedOf(r)) if (!prev.replaced.includes(x)) prev.replaced.push(x);
    } else merged.push({ ...r, last: r, replaced: replacedOf(r), slots: [r.slot_id] });
  }

  // The Faculty name column. A CIE or SEE is taken by its co-ordinators unless faculty were
  // named for it. An event shows the faculty its description names ("Dr. MP") when the record
  // only carries the allotting admin. Initials in full.
  const facultyOf = (m: ReportRow) => {
    if (m.kind === "cie" && (!m.faculty_name || admins.has(m.faculty_name))) return isSee(m.title) ? "SEE Co-ordinators" : "CIE Co-ordinators";
    const own = m.faculty_name ?? (adminClass(m) ? "No faculty assigned" : "");
    const generic = !m.faculty_name || admins.has(m.faculty_name);
    const named = m.kind === "event" && generic ? namedFaculty(`${m.title} ${m.reason}`, names) : [];
    return named.length ? named.join(", ") : expandInitials(own, names);
  };

  return merged
    .sort((a, b) => a.date.localeCompare(b.date) || a.starts.localeCompare(b.starts) || a.room_id.localeCompare(b.room_id))
    .map((m) => {
      const base =
        m.kind === "drop"
          ? [m.subject, m.reason].filter(Boolean).join(": ")
          : m.kind === "class_request"
            ? [adminClass(m) && m.title && m.title !== "Class" ? m.title : null, m.reason].filter(Boolean).join(": ")
            : [m.title && !["Event", "CIE"].includes(m.title) ? m.title : null, m.reason].filter(Boolean).join(": ");
      // An exchange names both faculty in its reason, so it needs no "in place of"
      // A CIE or SEE takes whole days, so the classes it replaced are not listed
      const what = exchanged(m) ? m.reason : m.replaced.length && m.kind !== "cie" ? `${base} (in place of ${m.replaced.join(", ")})` : base;
      return {
        date: m.date,
        time: `${clock(m.starts)} – ${clock(m.last.ends)}`,
        room: m.room_id,
        faculty: facultyOf(m),
        type: exchanged(m) ? "Class exchange" : substitute(m) ? "Substitute class" : adminClass(m) ? "Class" : m.kind === "cie" && isSee(m.title) ? "SEE" : TYPE[m.kind]!,
        mode: modeOf(m),
        // "Dr. MP" in a description reads "Dr. Monika P"
        description: expandInitials(what, names),
        del: { room: m.room_id, date: m.date, slots: m.slots },
        edit: m.kind === "drop" ? undefined : { room: m.room_id, date: m.date, slots: m.slots, title: m.title, reason: m.reason },
      };
    });
}

export function reportCsv(entries: ReportEntry[]): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["Sl. No", "Date", "Time", "Room", "Faculty", "Type", "Mode of request", "Description", "Faculty signature"].map(cell).join(","),
    ...entries.map((e, i) => [String(i + 1), formatDate(e.date), e.time, e.room, e.faculty, e.type, e.mode, e.description, ""].map(cell).join(",")),
  ];
  return "﻿" + lines.join("\r\n");
}
