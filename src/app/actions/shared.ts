// Helpers shared by the server actions: where to go back to, the message and Undo on the
// page, and running one database function with a success or error message.

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getSlots } from "@/lib/data";
import { formatDate } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { fixFor } from "@/lib/fixLinks";
import type { Slot } from "@/lib/types";

export function back(form: FormData, fallback: string) {
  const to = String(form.get("back") ?? fallback);
  return to.startsWith("/") && !to.startsWith("//") ? to : fallback;
}

export function withParam(path: string, key: string, value: string, undo?: string) {
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
export const UNDO_RPC = {
  holiday: "admin_add_holiday",
  notice: "admin_add_notice",
  swap: "admin_set_day_order",
  leave: "admin_add_leave",
  subject: "admin_add_subject",
  duty: "admin_set_faculty_duty",
  drop: "undo_drop",
  decision: "admin_undo_decision",
} as const;
export type UndoKind = keyof typeof UNDO_RPC;

export function undoToken(kind: UndoKind, args: Record<string, unknown>) {
  return Buffer.from(JSON.stringify({ k: kind, a: args })).toString("base64url");
}

/** Re-renders every page and clears the cached holidays, day swaps (lib/data.ts) faculty names (lib/facultyNames.ts) and what students see (lib/data.ts) after a change. */
export function refreshPages() {
  revalidateTag("calendar");
  revalidateTag("faculty-names");
  revalidateTag("public-data");
  revalidatePath("/", "layout");
}

/**
 * Runs an RPC, refreshes every page and redirects back with a success or error message. The
 * message can be read from the RPC's result; an Undo, a cache tag to clear and a different
 * page to land on after success are optional.
 */
export async function run(
  form: FormData,
  fallback: string,
  fn: string,
  args: Record<string, unknown>,
  ok: string | ((data: unknown) => string),
  undo?: string,
  opts: { tag?: string; okTo?: string } = {},
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (opts.tag) revalidateTag(opts.tag);
  refreshPages();
  const to = !error && opts.okTo ? opts.okTo : back(form, fallback);
  redirect(withParam(to, error ? "error" : "msg", error ? error.message : typeof ok === "function" ? ok(data) : ok, error ? undefined : undo));
}

export const s = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function slotRange(form: FormData, fallback = "/admin/allot"): Promise<number[]> {
  const slots = await getSlots();
  const from = slots.findIndex((x) => String(x.id) === s(form, "from"));
  const to = slots.findIndex((x) => String(x.id) === s(form, "to"));
  if (from < 0 || to < from) {
    redirect(withParam(back(form, fallback), "error", "The end time must be after the start time."));
  }
  return slots.slice(from, to + 1).map((x) => x.id);
}

export function lines(rows: { date: string; room: string; slots: number[]; subject: string; section?: string }[], slots: Slot[], many: boolean) {
  const label = (ids: number[]) => {
    const a = slots.find((x) => x.id === ids[0]);
    const b = slots.find((x) => x.id === ids[ids.length - 1]);
    return a && b ? `${a.label.split(" – ")[0]} – ${b.label.split(" – ")[1]}` : "";
  };
  return rows.map((r) => `${many ? `${formatDate(r.date, { year: undefined })}, ` : ""}${r.section ? `${r.section}: ` : ""}${r.subject} in ${r.room}, ${label(r.slots)}`);
}
