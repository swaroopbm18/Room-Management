"use server";

// Class exchanges between faculty: request, answer, approve and undo.

import { redirect } from "next/navigation";
import { back, withParam, run, s } from "./shared";

/** Ask a free colleague to take one of my classes. They accept, then an admin approves. */
export async function requestExchange(form: FormData) {
  const target = s(form, "target");
  if (!target) redirect(withParam(back(form, "/faculty"), "error", "Pick who should take the class."));
  const [ini, name, teaches] = target.split("|");
  // Back-to-back slots of one class (a lab, say) go as one request
  const slots = (s(form, "slots") || s(form, "slot")).split(",").map(Number).filter((n) => n > 0);
  const common = { p_room: s(form, "room"), p_date: s(form, "date"), p_target: ini, p_note: s(form, "note"), p_new_subject: teaches || null };
  const sent = `Request sent to ${name || ini}${slots.length > 1 ? ` for all ${slots.length} slots` : ""}. Once they accept, an admin gives the final approval; you'll see each step here.`;
  if (slots.length > 1) await run(form, "/faculty?tab=requests", "request_exchange_slots", { ...common, p_slots: slots }, sent, undefined, { okTo: "/faculty?tab=requests" });
  else await run(form, "/faculty?tab=requests", "request_exchange", { ...common, p_slot: slots[0] }, sent, undefined, { okTo: "/faculty?tab=requests" });
}

export async function acceptExchange(form: FormData) {
  await run(form, "/faculty?tab=exchange", "respond_exchange", { p_id: Number(s(form, "id")), p_accept: true, p_note: s(form, "note") }, "Accepted. It now waits for an admin's final approval.");
}

export async function declineExchange(form: FormData) {
  await run(form, "/faculty?tab=exchange", "respond_exchange", { p_id: Number(s(form, "id")), p_accept: false, p_note: s(form, "note") }, "Declined. The faculty member can ask someone else.");
}

export async function withdrawExchange(form: FormData) {
  await run(form, "/faculty?tab=requests", "withdraw_exchange", { p_id: Number(s(form, "id")) }, "Exchange request withdrawn.");
}

export async function approveExchange(form: FormData) {
  await run(form, "/admin/exchanges", "admin_decide_exchange", { p_id: Number(s(form, "id")), p_approve: true, p_note: s(form, "note") }, "Approved. The class now shows as the new faculty member's everywhere.");
}

export async function rejectExchange(form: FormData) {
  await run(form, "/admin/exchanges", "admin_decide_exchange", { p_id: Number(s(form, "id")), p_approve: false, p_note: s(form, "note") }, "Exchange denied. The original classes stay as they are.");
}

/** Take back an approved exchange before the class starts: the original faculty gets every slot back. */
export async function undoExchange(form: FormData) {
  await run(form, "/admin/exchanges", "admin_undo_exchange", { p_id: Number(s(form, "id")), p_note: s(form, "note") }, "Approval taken back. The original classes are back on the timetable.");
}
