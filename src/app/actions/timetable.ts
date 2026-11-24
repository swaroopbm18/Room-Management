"use server";

// The room and class timetables: cell edits, Word upload, timetable PDFs and the semester end and new semester steps.

import { redirect } from "next/navigation";
import { addDays, DATE_RE, formatDate, todayIST } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { getEditorTimetable } from "@/lib/data";
import { getPerson } from "@/lib/auth";
import { applyFacultyAliases, type ParsedEntry } from "@/lib/timetableDocx";
import { back, withParam, run, s, slotRange, refreshPages } from "./shared";

export async function adminEditTimetable(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_edit_timetable", {
    p_room: s(form, "room"),
    p_weekday: Number(s(form, "weekday")),
    p_slots: await slotRange(form),
    p_subject: s(form, "subject"),
    p_initials: s(form, "initials").split(/[,\s]+/).filter(Boolean),
    p_is_department: form.get("department") === "on",
  });
  refreshPages();
  const to = back(form, "/admin/timetable");
  redirect(
    error
      ? withParam(to, "error", error.message)
      : withParam(to, "msg", `Timetable changed. It takes effect from ${formatDate(String(data), { weekday: "long" })}; earlier days keep the old timetable.`),
  );
}

/**
 * Save one class in the class timetable: fix its subject or faculty initials, move it to a free
 * room, or add a class to an empty slot. Takes effect from tomorrow, like every timetable edit.
 */
export async function saveClassEntry(form: FormData) {
  const supabase = await createClient();
  const to = back(form, "/admin/class-timetable");
  const weekday = Number(s(form, "weekday"));
  const slotIds = s(form, "slots").split(",").map(Number).filter(Boolean);
  const oldRoom = s(form, "old_room");
  const room = s(form, "room");
  const subject = s(form, "subject");
  if (!subject) redirect(withParam(to, "error", "Type the subject and section, e.g. DBMS-3B. To remove the class, use Delete."));
  if (!room) redirect(withParam(to, "error", "Pick a room."));
  const edit = (r: string, subj: string, initials: string[]) =>
    supabase.rpc("admin_edit_timetable", { p_room: r, p_weekday: weekday, p_slots: slotIds, p_subject: subj, p_initials: initials, p_is_department: false });

  if (room !== oldRoom) {
    // Never write over another class: the new room must be free in every slot
    const { data } = await getEditorTimetable(supabase, "get_timetable_all", addDays(todayIST(), 1));
    const clash = ((data ?? []) as { room_id: string; weekday: number; slot_id: number; subject: string }[]).find(
      (t) => t.room_id === room && t.weekday === weekday && slotIds.includes(t.slot_id),
    );
    if (clash) redirect(withParam(to, "error", `${room} already has ${clash.subject} then. Pick a free room.`));
  }
  const { data, error } = await edit(room, subject, s(form, "initials").split(/[,\s]+/).filter(Boolean));
  if (!error && oldRoom && room !== oldRoom) {
    const moved = await edit(oldRoom, "", []);
    if (moved.error) {
      refreshPages();
      redirect(withParam(to, "error", `The class was added to ${room} but is still in ${oldRoom} too: ${moved.error.message}. Delete it from ${oldRoom}.`));
    }
  }
  refreshPages();
  redirect(
    error
      ? withParam(to, "error", error.message)
      : withParam(to, "msg", `${subject} saved. It takes effect from ${formatDate(String(data), { weekday: "long" })}; earlier days keep the old timetable.`),
  );
}

/** Remove one class from the class timetable, from tomorrow on. The room becomes free. */
export async function deleteClassEntry(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_edit_timetable", {
    p_room: s(form, "old_room"),
    p_weekday: Number(s(form, "weekday")),
    p_slots: s(form, "slots").split(",").map(Number).filter(Boolean),
    p_subject: "",
    p_initials: [],
    p_is_department: false,
  });
  refreshPages();
  const to = back(form, "/admin/class-timetable");
  redirect(
    error
      ? withParam(to, "error", error.message)
      : withParam(to, "msg", `${s(form, "old_subject")} removed. ${s(form, "old_room")} is free then from ${formatDate(String(data), { weekday: "long" })}.`),
  );
}

export type UploadChange = { room: string; weekday: number; slot: number; before: string; after: string };
export type UploadPreview = { error?: string; warnings?: string[]; changes?: UploadChange[]; rooms?: string[]; payload?: string };
const cellValue = (subject?: string, label?: string) => (subject ? `${subject}${label ? ` (${label})` : ""}` : "Free");

/**
 * Compare a timetable read from the Word file (parsed in the browser, since the file itself can
 * be several MB) with the current one, and list what would change, without saving anything.
 */
export async function previewTimetableUpload(_prev: UploadPreview, form: FormData): Promise<UploadPreview> {
  let parsed: { rooms: string[]; entries: ParsedEntry[]; warnings: string[] };
  try {
    parsed = JSON.parse(s(form, "parsed"));
    if (!Array.isArray(parsed.rooms) || !Array.isArray(parsed.entries)) throw new Error();
  } catch {
    return { error: "The timetable could not be read. Please choose the file again." };
  }
  const supabase = await createClient();
  const [currentRes, aliasRes] = await Promise.all([
    getEditorTimetable(supabase, "get_timetable_all", addDays(todayIST(), 1)),
    supabase.from("faculty_aliases").select("alias, initials"),
  ]);
  if (currentRes.error) return { error: currentRes.error.message };
  // Typos an admin merged into the right faculty member are read as that member (the database does the same on save)
  parsed.entries = applyFacultyAliases(parsed.entries, (aliasRes.data ?? []) as { alias: string; initials: string }[]);
  type Cell = { room_id: string; weekday: number; slot_id: number; subject: string; faculty_initials: string[]; faculty_label: string; is_department: boolean };
  const key = (c: { room_id: string; weekday: number; slot_id: number }) => `${c.room_id}|${c.weekday}|${c.slot_id}`;
  const current = new Map(((currentRes.data ?? []) as Cell[]).filter((c) => parsed.rooms.includes(c.room_id)).map((c) => [key(c), c]));
  const incoming = new Map(parsed.entries.map((c) => [key(c), c]));
  const changes: UploadChange[] = [];
  for (const k of new Set([...current.keys(), ...incoming.keys()])) {
    const o = current.get(k);
    const n = incoming.get(k);
    if (o?.subject === n?.subject && (o?.faculty_initials ?? []).join() === (n?.faculty_initials ?? []).join() && !!o?.is_department === !!n?.is_department) continue;
    const [room, weekday, slot] = k.split("|");
    changes.push({ room, weekday: Number(weekday), slot: Number(slot), before: cellValue(o?.subject, o?.faculty_label), after: cellValue(n?.subject, n?.faculty_label) });
  }
  changes.sort((a, b) => a.room.localeCompare(b.room) || a.weekday - b.weekday || a.slot - b.slot);
  return { warnings: parsed.warnings ?? [], changes, rooms: parsed.rooms, payload: JSON.stringify({ rooms: parsed.rooms, entries: parsed.entries }) };
}

/** Save an uploaded timetable that the admin has reviewed. */
export async function applyTimetableUpload(form: FormData) {
  const { rooms, entries } = JSON.parse(s(form, "payload") || "{}") as { rooms?: string[]; entries?: unknown[] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_replace_timetable", { p_rooms: rooms ?? [], p_entries: entries ?? [] });
  refreshPages();
  redirect(
    error
      ? withParam("/admin/timetable", "error", error.message)
      : withParam("/admin/timetable", "msg", `Timetable updated: ${data} ${data === 1 ? "cell" : "cells"} changed, from ${formatDate(addDays(todayIST(), 1), { weekday: "long" })}. Earlier days keep the old timetable.`),
  );
}

/** Clears the last semester's duties, subjects and leave, as ticked. */
export async function semesterRollover(form: FormData) {
  const supabase = await createClient();
  const subjects = s(form, "subjects");
  const { data, error } = await supabase.rpc("admin_rollover", {
    p_duties: form.get("duties") === "on",
    p_subjects: subjects === "all" || subjects === "timetable" ? subjects : "none",
    p_leave: form.get("leave") === "on",
  });
  refreshPages();
  redirect(withParam(back(form, "/admin/rollover"), error ? "error" : "msg", error ? error.message : `Done: ${data}.`));
}

/** Ends a semester's classes after its last day: its rooms are free from the next day on. */
export async function endSemester(form: FormData) {
  const sem = s(form, "semester");
  const last = s(form, "last_day");
  await run(
    form,
    "/admin/semester-end",
    "admin_end_semester",
    { p_semester: sem, p_last_day: last },
    `Semester ${sem} classes end after ${DATE_RE.test(last) ? formatDate(last) : last}. Their rooms are free from then on, and can be requested.`,
  );
}

/** Brings an ended semester's classes back into the timetable. */
export async function undoSemesterEnd(form: FormData) {
  const sem = s(form, "semester");
  await run(form, "/admin/semester-end", "admin_undo_semester_end", { p_semester: sem }, `Semester ${sem} classes are back in the timetable.`);
}

/** Switches a semester's timetable on or off: the classes of a semester that is off are not shown anywhere. */
export async function setSemesterActive(form: FormData) {
  const sem = s(form, "semester");
  const active = s(form, "active") === "true";
  await run(
    form,
    "/admin/semesters",
    "admin_set_semester_active",
    { p_semester: sem, p_active: active },
    active ? `Semester ${sem} is active: its classes show everywhere again.` : `Semester ${sem} is switched off: its classes are hidden and their rooms show as free.`,
  );
}

/** Remove a semester's or section's timetable PDF, and its file. */
export async function deleteTimetablePdf(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_timetable_pdf", { p_key: s(form, "key") });
  if (!error && data) await supabase.storage.from("timetables").remove([String(data)]);
  refreshPages();
  const to = back(form, "/admin/timetable-pdfs");
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : "Timetable PDF removed."));
}

/** After PDFs are uploaded from the browser: shows them to students at once instead of after the cache expires. */
export async function timetablePdfsUploaded() {
  if ((await getPerson())?.role === "admin") refreshPages();
}
