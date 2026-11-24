"use server";

// Admin bookings: allot or free rooms, bulk allot (CIE, SEE, events, skill labs), and edits to past records.

import { redirect } from "next/navigation";
import { getHolidays, getSlots } from "@/lib/data";
import { addDays, DATE_RE, formatDate, isClosedSunday, todayIST, weekdayOf } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { mergeRuns } from "@/lib/bookings";
import type { AllotmentRow, Slot } from "@/lib/types";
import { skillLabTitle } from "@/lib/skillLab";
import { classesHit, type Release } from "../admin/affected/data";
import { back, withParam, s, slotRange, lines, refreshPages } from "./shared";

const BOOKED_KINDS = ["class_request", "event_request", "cie", "event"];

/**
 * Bookings (events, CIEs, approved requests, admin classes) already in the slots an allotment
 * would take, one line each, e.g. "1:05 PM – 4:45 PM: Agentic AI workshop, booked by Dr. Monika P".
 * Back-to-back slots of one booking are one line. Empty when nothing is booked there.
 */
/** The rooms and times of an allotment: each row of the form gives a date, a start, an end and a room. */
type Place = { date: string; room: string; slots: number[] };
async function allotPlaces(form: FormData): Promise<Place[] | null> {
  const slots = await getSlots();
  const dates = form.getAll("date").map(String);
  const rooms = form.getAll("room").map(String);
  const froms = form.getAll("from").map(String);
  const tos = form.getAll("to").map(String);
  const out: Place[] = [];
  for (let i = 0; i < dates.length; i++) {
    const from = slots.findIndex((x) => String(x.id) === froms[i]);
    const to = slots.findIndex((x) => String(x.id) === tos[i]);
    if (!DATE_RE.test(dates[i]) || !rooms[i] || from < 0 || to < from) return null;
    out.push({ date: dates[i], room: rooms[i], slots: slots.slice(from, to + 1).map((x) => x.id) });
  }
  return out.length ? out : null;
}

/**
 * Bookings (events, CIEs, approved requests, admin classes) already in the slots an allotment
 * would take, one line each, e.g. "MEL-SH, Fri 13 Nov, 1:05 PM – 4:45 PM: Agentic AI workshop,
 * booked by Dr. Monika P". Back-to-back slots of one booking are one line. Empty when nothing is booked there.
 */
export async function allotClashes(form: FormData): Promise<string[]> {
  const places = await allotPlaces(form);
  return places ? clashesFor(places) : [];
}

async function clashesFor(places: Place[]): Promise<string[]> {
  const slots = await getSlots();
  const supabase = await createClient();
  const lines: string[] = [];
  for (const p of places) {
    const { data } = await supabase
      .from("allotments")
      .select("*")
      .eq("room_id", p.room)
      .eq("date", p.date)
      .in("slot_id", p.slots)
      .order("id", { ascending: false });
    // The latest change in each slot is what is there now
    const latest = new Map<number, AllotmentRow>();
    for (const a of (data ?? []) as AllotmentRow[]) if (!latest.has(a.slot_id)) latest.set(a.slot_id, a);
    const booked = [...latest.values()].filter((a) => BOOKED_KINDS.includes(a.kind));
    const where = places.length > 1 ? `${p.room}, ${formatDate(p.date, { year: undefined })}, ` : "";
    for (const { first: a, range } of mergeRuns(booked, slots, (x, y) => x.kind === y.kind && x.title === y.title && x.reason === y.reason && x.faculty_name === y.faculty_name)) {
      const line = `${where}${range}: ${a.title || (a.kind === "cie" ? "CIE" : "Event")}${a.faculty_name ? `, booked by ${a.faculty_name}` : ""}`;
      if (!lines.includes(line)) lines.push(line);
    }
  }
  return lines;
}

export async function adminOverride(form: FormData) {
  const to = back(form, "/admin/allot");
  const places = await allotPlaces(form);
  if (!places) redirect(withParam(to, "error", "Check each date, room and time: the end time must be after the start time."));
  // A booking already there is only replaced once the admin has said so (the form asks first)
  if (s(form, "overwrite") !== "yes") {
    const clashes = await allotClashes(form);
    if (clashes.length) {
      redirect(withParam(to, "error", `Already booked: ${clashes.join("; ")}. Allot again and confirm to overwrite.`));
    }
  }
  // An SEE (semester end exam) is kept as an exam, like a CIE, named SEE
  const see = s(form, "kind") === "see";
  const kind = see ? "cie" : s(form, "kind");
  const title = s(form, "title");
  const args = {
    p_kind: kind,
    p_title: see ? (/^SEE\b/i.test(title) ? title : title ? `SEE ${title}` : "SEE") : title,
    p_reason: s(form, "reason"),
    // A class names its faculty (initials) or none; an event, CIE or SEE may name several, "@A", "@B" or "@ALL"
    p_faculty: s(form, "faculty") || null,
  };
  const supabase = await createClient();
  let error: { message: string; code?: string } | null = null;
  if (places.length === 1) {
    ({ error } = await supabase.rpc("admin_override_slots", { p_room: places[0].room, p_date: places[0].date, p_slots: places[0].slots, ...args }));
  } else {
    // Several rooms or times for one event: all of them, or none if any fails
    ({ error } = await supabase.rpc("admin_override_many", { p_places: places, ...args }));
    if (error && (error.code === "PGRST202" || /admin_override_many/.test(error.message))) {
      error = { message: "Allotting several rooms at once needs database update 0034. Run it in the Supabase SQL Editor." };
    }
  }
  refreshPages();
  if (error) redirect(withParam(to, "error", error.message));
  const total = places.reduce((n, p) => n + p.slots.length, 0);
  const n = total === 1 ? "" : ` for ${total} slots`;
  const where = places.length > 1 ? ` in ${new Set(places.map((p) => p.room)).size} rooms` : "";
  const past = places.every((p) => p.date < todayIST());
  redirect(
    withParam(
      to,
      "msg",
      past
        ? `Recorded${places.length === 1 ? ` for ${formatDate(places[0].date)}` : ""}${where}${n}. It shows in History and the Report.`
        : kind === "class_request"
          ? `Room allotted for the class${where}${n}.`
          : `${see ? "Allotted for the SEE" : "Room allotted"}${where}${n}.`,
    ),
  );
}

export async function adminFree(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_free_slots", {
    p_room: s(form, "room"),
    p_date: s(form, "date"),
    p_slots: await slotRange(form),
    p_reason: s(form, "reason"),
  });
  refreshPages();
  const to = back(form, "/admin/allot");
  redirect(error ? withParam(to, "error", error.message) : withParam(to, "msg", data === 1 ? "Room freed for 1 slot." : `Room freed for ${data} slots.`));
}

/** Changes a booking's name and description, across all of its back-to-back slots. */
export async function adminEditBooking(form: FormData) {
  const args = { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: Number(s(form, "slot")), p_title: s(form, "title") };
  const supabase = await createClient();
  const reason = s(form, "reason");
  const changed = reason !== s(form, "old_reason");
  const { error } = changed
    ? await supabase.rpc("admin_edit_booking", { ...args, p_reason: reason })
    : await supabase.rpc("admin_rename_booking", args);
  refreshPages();
  const to = back(form, "/admin/allot");
  if (error) {
    redirect(withParam(to, "error", error.message));
  }
  redirect(withParam(to, "msg", "Booking updated."));
}

/** Restores every slot of a booking to the timetable. */
export async function adminRestoreSlots(form: FormData) {
  const supabase = await createClient();
  const slots = s(form, "slots").split(",").map(Number).filter(Boolean);
  let error: { message: string } | null = null;
  for (const slot of slots) {
    ({ error } = await supabase.rpc("admin_restore", { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: slot, p_reason: s(form, "reason") }));
    if (error) break;
  }
  refreshPages();
  const to = back(form, "/admin/allot");
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : slots.length === 1 ? "Slot restored to the timetable." : `${slots.length} slots restored to the timetable.`));
}

/**
 * Bulk allot: every working day from a start date to an end date (Sundays and holidays skipped,
 * optionally only some weekdays), and on each, every row's rooms at that row's times.
 */
async function bulkPlaces(form: FormData): Promise<{ places: Place[]; days: string[] } | { error: string }> {
  const from = s(form, "from_date");
  const until = s(form, "to_date") || from;
  if (!DATE_RE.test(from) || !DATE_RE.test(until) || until < from) return { error: "The end date must be on or after the start date." };
  if (until > addDays(todayIST(), 120)) return { error: "Bulk allot can go up to 120 days ahead." };
  const weekdays = form.getAll("weekdays").map(Number).filter((n) => n >= 1 && n <= 7);
  const [slots, holidays] = await Promise.all([getSlots(), getHolidays()]);
  const days: string[] = [];
  for (let d = from; d <= until && days.length < 62; d = addDays(d, 1)) {
    if (!isClosedSunday(d) && !holidays.has(d) && (!weekdays.length || weekdays.includes(weekdayOf(d)))) days.push(d);
  }
  if (!days.length) return { error: "No working day in those dates. Sundays, holidays and unticked weekdays are skipped." };
  const keys = s(form, "rowkeys").split(",").filter(Boolean);
  const froms = form.getAll("from").map(String);
  const tos = form.getAll("to").map(String);
  const rows: { rooms: string[]; slots: number[] }[] = [];
  for (let i = 0; i < keys.length; i++) {
    const rooms = form.getAll(`rooms-${keys[i]}`).map(String).filter(Boolean);
    const a = slots.findIndex((x) => String(x.id) === froms[i]);
    const b = slots.findIndex((x) => String(x.id) === tos[i]);
    if (!rooms.length) return { error: `Pick at least one room in row ${i + 1}.` };
    if (a < 0 || b < a) return { error: `Check the times in row ${i + 1}: the end must be after the start.` };
    rows.push({ rooms, slots: slots.slice(a, b + 1).map((x) => x.id) });
  }
  if (!rows.length) return { error: "Add at least one row of rooms and times." };
  // The same room in two rows on one day is one place with both rows' slots
  const byKey = new Map<string, Place>();
  for (const d of days) {
    for (const r of rows) {
      for (const room of r.rooms) {
        const k = `${d}|${room}`;
        const p = byKey.get(k) ?? { date: d, room, slots: [] };
        for (const id of r.slots) if (!p.slots.includes(id)) p.slots.push(id);
        byKey.set(k, p);
      }
    }
  }
  return { places: [...byKey.values()], days };
}

export type BulkPreview = {
  error?: string;
  days?: string[];
  rooms?: number;
  slots?: number;
  clashes?: string[];
  /** The name it will have, with its sections: "Skill Lab - 3B/3D" */
  title?: string;
  /** Classes of the sections attending, released (one line per run) */
  released?: string[];
  /** Classes of other sections that lose their room to it: they go to Classes affected */
  displaced?: string[];
  /** Days read for released and displaced classes, when fewer than all */
  readDays?: number;
};
type BulkKind = "cie" | "see" | "event" | "skill_lab" | "class_request";
const bulkKind = (form: FormData): BulkKind => {
  const k = s(form, "kind");
  return k === "cie" || k === "see" || k === "event" || k === "skill_lab" || k === "class_request" ? k : "event";
};

/** The sections attending an event or skill lab, e.g. ["3B", "3D"]; none for a CIE, SEE or class. */
function bulkSections(form: FormData) {
  const kind = bulkKind(form);
  if (kind !== "event" && kind !== "skill_lab") return [];
  return [...new Set(form.getAll("sections").map((x) => String(x).toUpperCase()).filter((x) => /^\d[A-Z]$/.test(x)))].sort((x, y) => x.localeCompare(y, "en", { numeric: true }));
}

/** The name a bulk allotment is saved under: an event or skill lab gets its sections ("Skill Lab - 3B/3D"), an SEE starts "SEE". */
function bulkTitle(form: FormData, sections: string[]) {
  const kind = bulkKind(form);
  const title = s(form, "title");
  if (kind === "see") return /^SEE\b/i.test(title) ? title : title ? `SEE ${title}` : "SEE";
  if (kind === "skill_lab") return skillLabTitle(title || "Skill Lab", sections);
  if (kind === "event" && sections.length) return skillLabTitle(title || "Event", sections);
  return title;
}

/** Released classes as runs: back-to-back slots of one class in one room are one line. */
function releaseRuns(releases: Release[], slots: Slot[]) {
  const order = new Map(slots.map((x, i) => [x.id, i]));
  const runs: { date: string; room: string; slots: number[]; subject: string; section: string }[] = [];
  for (const r of releases) {
    const last = runs[runs.length - 1];
    if (last && last.date === r.date && last.room === r.room && last.subject === r.subject && (order.get(last.slots[last.slots.length - 1]) ?? -9) + 1 === order.get(r.slot)) last.slots.push(r.slot);
    else runs.push({ date: r.date, room: r.room, slots: [r.slot], subject: r.subject, section: r.section });
  }
  return runs;
}

/** The semesters whose classes a CIE or SEE cancels. */
const bulkSemesters = (form: FormData) => {
  const kind = bulkKind(form);
  return kind === "cie" || kind === "see" ? form.getAll("semesters").map(String).filter((x) => /^\d$/.test(x)) : [];
};

/** What a bulk allotment would take, and what is already booked there, without saving anything. */
export async function bulkAllotPreview(form: FormData): Promise<BulkPreview> {
  const plan = await bulkPlaces(form);
  if ("error" in plan) return { error: plan.error };
  const kind = bulkKind(form);
  const sections = bulkSections(form);
  if (kind === "skill_lab" && !sections.length) return { error: "Pick the sections that go to the skill lab." };
  const [clashes, slots, hit] = await Promise.all([clashesFor(plan.places), getSlots(), classesHit(plan.places, sections, bulkSemesters(form), 14)]);
  const many = plan.days.length > 1;
  return {
    days: plan.days,
    rooms: new Set(plan.places.map((p) => p.room)).size,
    slots: plan.places.reduce((n, p) => n + p.slots.length, 0),
    clashes,
    title: bulkTitle(form, sections),
    released: lines(releaseRuns(hit.releases, slots), slots, many),
    displaced: lines(hit.displaced, slots, many),
    readDays: hit.read < plan.days.length ? hit.read : undefined,
  };
}

/**
 * Bulk allotment: a CIE, SEE, event, skill lab or class, all or none. An event or skill lab for some
 * sections releases those sections' own classes at its times. Then, if any class lost its room to
 * it, Classes affected opens on those days, to move them.
 */
export async function adminBulkAllot(form: FormData) {
  const to = back(form, "/admin/cie");
  const plan = await bulkPlaces(form);
  if ("error" in plan) redirect(withParam(to, "error", plan.error));
  const kind = bulkKind(form);
  const sections = bulkSections(form);
  if (kind === "skill_lab" && !sections.length) redirect(withParam(to, "error", "Pick the sections that go to the skill lab."));
  const title = bulkTitle(form, sections);
  const semesters = bulkSemesters(form);
  const reason = s(form, "reason");
  const faculty = s(form, "faculty") || null;
  const supabase = await createClient();
  const hit = sections.length ? await classesHit(plan.places, sections) : null;
  const releases = (hit?.releases ?? []).map(({ room, date, slot, section }) => ({ room, date, slot, section }));
  let rpc: string;
  const { data, error } =
    kind === "skill_lab"
      ? await supabase.rpc((rpc = "admin_skill_lab"), { p_title: title, p_reason: reason, p_faculty: faculty, p_places: plan.places, p_releases: releases, p_moves: [] })
      : sections.length
        ? await supabase.rpc((rpc = "admin_bulk_allot_sections"), { p_places: plan.places, p_kind: "event", p_title: title, p_reason: reason, p_faculty: faculty, p_releases: releases })
        : await supabase.rpc((rpc = "admin_bulk_allot"), {
            p_places: plan.places,
            p_kind: kind === "see" ? "cie" : kind,
            p_title: title,
            p_reason: reason,
            p_faculty: faculty,
            p_semesters: semesters.length ? semesters : null,
          });
  refreshPages();
  if (error) {
    const missing = error.code === "PGRST202" || error.message.includes(rpc);
    const update = rpc === "admin_skill_lab" ? "0037" : rpc === "admin_bulk_allot" ? "0035" : "0042";
    redirect(withParam(to, "error", missing ? `This needs database update ${update}. Run it in the Supabase SQL Editor.` : `Nothing was allotted: ${error.message}`));
  }
  const r = (data ?? {}) as { slots?: number; booked?: number; cancelled?: number; released?: number };
  const booked = r.slots ?? r.booked ?? 0;
  const rooms = new Set(plan.places.map((p) => p.room)).size;
  let msg =
    `${title ? `${title}: a` : "A"}llotted ${booked} slots in ${rooms} ${rooms === 1 ? "room" : "rooms"} over ${plan.days.length} ${plan.days.length === 1 ? "day" : "days"}.` +
    (semesters.length ? ` Cancelled ${r.cancelled ?? 0} class slots of semester ${semesters.join(", ")}.` : "") +
    (sections.length ? ` Released ${r.released ?? 0} class ${r.released === 1 ? "slot" : "slots"} of ${sections.join(", ")}.` : "");
  // Classes that lost their room: open Classes affected on those days to move them
  const lost = hit ? hit.displaced : (await classesHit(plan.places, sections, semesters, 14)).displaced;
  if (lost.length) {
    msg += ` ${lost.length} ${lost.length === 1 ? "class" : "classes"} of other sections lost ${lost.length === 1 ? "its" : "their"} room: move ${lost.length === 1 ? "it" : "them"} below.`;
    const start = plan.days[0] < todayIST() ? todayIST() : plan.days[0];
    redirect(withParam(`/admin/affected?${new URLSearchParams({ start, end: addDays(start, 13) }).toString()}`, "msg", msg));
  }
  redirect(withParam(to, "msg", msg));
}

/** Changes a recorded CIE, event or class (past ones too) from the report. */
/** Deletes a wrong record (past ones too): its slots go back to the timetable. History keeps it. */
export async function adminDeleteRecord(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_record", {
    p_room: s(form, "room"),
    p_date: s(form, "date"),
    p_slots: s(form, "slots").split(",").map(Number).filter(Boolean),
    p_reason: s(form, "reason") || null,
  });
  refreshPages();
  const to = back(form, "/admin/report");
  if (error) {
    const missing = error.code === "PGRST202" || /admin_delete_record/.test(error.message);
    redirect(withParam(to, "error", missing ? "Deleting records needs database update 0034. Run it in the Supabase SQL Editor." : error.message));
  }
  redirect(withParam(to, "msg", data === 1 ? "Record deleted. The slot is back to the timetable." : `Record deleted. ${data} slots are back to the timetable.`));
}

export async function adminEditRecord(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_edit_record", {
    p_room: s(form, "room"),
    p_date: s(form, "date"),
    p_slots: s(form, "slots").split(",").map(Number).filter(Boolean),
    p_title: s(form, "title"),
    p_reason: s(form, "reason"),
    p_faculty: s(form, "faculty") || null,
  });
  refreshPages();
  const to = back(form, "/admin/report");
  if (error) {
    const missing = error.code === "PGRST202" || /admin_edit_record/.test(error.message);
    redirect(withParam(to, "error", missing ? "Editing records needs database update 0033. Run it in the Supabase SQL Editor." : error.message));
  }
  redirect(withParam(to, "msg", data === 1 ? "Record updated." : `Record updated for ${data} slots.`));
}
