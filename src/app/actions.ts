"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSlots } from "@/lib/data";
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

async function slotRange(form: FormData): Promise<number[]> {
  const slots = await getSlots();
  const from = slots.findIndex((x) => String(x.id) === s(form, "from"));
  const to = slots.findIndex((x) => String(x.id) === s(form, "to"));
  if (from < 0 || to < from) {
    redirect(withParam(back(form, "/admin/allot"), "error", "The end time must be after the start time."));
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

export async function addHoliday(form: FormData) {
  await run(form, "/admin/timetable", "admin_add_holiday", { p_date: s(form, "date"), p_name: s(form, "name") }, "Holiday added.");
}

export async function removeHoliday(form: FormData) {
  await run(form, "/admin/timetable", "admin_remove_holiday", { p_date: s(form, "date") }, "Holiday removed.");
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
