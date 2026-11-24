"use server";

// Room details: add, edit, archive or delete a room.

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { back, withParam, s, run, refreshPages } from "./shared";

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
  refreshPages();
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
  refreshPages();
  redirect(withParam(back(form, "/admin/rooms"), error ? "error" : "msg", error ? error.message : `Room ${data} added.`));
}

/** Deletes a room that has no classes, requests or bookings on record. */
export async function deleteRoom(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_room", { p_room: s(form, "room") });
  revalidateTag("rooms");
  refreshPages();
  redirect(withParam(back(form, "/admin/rooms"), error ? "error" : "msg", error ? error.message : `Room ${s(form, "room")} deleted.`));
}

/** An archived room is hidden from the schedule and booking pages but keeps its history. */
export async function archiveRoom(form: FormData) {
  const archived = s(form, "archived") === "true";
  await run(
    form,
    "/admin/rooms",
    "admin_archive_room",
    { p_room: s(form, "room"), p_archived: archived },
    archived ? `${s(form, "room")} archived. It no longer shows on the schedule.` : `${s(form, "room")} is back on the schedule.`,
    undefined,
    { tag: "rooms" },
  );
}
