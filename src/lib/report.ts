import { getSlots } from "./data";
import { createClient } from "./supabase/server";
import type { AllotmentRow } from "./types";
import { formatDate } from "./time";

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
};

export type ReportEntry = { date: string; time: string; room: string; faculty: string; type: string; mode: string; description: string };

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
function modeOf(r: Pick<ReportRow, "kind" | "reason">): string {
  switch (r.kind) {
    case "class_request":
    case "event_request":
      return "Faculty request";
    case "cie":
    case "event":
      return "Admin allotment";
    default:
      // admin_free_slots (0005) writes "Removed by admin: …"; drop_class is the faculty's own
      return r.reason.startsWith("Removed by admin") ? "Removed by admin" : "Dropped by faculty";
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
  const [slots, { data, error }] = await Promise.all([getSlots(), supabase.rpc("get_change_report", { p_from: start, p_to: end })]);
  if (error) throw new Error(error.message);
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const lo = order.get(fromSlot) ?? 0;
  const hi = order.get(toSlot) ?? slots.length - 1;

  const rows = ((data ?? []) as ReportRow[]).filter((r) => TYPE[r.kind] && order.get(r.slot_id)! >= lo && order.get(r.slot_id)! <= hi);
  const merged: (ReportRow & { last: ReportRow })[] = [];
  for (const r of rows) {
    const prev = merged.findLast((m) => m.date === r.date && m.room_id === r.room_id);
    const same =
      prev &&
      prev.kind === r.kind &&
      prev.faculty_name === r.faculty_name &&
      prev.reason === r.reason &&
      prev.title === r.title &&
      order.get(prev.last.slot_id)! + 1 === order.get(r.slot_id);
    if (same) prev.last = r;
    else merged.push({ ...r, last: r });
  }

  return merged
    .sort((a, b) => a.date.localeCompare(b.date) || a.starts.localeCompare(b.starts) || a.room_id.localeCompare(b.room_id))
    .map((m) => {
      const what =
        m.kind === "drop"
          ? [m.subject, m.reason].filter(Boolean).join(": ")
          : m.kind === "class_request"
            ? m.reason
            : [m.title && !["Event", "CIE"].includes(m.title) ? m.title : null, m.reason].filter(Boolean).join(": ");
      return {
        date: m.date,
        time: `${clock(m.starts)} – ${clock(m.last.ends)}`,
        room: m.room_id,
        faculty: m.faculty_name ?? "",
        type: TYPE[m.kind]!,
        mode: modeOf(m),
        description: what,
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
