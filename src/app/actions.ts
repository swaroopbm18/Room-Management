"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getHolidays, getSlots } from "@/lib/data";
import { addDays, formatDate, todayIST } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import type { ParsedEntry } from "@/lib/timetableDocx";

function back(form: FormData, fallback: string) {
  const to = String(form.get("back") ?? fallback);
  return to.startsWith("/") && !to.startsWith("//") ? to : fallback;
}

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("msg");
  params.delete("error");
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

/** Runs an RPC and redirects back with a success or error message. */
async function run(form: FormData, fallback: string, fn: string, args: Record<string, unknown>, ok: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  const to = back(form, fallback);
  revalidatePath("/", "layout");
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : ok));
}

const s = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function withdrawRequest(form: FormData) {
  await run(form, "/faculty", "withdraw_request", { p_id: s(form, "id") }, "Request withdrawn.");
}

export async function dropClass(form: FormData) {
  await run(
    form,
    "/faculty",
    "drop_class",
    { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: Number(s(form, "slot")), p_reason: s(form, "reason") },
    "Class dropped. The room is now free for others to request.",
  );
}

export async function undoDrop(form: FormData) {
  await run(form, "/faculty", "undo_drop", { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: Number(s(form, "slot")) }, "Class brought back.");
}

export async function approveRequest(form: FormData) {
  await run(form, "/admin", "approve_request", { p_id: s(form, "id") }, "Request approved. Other requests for that slot were declined.");
}

export async function rejectRequest(form: FormData) {
  await run(form, "/admin", "reject_request", { p_id: s(form, "id"), p_note: s(form, "note") }, "Request rejected.");
}

export async function moveRequest(form: FormData) {
  await run(form, "/admin", "move_request", { p_id: s(form, "id"), p_dir: Number(s(form, "dir")) }, "Priority updated.");
}

export async function adminOverride(form: FormData) {
  // Every slot from the start slot to the end slot, in the day's order.
  const picked = await slotRange(form);
  await run(
    form,
    "/admin/allot",
    "admin_override_slots",
    {
      p_room: s(form, "room"),
      p_date: s(form, "date"),
      p_slots: picked,
      p_kind: s(form, "kind"),
      p_title: s(form, "title"),
      p_reason: s(form, "reason"),
    },
    picked.length === 1 ? "Room allotted." : `Room allotted for ${picked.length} slots.`,
  );
}

async function slotRange(form: FormData, fallback = "/admin/allot"): Promise<number[]> {
  const slots = await getSlots();
  const from = slots.findIndex((x) => String(x.id) === s(form, "from"));
  const to = slots.findIndex((x) => String(x.id) === s(form, "to"));
  if (from < 0 || to < from) {
    redirect(withParam(back(form, fallback), "error", "The end time must be after the start time."));
  }
  return slots.slice(from, to + 1).map((x) => x.id);
}

export async function adminFree(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_free_slots", {
    p_room: s(form, "room"),
    p_date: s(form, "date"),
    p_slots: await slotRange(form),
    p_reason: s(form, "reason"),
  });
  revalidatePath("/", "layout");
  const to = back(form, "/admin/allot");
  redirect(error ? withParam(to, "error", error.message) : withParam(to, "msg", data === 1 ? "Room freed for 1 slot." : `Room freed for ${data} slots.`));
}

export async function adminRenameBooking(form: FormData) {
  await run(
    form,
    "/admin/allot",
    "admin_rename_booking",
    { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: Number(s(form, "slot")), p_title: s(form, "title") },
    "Booking renamed.",
  );
}

export async function saveFaculty(form: FormData) {
  const old = s(form, "old_initials");
  await run(
    form,
    "/admin/people",
    "admin_save_faculty",
    { p_old_initials: old || null, p_initials: s(form, "initials"), p_title: s(form, "title"), p_full_name: s(form, "full_name") },
    old ? "Faculty member saved." : "Faculty member added.",
  );
}

/**
 * The faculty profile's name form: saves the name and initials in the faculty directory and, for
 * someone who signs in, on their sign-in record too, so the name is the same everywhere.
 */
export async function saveFacultyProfile(form: FormData) {
  const supabase = await createClient();
  const initials = s(form, "initials").toUpperCase();
  const to = `/admin/faculty?f=${encodeURIComponent(initials)}`;
  const saved = await supabase.rpc("admin_save_faculty", {
    p_old_initials: s(form, "old_initials") || null,
    p_initials: initials,
    p_title: s(form, "title"),
    p_full_name: s(form, "full_name"),
  });
  if (saved.error) redirect(withParam(back(form, "/admin/faculty"), "error", saved.error.message));
  if (s(form, "email")) {
    const { error } = await supabase.rpc("admin_upsert_person", {
      p_email: s(form, "email"),
      p_full_name: s(form, "full_name") || initials,
      p_initials: initials,
      p_title: s(form, "title"),
      p_role: s(form, "role") === "admin" ? "admin" : "faculty",
      p_active: s(form, "active") !== "false",
    });
    if (error) redirect(withParam(to, "error", error.message));
  }
  revalidatePath("/", "layout");
  redirect(withParam(to, "msg", "Profile saved."));
}

export async function removeFaculty(form: FormData) {
  await run(form, "/admin/people", "admin_remove_faculty", { p_initials: s(form, "initials") }, "Faculty member removed from the directory.");
}

export async function adminRestore(form: FormData) {
  await run(
    form,
    "/admin/allot",
    "admin_restore",
    { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: Number(s(form, "slot")), p_reason: s(form, "reason") },
    "Slot restored to the timetable.",
  );
}

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
  revalidatePath("/", "layout");
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
    const { data } = await supabase.rpc("get_timetable_all", { p_date: addDays(todayIST(), 1) });
    const clash = ((data ?? []) as { room_id: string; weekday: number; slot_id: number; subject: string }[]).find(
      (t) => t.room_id === room && t.weekday === weekday && slotIds.includes(t.slot_id),
    );
    if (clash) redirect(withParam(to, "error", `${room} already has ${clash.subject} then. Pick a free room.`));
  }
  const { data, error } = await edit(room, subject, s(form, "initials").split(/[,\s]+/).filter(Boolean));
  if (!error && oldRoom && room !== oldRoom) {
    const moved = await edit(oldRoom, "", []);
    if (moved.error) {
      revalidatePath("/", "layout");
      redirect(withParam(to, "error", `The class was added to ${room} but is still in ${oldRoom} too: ${moved.error.message}. Delete it from ${oldRoom}.`));
    }
  }
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
  const to = back(form, "/admin/class-timetable");
  redirect(
    error
      ? withParam(to, "error", error.message)
      : withParam(to, "msg", `${s(form, "old_subject")} removed. ${s(form, "old_room")} is free then from ${formatDate(String(data), { weekday: "long" })}.`),
  );
}

export async function upsertPerson(form: FormData) {
  await run(
    form,
    "/admin/people",
    "admin_upsert_person",
    {
      p_email: s(form, "email"),
      p_full_name: s(form, "full_name"),
      p_initials: s(form, "initials"),
      p_title: s(form, "title"),
      p_role: s(form, "role") === "admin" ? "admin" : "faculty",
      p_active: s(form, "active") !== "false",
    },
    "Saved.",
  );
}

/** Bulk import: one person per line, "email, full name, initials, title, role". */
export async function importPeople(form: FormData) {
  const supabase = await createClient();
  // Pasted rows and an uploaded .csv file are read the same way.
  const file = form.get("file");
  const uploaded = file instanceof File && file.size > 0 ? await file.text() : "";
  if (file instanceof File && file.size > 1024 * 1024) {
    redirect(withParam(back(form, "/admin/people"), "error", "The CSV file must be under 1 MB."));
  }
  const lines = `${s(form, "csv")}\n${uploaded}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let added = 0;
  const failed: string[] = [];
  const rows: { email: string; full_name: string; initials: string; title: string; role: string }[] = [];
  for (const line of lines) {
    const cols = line.split(",").map((x) => x.trim().replace(/^"(.*)"$/, "$1").trim());
    let email: string, full_name: string, initials: string, title: string, role: string;
    if (cols[0]?.includes("@")) {
      // email, full name, initials, title, role
      [email = "", full_name = "", initials = "", title = "", role = "faculty"] = cols;
    } else {
      // faculty-list.csv: "Dr. AKN", full name, email, role
      const m = (cols[0] ?? "").match(/^(Prof|Dr|Mr|Ms|Mrs)[.,]?\s*([A-Za-z]+)$/i);
      [, full_name = "", email = "", role = "faculty"] = cols;
      initials = m?.[2] ?? "";
      title = m ? `${m[1]}.` : "";
    }
    if (email.includes("@")) rows.push({ email, full_name, initials, title, role }); // header rows have no email
  }
  // Ten at a time, so a long list imports quickly.
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(
      rows.slice(i, i + 10).map(async ({ email, full_name, initials, title, role }) => {
        const { error } = await supabase.rpc("admin_upsert_person", {
          p_email: email,
          p_full_name: full_name || email.split("@")[0],
          p_initials: initials,
          p_title: title,
          p_role: role.toLowerCase().startsWith("admin") ? "admin" : "faculty",
          p_active: true,
        });
        if (error) failed.push(`${email} (${error.message})`);
        else added++;
      }),
    );
  }
  revalidatePath("/", "layout");
  const to = back(form, "/admin/people");
  redirect(
    failed.length
      ? withParam(to, "error", `Imported ${added}. Could not import: ${failed.slice(0, 5).join("; ")}${failed.length > 5 ? "…" : ""}`)
      : withParam(to, "msg", `Imported ${added} people.`),
  );
}

export async function addSubject(form: FormData) {
  await run(form, "/admin/subjects", "admin_add_subject", { p_email: s(form, "email"), p_subject: s(form, "subject") }, "Subject added.");
}

export async function removeSubject(form: FormData) {
  await run(form, "/admin/subjects", "admin_remove_subject", { p_email: s(form, "email"), p_subject: s(form, "subject") }, "Subject removed. Past requests keep it.");
}

export async function subjectsFromTimetable(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_subjects_from_timetable");
  revalidatePath("/", "layout");
  const to = back(form, "/admin/subjects");
  redirect(
    error
      ? withParam(to, "error", error.message)
      : withParam(to, "msg", data ? `${data} ${data === 1 ? "subject" : "subjects"} added from the timetable.` : "Everyone already has every subject the timetable gives them."),
  );
}

export async function addHoliday(form: FormData) {
  await run(form, "/admin/holidays", "admin_add_holiday", { p_date: s(form, "date"), p_name: s(form, "name") }, "Holiday added.");
}

export async function removeHoliday(form: FormData) {
  await run(form, "/admin/holidays", "admin_remove_holiday", { p_date: s(form, "date") }, "Holiday removed.");
}

export async function setDayOrder(form: FormData) {
  const follows = Number(s(form, "follows")) || null;
  await run(
    form,
    "/admin/holidays",
    "admin_set_day_order",
    { p_date: s(form, "date"), p_follows: follows, p_note: s(form, "note") },
    follows ? "Day swap saved." : "Day swap removed.",
  );
}

export async function addNotice(form: FormData) {
  await run(form, "/admin/holidays", "admin_add_notice", { p_message: s(form, "message"), p_starts: s(form, "starts"), p_ends: s(form, "ends") }, "Notice added.");
}

export async function removeNotice(form: FormData) {
  await run(form, "/admin/holidays", "admin_remove_notice", { p_id: Number(s(form, "id")) }, "Notice removed.");
}

export async function updateRoom(form: FormData) {
  const supabase = await createClient();
  const capacity = Number(s(form, "capacity"));
  const { error } = await supabase.rpc("admin_update_room", {
    p_room: s(form, "room"),
    p_capacity: capacity > 0 ? capacity : null,
    p_kind: s(form, "kind") || "classroom",
    p_projector: form.get("projector") === "on",
    p_notes: s(form, "notes"),
  });
  revalidateTag("rooms");
  revalidatePath("/", "layout");
  redirect(withParam(back(form, "/admin/rooms"), error ? "error" : "msg", error ? error.message : `Room ${s(form, "room")} saved.`));
}

/**
 * A CIE (or event) in the same slots of several rooms on several days, e.g. a CIE week.
 * Sundays and holidays are skipped; a day or room that can't be taken is reported, not fatal.
 */
export async function blockCieWeek(form: FormData) {
  const to = back(form, "/admin/cie");
  const rooms = form.getAll("rooms").map(String).filter(Boolean);
  const from = s(form, "from_date");
  const until = s(form, "to_date") || from;
  if (!rooms.length) redirect(withParam(to, "error", "Pick at least one room."));
  if (!from || until < from) redirect(withParam(to, "error", "The last day must be on or after the first day."));
  const [picked, holidays] = await Promise.all([slotRange(form, to), getHolidays()]);
  const days: string[] = [];
  for (let d = from; d <= until && days.length < 31; d = addDays(d, 1)) {
    if (new Date(d + "T00:00:00Z").getUTCDay() !== 0 && !holidays.has(d)) days.push(d);
  }
  if (!days.length) redirect(withParam(to, "error", "Those days are all Sundays or holidays."));
  const supabase = await createClient();
  const failed: string[] = [];
  let done = 0;
  for (const d of days) {
    for (const room of rooms) {
      const { error } = await supabase.rpc("admin_override_slots", {
        p_room: room,
        p_date: d,
        p_slots: picked,
        p_kind: s(form, "kind") === "event" ? "event" : "cie",
        p_title: s(form, "title"),
        p_reason: s(form, "reason"),
      });
      if (error) failed.push(`${room} on ${formatDate(d, { year: undefined })} (${error.message})`);
      else done++;
    }
  }
  revalidatePath("/", "layout");
  const ok = `Booked ${done} room-${done === 1 ? "day" : "days"} across ${days.length} ${days.length === 1 ? "day" : "days"}.`;
  redirect(withParam(to, failed.length ? "error" : "msg", failed.length ? `${done ? ok + " " : ""}Not booked: ${failed.slice(0, 6).join("; ")}${failed.length > 6 ? ` and ${failed.length - 6} more` : ""}.` : ok));
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
  const currentRes = await supabase.rpc("get_timetable_all", { p_date: addDays(todayIST(), 1) });
  if (currentRes.error) return { error: currentRes.error.message };
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
  revalidatePath("/", "layout");
  redirect(
    error
      ? withParam("/admin/timetable", "error", error.message)
      : withParam("/admin/timetable", "msg", `Timetable updated: ${data} ${data === 1 ? "cell" : "cells"} changed, from ${formatDate(addDays(todayIST(), 1), { weekday: "long" })}. Earlier days keep the old timetable.`),
  );
}

/** Add (or clear, with an empty duty) one faculty member's duty over a start-to-end range. */
export async function setFacultyDuty(form: FormData) {
  await run(
    form,
    "/admin/faculty",
    "admin_set_faculty_duty",
    { p_initials: s(form, "initials"), p_weekday: Number(s(form, "weekday")), p_slots: await slotRange(form), p_activity: s(form, "activity") },
    s(form, "activity") ? "Duty saved." : "Slots cleared.",
  );
}

const DAY_NUMBERS: Record<string, number> = { MON: 1, TUE: 2, WED: 3, THU: 4, THUR: 4, FRI: 5, SAT: 6 };

/**
 * Faculty duties from a CSV, one slot per line: "initials, day, start time, duty", e.g.
 * "AKN, Mon, 8:00, Proctoring". Everyone in the file has their duties replaced.
 */
export async function importFacultyDuties(form: FormData) {
  const to = back(form, "/admin/faculty");
  const file = form.get("file");
  if (file instanceof File && file.size > 1024 * 1024) redirect(withParam(to, "error", "The CSV file must be under 1 MB."));
  const uploaded = file instanceof File && file.size > 0 ? await file.text() : "";
  const slots = await getSlots();
  // "8:00", "2:00 PM" and "14:00" all name the 2 PM slot; afternoon slots are written without PM in the timetables
  const slotFor = (t: string) => {
    const m = t.toUpperCase().match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM)?$/);
    if (!m) return slots.find((x) => String(x.id) === t)?.id;
    let h = Number(m[1]) % 12;
    if (m[3] === "PM" || (!m[3] && h < 8)) h += 12;
    const hhmm = `${String(h).padStart(2, "0")}:${m[2]}`;
    return slots.find((x) => x.starts === hhmm)?.id;
  };
  const entries: { initials: string; weekday: number; slot_id: number; activity: string }[] = [];
  const bad: string[] = [];
  for (const line of `${s(form, "csv")}\n${uploaded}`.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [ini = "", day = "", time = "", ...rest] = line.split(",").map((x) => x.trim().replace(/^"(.*)"$/, "$1").trim());
    const weekday = DAY_NUMBERS[day.slice(0, 4).toUpperCase()] ?? DAY_NUMBERS[day.slice(0, 3).toUpperCase()];
    const slot_id = slotFor(time);
    const activity = rest.join(", ");
    if (/^initials$/i.test(ini)) continue; // header row
    if (!ini || !weekday || !slot_id || !activity) bad.push(line);
    else entries.push({ initials: ini.replace(/^(Prof|Dr)[.,]?\s*/i, "").toUpperCase(), weekday, slot_id, activity });
  }
  if (bad.length) redirect(withParam(to, "error", `Could not read ${bad.length} ${bad.length === 1 ? "line" : "lines"}: ${bad.slice(0, 3).join(" | ")}${bad.length > 3 ? "…" : ""}`));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_replace_faculty_duties", { p_initials: [...new Set(entries.map((e) => e.initials))], p_entries: entries });
  revalidatePath("/", "layout");
  redirect(error ? withParam(to, "error", error.message) : withParam(to, "msg", `Saved ${data} duty ${data === 1 ? "slot" : "slots"} for ${new Set(entries.map((e) => e.initials)).size} faculty.`));
}

/** Save the HoD cluster of every faculty member on the form (fields named "cluster:<initials>"). */
export async function setFacultyClusters(form: FormData) {
  const entries = [...form.entries()]
    .filter(([k]) => k.startsWith("cluster:"))
    .map(([k, v]) => ({ initials: k.slice("cluster:".length), cluster: String(v) }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_faculty_clusters", { p_entries: entries });
  revalidatePath("/", "layout");
  const to = back(form, "/admin/faculty");
  redirect(error ? withParam(to, "error", error.message) : withParam(to, "msg", data ? `Clusters saved: ${data} ${data === 1 ? "change" : "changes"}.` : "No cluster changed."));
}
