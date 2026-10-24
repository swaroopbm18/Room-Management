"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  await run(
    form,
    "/admin/allot",
    "admin_override",
    {
      p_room: s(form, "room"),
      p_date: s(form, "date"),
      p_slot: Number(s(form, "slot")),
      p_kind: s(form, "kind"),
      p_title: s(form, "title"),
      p_reason: s(form, "reason"),
    },
    "Room allotted.",
  );
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
  const lines = s(form, "csv").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let added = 0;
  const failed: string[] = [];
  for (const line of lines) {
    const cols = line.split(",").map((x) => x.trim());
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
    if (!email.includes("@")) continue;
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
  }
  revalidatePath("/", "layout");
  const to = back(form, "/admin/people");
  redirect(
    failed.length
      ? withParam(to, "error", `Imported ${added}. Could not import: ${failed.slice(0, 5).join("; ")}${failed.length > 5 ? "…" : ""}`)
      : withParam(to, "msg", `Imported ${added} people.`),
  );
}
