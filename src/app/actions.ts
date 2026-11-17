"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getHolidays, getSlots } from "@/lib/data";
import { addDays, DATE_RE, formatDate, isClosedSunday, todayIST, weekdayOf } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { fixFor } from "@/lib/fixLinks";
import type { ParsedEntry } from "@/lib/timetableDocx";
import { mergeRuns } from "@/lib/bookings";
import type { AllotmentRow } from "@/lib/types";

function back(form: FormData, fallback: string) {
  const to = String(form.get("back") ?? fallback);
  return to.startsWith("/") && !to.startsWith("//") ? to : fallback;
}

function withParam(path: string, key: string, value: string, undo?: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("msg");
  params.delete("error");
  params.delete("undo");
  params.delete("fix");
  params.delete("fixlabel");
  params.set(key, value);
  if (undo && key === "msg") params.set("undo", undo);
  // An error that names something to fix links to where it can be fixed
  const fix = key === "error" ? fixFor(value) : undefined;
  if (fix) {
    params.set("fix", fix.href);
    params.set("fixlabel", fix.label);
  }
  return `${base}?${params.toString()}`;
}

/**
 * What the Undo button on a message puts back. Each kind is one RPC with its arguments, so an
 * undo can only do what the person could already do from the page (the RPC checks again).
 */
const UNDO_RPC = {
  holiday: "admin_add_holiday",
  notice: "admin_add_notice",
  swap: "admin_set_day_order",
  leave: "admin_add_leave",
  subject: "admin_add_subject",
  duty: "admin_set_faculty_duty",
  drop: "undo_drop",
  decision: "admin_undo_decision",
} as const;
type UndoKind = keyof typeof UNDO_RPC;

function undoToken(kind: UndoKind, args: Record<string, unknown>) {
  return Buffer.from(JSON.stringify({ k: kind, a: args })).toString("base64url");
}

/** Runs an RPC and redirects back with a success or error message (and an Undo, when given). */
async function run(form: FormData, fallback: string, fn: string, args: Record<string, unknown>, ok: string, undo?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  const to = back(form, fallback);
  revalidatePath("/", "layout");
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : ok, undo));
}

/** The Undo button on a message: puts back what was just removed. */
export async function undoLast(form: FormData) {
  const to = back(form, "/");
  let kind: UndoKind | undefined;
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(Buffer.from(s(form, "token"), "base64url").toString()) as { k: string; a: Record<string, unknown> };
    if (parsed.k in UNDO_RPC && parsed.a && typeof parsed.a === "object") {
      kind = parsed.k as UndoKind;
      args = parsed.a;
    }
  } catch {
    // fall through to the error below
  }
  if (!kind) redirect(withParam(to, "error", "That can no longer be undone."));
  const supabase = await createClient();
  const { error } = await supabase.rpc(UNDO_RPC[kind], args);
  revalidatePath("/", "layout");
  redirect(withParam(to, error ? "error" : "msg", error ? `Couldn't undo: ${error.message}` : "Undone."));
}

const s = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function withdrawRequest(form: FormData) {
  await run(form, "/faculty", "withdraw_request", { p_id: s(form, "id") }, "Request withdrawn.");
}

export async function dropClass(form: FormData) {
  // A back-to-back class (a lab, say) is dropped in every slot at once
  const many = s(form, "slots").split(",").map(Number).filter((n) => n > 0);
  if (many.length > 1) {
    const supabase = await createClient();
    let error: { message: string } | null = null;
    for (const p_slot of many) {
      ({ error } = await supabase.rpc("drop_class", { p_room: s(form, "room"), p_date: s(form, "date"), p_slot, p_reason: s(form, "reason") }));
      if (error) break;
    }
    revalidatePath("/", "layout");
    redirect(withParam(back(form, "/faculty"), error ? "error" : "msg", error ? error.message : `Class dropped in all ${many.length} slots. The room is now free for others to request.`));
  }
  const slot = { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: Number(s(form, "slot") || many[0]) };
  await run(form, "/faculty", "drop_class", { ...slot, p_reason: s(form, "reason") }, "Class dropped. The room is now free for others to request.", undoToken("drop", slot));
}

export async function undoDrop(form: FormData) {
  await run(form, "/faculty", "undo_drop", { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: Number(s(form, "slot")) }, "Class brought back.");
}

export async function approveRequest(form: FormData) {
  await run(form, "/admin", "approve_request", { p_id: s(form, "id") }, "Request approved. Other requests for that slot were declined.", undoToken("decision", { p_id: s(form, "id") }));
}

export async function rejectRequest(form: FormData) {
  await run(form, "/admin", "reject_request", { p_id: s(form, "id"), p_note: s(form, "note") }, "Request rejected.", undoToken("decision", { p_id: s(form, "id") }));
}

export async function moveRequest(form: FormData) {
  await run(form, "/admin", "move_request", { p_id: s(form, "id"), p_dir: Number(s(form, "dir")) }, "Priority updated.");
}

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
  if (!places) return [];
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
    // A class names its faculty (initials) or none; an event may name a faculty member in charge
    p_faculty: kind === "class_request" || kind === "event" ? s(form, "faculty") || null : null,
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
  revalidatePath("/", "layout");
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

/** Changes a booking's name and description, across all of its back-to-back slots. */
export async function adminEditBooking(form: FormData) {
  const args = { p_room: s(form, "room"), p_date: s(form, "date"), p_slot: Number(s(form, "slot")), p_title: s(form, "title") };
  const supabase = await createClient();
  const reason = s(form, "reason");
  const changed = reason !== s(form, "old_reason");
  const { error } = changed
    ? await supabase.rpc("admin_edit_booking", { ...args, p_reason: reason })
    : await supabase.rpc("admin_rename_booking", args);
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
  const to = back(form, "/admin/allot");
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : slots.length === 1 ? "Slot restored to the timetable." : `${slots.length} slots restored to the timetable.`));
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

/**
 * Deletes a faculty member everywhere: name, cluster, duties, subjects and sign-in. Someone who
 * still teaches in the timetable can't be deleted; someone with past requests keeps a row with
 * no access, so the history still names them.
 */
export async function deleteFaculty(form: FormData) {
  const supabase = await createClient();
  const initials = (s(form, "delete_initials") || s(form, "initials")).toUpperCase();
  const { data, error } = await supabase.rpc("admin_delete_faculty", { p_initials: initials });
  revalidatePath("/", "layout");
  if (error) {
    redirect(withParam(back(form, "/admin/faculty"), "error", error.message));
  }
  const kept = data === "kept_history" ? " Their past requests are kept, but they can no longer sign in." : "";
  redirect(withParam(s(form, "done") || "/admin/faculty", "msg", `${initials} deleted.${kept}`));
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
  const args = { p_email: s(form, "email"), p_subject: s(form, "subject") };
  await run(form, "/admin/subjects", "admin_remove_subject", args, `${args.p_subject} removed. Past requests keep it.`, undoToken("subject", args));
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
  await run(form, "/admin/holidays", "admin_remove_holiday", { p_date: s(form, "date") }, "Holiday removed.", s(form, "name") ? undoToken("holiday", { p_date: s(form, "date"), p_name: s(form, "name") }) : undefined);
}

export async function setDayOrder(form: FormData) {
  const follows = Number(s(form, "follows")) || null;
  const was = Number(s(form, "old_follows")) || null;
  await run(
    form,
    "/admin/holidays",
    "admin_set_day_order",
    { p_date: s(form, "date"), p_follows: follows, p_note: s(form, "note") },
    follows ? "Day swap saved." : "Day swap removed.",
    !follows && was ? undoToken("swap", { p_date: s(form, "date"), p_follows: was, p_note: s(form, "old_note") }) : undefined,
  );
}

/**
 * Make up for a holiday on another day, usually a Sunday: that day runs the timetable the holiday
 * would have had (its own weekday, or the weekday it was swapped to).
 */
export async function makeUpHoliday(form: FormData) {
  const to = back(form, "/admin/holidays");
  const holiday = s(form, "holiday");
  const date = s(form, "date");
  if (!DATE_RE.test(holiday) || !DATE_RE.test(date)) redirect(withParam(to, "error", "Pick the holiday and the make-up day."));
  const supabase = await createClient();
  const [{ data: h }, { data: o }] = await Promise.all([
    supabase.from("holidays").select("name").eq("date", holiday).maybeSingle(),
    supabase.from("day_orders").select("follows").eq("date", holiday).maybeSingle(),
  ]);
  if (!h) redirect(withParam(to, "error", "That holiday was removed."));
  const follows = (o as { follows: number } | null)?.follows ?? weekdayOf(holiday);
  if (follows > 6) redirect(withParam(to, "error", "That holiday is on a Sunday, so there are no classes to make up."));
  const note = `Make-up for ${(h as { name: string }).name} (${formatDate(holiday, { year: undefined })})`;
  await run(form, "/admin/holidays", "admin_set_day_order", { p_date: date, p_follows: follows, p_note: note }, `Make-up day saved. ${formatDate(date, { weekday: "long", year: undefined })} runs the classes of ${formatDate(holiday, { weekday: "long", year: undefined })}.`);
}

export async function addNotice(form: FormData) {
  await run(form, "/admin/holidays", "admin_add_notice", { p_message: s(form, "message"), p_starts: s(form, "starts"), p_ends: s(form, "ends") }, "Notice added.");
}

export async function removeNotice(form: FormData) {
  const undo = s(form, "message") ? undoToken("notice", { p_message: s(form, "message"), p_starts: s(form, "starts"), p_ends: s(form, "ends") }) : undefined;
  await run(form, "/admin/holidays", "admin_remove_notice", { p_id: Number(s(form, "id")) }, "Notice removed.", undo);
}

export async function updateRoom(form: FormData) {
  const supabase = await createClient();
  const name = s(form, "name");
  if (name && name !== s(form, "old_name")) {
    const { error } = await supabase.rpc("admin_rename_room", { p_room: s(form, "room"), p_name: name });
    if (error) redirect(withParam(back(form, "/admin/rooms"), "error", error.message));
  }
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

/** An extra room, with its details; it shows everywhere rooms are listed. */
export async function addRoom(form: FormData) {
  const supabase = await createClient();
  const capacity = Number(s(form, "capacity"));
  const { data, error } = await supabase.rpc("admin_add_room", {
    p_room: s(form, "room"),
    p_capacity: capacity > 0 ? capacity : null,
    p_kind: s(form, "kind") || "classroom",
    p_projector: form.get("projector") === "on",
    p_notes: s(form, "notes"),
  });
  revalidateTag("rooms");
  revalidatePath("/", "layout");
  redirect(withParam(back(form, "/admin/rooms"), error ? "error" : "msg", error ? error.message : `Room ${data} added.`));
}

/** Deletes a room that has no classes, requests or bookings on record. */
export async function deleteRoom(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_room", { p_room: s(form, "room") });
  revalidateTag("rooms");
  revalidatePath("/", "layout");
  redirect(withParam(back(form, "/admin/rooms"), error ? "error" : "msg", error ? error.message : `Room ${s(form, "room")} deleted.`));
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
  const semesters = form.getAll("semesters").map(String).filter((x) => /^\d$/.test(x));
  const cancel = semesters.length > 0 && s(form, "cancel_classes") === "on";
  if (!rooms.length && !cancel) redirect(withParam(to, "error", "Pick at least one room, or a semester whose classes to cancel."));
  if (!from || until < from) redirect(withParam(to, "error", "The last day must be on or after the first day."));
  const [picked, holidays] = await Promise.all([slotRange(form, to), getHolidays()]);
  const days: string[] = [];
  for (let d = from; d <= until && days.length < 31; d = addDays(d, 1)) {
    if (!isClosedSunday(d) && !holidays.has(d)) days.push(d);
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
  // Cancel every class of the semesters writing the CIE, on each of those days
  let cancelled = 0;
  if (cancel) {
    const label = `${s(form, "title") || (s(form, "kind") === "event" ? "College event" : "CIE")}, semester ${semesters.join(", ")}`;
    for (const d of days) {
      const { data, error } = await supabase.rpc("admin_cancel_semester_classes", { p_date: d, p_semesters: semesters, p_reason: label });
      if (error) {
        failed.push(`classes on ${formatDate(d, { year: undefined })} (${error.message})`);
      } else cancelled += Number(data ?? 0);
    }
  }
  revalidatePath("/", "layout");
  const ok = (
    (rooms.length ? `Booked ${done} room-${done === 1 ? "day" : "days"} across ${days.length} ${days.length === 1 ? "day" : "days"}.` : "") +
    (cancel ? ` Cancelled ${cancelled} class ${cancelled === 1 ? "slot" : "slots"} of semester ${semesters.join(", ")}.` : "")
  ).trim();
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
    // Clearing one duty from the week table can be undone
    !s(form, "activity") && s(form, "old_activity")
      ? undoToken("duty", { p_initials: s(form, "initials"), p_weekday: Number(s(form, "weekday")), p_slots: [Number(s(form, "from"))], p_activity: s(form, "old_activity") })
      : undefined,
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

/** A faculty member on leave from one date to another (one day when "to" is empty). */
export async function addLeave(form: FormData) {
  const supabase = await createClient();
  const from = s(form, "from");
  const to = s(form, "to") || from;
  const { error } = await supabase.rpc("admin_add_leave", { p_initials: s(form, "initials"), p_from: from || null, p_to: to || null, p_reason: s(form, "reason") });
  revalidatePath("/", "layout");
  const days = from === to ? formatDate(from, { weekday: "long" }) : `${formatDate(from)} to ${formatDate(to)}`;
  redirect(withParam(back(form, "/admin/leave"), error ? "error" : "msg", error ? error.message : `${s(form, "initials").toUpperCase()} is on leave ${days}.`));
}

export async function removeLeave(form: FormData) {
  const undo = s(form, "initials") ? undoToken("leave", { p_initials: s(form, "initials"), p_from: s(form, "from"), p_to: s(form, "to"), p_reason: s(form, "reason") }) : undefined;
  await run(form, "/admin/leave", "admin_remove_leave", { p_id: Number(s(form, "id")) }, "Leave removed.", undo);
}

/** Add equipment, or rename or retire it (retiring cancels its future bookings). */
export async function saveEquipment(form: FormData) {
  const supabase = await createClient();
  const id = Number(s(form, "id")) || null;
  const { error } = await supabase.rpc("admin_save_equipment", { p_id: id, p_name: s(form, "name"), p_notes: s(form, "notes"), p_active: s(form, "active") !== "false" });
  revalidatePath("/equipment");
  redirect(withParam(back(form, "/equipment"), error ? "error" : "msg", error ? error.message : id ? "Equipment saved." : `${s(form, "name")} added.`));
}

/** Book an item for a run of slots on one day. */
export async function bookEquipment(form: FormData) {
  const supabase = await createClient();
  const to = back(form, "/equipment");
  const slots = await slotRange(form, to);
  const { error } = await supabase.rpc("book_equipment", {
    p_equipment: Number(s(form, "equipment")),
    p_date: s(form, "date"),
    p_slots: slots,
    p_room: s(form, "room"),
    p_purpose: s(form, "purpose"),
  });
  revalidatePath("/equipment");
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : `Booked for ${slots.length} slot${slots.length === 1 ? "" : "s"} on ${formatDate(s(form, "date"), { year: undefined })}.`));
}

export async function cancelEquipment(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_equipment", { p_id: Number(s(form, "id")) });
  revalidatePath("/equipment");
  redirect(withParam(back(form, "/equipment"), error ? "error" : "msg", error ? error.message : "Booking cancelled."));
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
  revalidatePath("/", "layout");
  redirect(withParam(back(form, "/admin/rollover"), error ? "error" : "msg", error ? error.message : `Done: ${data}.`));
}

export async function copyHolidays(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_copy_holidays", { p_from: s(form, "from_date"), p_to: s(form, "to_date"), p_years: Number(s(form, "years")) || 1 });
  revalidatePath("/", "layout");
  redirect(withParam(back(form, "/admin/rollover"), error ? "error" : "msg", error ? error.message : `${data} holiday${data === 1 ? "" : "s"} copied. Check festivals whose date moves each year.`));
}

// ---------------------------------------------------------------------------
// Edit and delete everywhere
// ---------------------------------------------------------------------------

/** Like run(), but can pick the message from the RPC's result. */
async function run25(form: FormData, fallback: string, fn: string, args: Record<string, unknown>, ok: string | ((data: unknown) => string), tag?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (tag) revalidateTag(tag);
  revalidatePath("/", "layout");
  const to = back(form, fallback);
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : typeof ok === "function" ? ok(data) : ok));
}

export async function updateHoliday(form: FormData) {
  await run25(form, "/admin/holidays", "admin_update_holiday", { p_date: s(form, "date"), p_new_date: s(form, "new_date") || s(form, "date"), p_name: s(form, "name") }, "Holiday updated.");
}

export async function updateNotice(form: FormData) {
  await run25(form, "/admin/holidays", "admin_update_notice", { p_id: Number(s(form, "id")), p_message: s(form, "message"), p_starts: s(form, "starts"), p_ends: s(form, "ends") }, "Notice updated.");
}

export async function updateLeave(form: FormData) {
  const from = s(form, "from");
  await run25(form, "/admin/leave", "admin_update_leave", { p_id: Number(s(form, "id")), p_from: from || null, p_to: s(form, "to") || from || null, p_reason: s(form, "reason") }, "Leave updated.");
}

/** A faculty member changes the description or subject of their own pending request. */
export async function editRequest(form: FormData) {
  await run25(form, "/faculty", "edit_request", { p_id: s(form, "id"), p_description: s(form, "description"), p_subject: s(form, "subject") }, "Request updated.");
}

/** Puts an approved or rejected request back in the queue. */
export async function undoDecision(form: FormData) {
  await run25(form, "/admin", "admin_undo_decision", { p_id: s(form, "id") }, (was) =>
    was === "approved" ? "Approval undone. The room is free again and the request is back in the queue." : "Rejection undone. The request is back in the queue.",
  );
}

/** Approve or reject every ticked request in one go; each one that can't be done is reported. */
export async function bulkDecide(form: FormData) {
  const ids = [...new Set(form.getAll("ids").map(String).filter(Boolean))];
  const approve = s(form, "decision") === "approve";
  const to = back(form, "/admin");
  if (!ids.length) redirect(withParam(to, "error", "Tick at least one request first."));
  const supabase = await createClient();
  let done = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const { error } = approve
      ? await supabase.rpc("approve_request", { p_id: id })
      : await supabase.rpc("reject_request", { p_id: id, p_note: s(form, "note") || null });
    if (error) failed.push(error.message);
    else done++;
  }
  revalidatePath("/", "layout");
  const verb = approve ? "approved" : "rejected";
  const msg = `${done} ${done === 1 ? "request" : "requests"} ${verb}.`;
  redirect(failed.length ? withParam(to, "error", `${msg} ${failed.length} could not be ${verb}: ${[...new Set(failed)].join("; ")}`) : withParam(to, "msg", msg));
}

export async function editEquipmentBooking(form: FormData) {
  await run25(form, "/equipment", "edit_equipment_booking", { p_id: Number(s(form, "id")), p_room: s(form, "room"), p_purpose: s(form, "purpose") }, "Booking updated.");
}

export async function deleteEquipment(form: FormData) {
  await run25(form, "/equipment", "admin_delete_equipment", { p_id: Number(s(form, "id")) }, `${s(form, "name") || "Equipment"} deleted.`);
}

/** Removes someone from the sign-in list; anyone with requests on record keeps a row without access. */
export async function deletePerson(form: FormData) {
  await run25(form, "/admin/people", "admin_delete_person", { p_email: s(form, "email") }, (r) =>
    r === "kept_history" ? `${s(form, "email")} can no longer sign in. Their past requests still show their name.` : `${s(form, "email")} deleted.`,
  );
}

/** An archived room is hidden from the schedule and booking pages but keeps its history. */
export async function archiveRoom(form: FormData) {
  const archived = s(form, "archived") === "true";
  await run25(
    form,
    "/admin/rooms",
    "admin_archive_room",
    { p_room: s(form, "room"), p_archived: archived },
    archived ? `${s(form, "room")} archived. It no longer shows on the schedule.` : `${s(form, "room")} is back on the schedule.`,
    "rooms",
  );
}

export async function renameSubject(form: FormData) {
  await run25(form, "/admin/subjects", "admin_rename_subject", { p_email: s(form, "email"), p_old: s(form, "old"), p_new: s(form, "subject") }, "Subject renamed. Past requests keep the old name.");
}

/** Clears every duty of one faculty member. */
export async function clearFacultyDuties(form: FormData) {
  const initials = s(form, "initials").toUpperCase();
  await run(form, "/admin/faculty", "admin_replace_faculty_duties", { p_initials: [initials], p_entries: [] }, `All of ${initials}'s duties cleared.`);
}

// ---------------------------------------------------------------------------
// Calendar sync, substitutes and resource requests
// ---------------------------------------------------------------------------

/** A new calendar link for the signed-in faculty member; the old one stops working. */
export async function resetCalendarLink(form: FormData) {
  await run(form, "/faculty", "reset_calendar_token", {}, "New calendar link made. The old link no longer works, so add the new one to your calendar.");
}

/**
 * Give a class whose faculty member is on leave to a substitute: the room is allotted for that
 * class with the substitute named, so it shows as theirs on every page and in their calendar.
 */
export async function assignSubstitute(form: FormData) {
  const sub = s(form, "sub").toUpperCase();
  const name = s(form, "sub_name") || sub;
  const absent = s(form, "absent").toUpperCase();
  const absentName = s(form, "absent_name") || absent;
  await run(
    form,
    "/admin/leave",
    "admin_override",
    {
      p_room: s(form, "room"),
      p_date: s(form, "date"),
      p_slot: Number(s(form, "slot")),
      p_kind: "class_request",
      p_title: s(form, "subject") || "Class",
      p_reason: `Substitute for ${absentName} (${absent}), on leave`,
      p_faculty: sub,
    },
    `${name} will take ${s(form, "subject") || "the class"} on ${formatDate(s(form, "date"), { year: undefined })}.`,
  );
}

export async function requestResource(form: FormData) {
  const supply = Number(s(form, "supply")) || null;
  await run(
    form,
    "/equipment",
    "request_resource",
    { p_supply: supply, p_item: s(form, "item"), p_qty: Number(s(form, "qty")) || 1, p_date: s(form, "date"), p_room: s(form, "room"), p_purpose: s(form, "purpose") },
    "Request sent. An admin will approve or decline it, and you'll see the answer here.",
  );
}

export async function cancelResourceRequest(form: FormData) {
  await run(form, "/equipment", "cancel_resource_request", { p_id: Number(s(form, "id")) }, "Request withdrawn.");
}

async function decideResource(form: FormData, approve: boolean) {
  await run(form, "/admin/resources", "admin_decide_resource", { p_id: Number(s(form, "id")), p_approve: approve, p_note: s(form, "note") }, approve ? "Approved." : "Declined.");
}

export async function approveResource(form: FormData) {
  await decideResource(form, true);
}

export async function declineResource(form: FormData) {
  await decideResource(form, false);
}

export async function saveSupply(form: FormData) {
  const id = Number(s(form, "id")) || null;
  await run(
    form,
    "/admin/resources",
    "admin_save_supply",
    { p_id: id, p_name: s(form, "name"), p_unit: s(form, "unit"), p_stock: Number(s(form, "stock")), p_active: s(form, "active") !== "off" },
    id ? "Item saved." : "Item added.",
  );
}

// ---------------------------------------------------------------------------
// Class exchange
// ---------------------------------------------------------------------------

async function run29(form: FormData, fallback: string, fn: string, args: Record<string, unknown>, ok: string, okTo?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  const to = !error && okTo ? okTo : back(form, fallback);
  revalidatePath("/", "layout");
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : ok));
}

/** Ask a free colleague to take one of my classes. They accept, then an admin approves. */
export async function requestExchange(form: FormData) {
  const target = s(form, "target");
  if (!target) redirect(withParam(back(form, "/faculty"), "error", "Pick who should take the class."));
  const [ini, name, teaches] = target.split("|");
  // Back-to-back slots of one class (a lab, say) go as one request
  const slots = (s(form, "slots") || s(form, "slot")).split(",").map(Number).filter((n) => n > 0);
  const common = { p_room: s(form, "room"), p_date: s(form, "date"), p_target: ini, p_note: s(form, "note"), p_new_subject: teaches || null };
  const sent = `Request sent to ${name || ini}${slots.length > 1 ? ` for all ${slots.length} slots` : ""}. Once they accept, an admin gives the final approval; you'll see each step here.`;
  if (slots.length > 1) await run29(form, "/faculty?tab=requests", "request_exchange_slots", { ...common, p_slots: slots }, sent, "/faculty?tab=requests");
  else await run29(form, "/faculty?tab=requests", "request_exchange", { ...common, p_slot: slots[0] }, sent, "/faculty?tab=requests");
}

export async function acceptExchange(form: FormData) {
  await run29(form, "/faculty?tab=exchange", "respond_exchange", { p_id: Number(s(form, "id")), p_accept: true, p_note: s(form, "note") }, "Accepted. It now waits for an admin's final approval.");
}

export async function declineExchange(form: FormData) {
  await run29(form, "/faculty?tab=exchange", "respond_exchange", { p_id: Number(s(form, "id")), p_accept: false, p_note: s(form, "note") }, "Declined. The faculty member can ask someone else.");
}

export async function withdrawExchange(form: FormData) {
  await run29(form, "/faculty?tab=requests", "withdraw_exchange", { p_id: Number(s(form, "id")) }, "Exchange request withdrawn.");
}

export async function approveExchange(form: FormData) {
  await run29(form, "/admin/exchanges", "admin_decide_exchange", { p_id: Number(s(form, "id")), p_approve: true, p_note: s(form, "note") }, "Approved. The class now shows as the new faculty member's everywhere.");
}

export async function rejectExchange(form: FormData) {
  await run29(form, "/admin/exchanges", "admin_decide_exchange", { p_id: Number(s(form, "id")), p_approve: false, p_note: s(form, "note") }, "Exchange denied. The original classes stay as they are.");
}

/** Take back an approved exchange before the class starts: the original faculty gets every slot back. */
export async function undoExchange(form: FormData) {
  await run29(form, "/admin/exchanges", "admin_undo_exchange", { p_id: Number(s(form, "id")), p_note: s(form, "note") }, "Approval taken back. The original classes are back on the timetable.");
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
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
  const to = back(form, "/admin/report");
  if (error) {
    const missing = error.code === "PGRST202" || /admin_edit_record/.test(error.message);
    redirect(withParam(to, "error", missing ? "Editing records needs database update 0033. Run it in the Supabase SQL Editor." : error.message));
  }
  redirect(withParam(to, "msg", data === 1 ? "Record updated." : `Record updated for ${data} slots.`));
}
