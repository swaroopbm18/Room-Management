"use server";

// Room requests: faculty withdraw, edit or drop; admins approve, reject, move or undo.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { back, withParam, UNDO_RPC, type UndoKind, undoToken, refreshPages, run, s, run25 } from "./shared";

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
  refreshPages();
  redirect(withParam(to, error ? "error" : "msg", error ? `Couldn't undo: ${error.message}` : "Undone."));
}

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
