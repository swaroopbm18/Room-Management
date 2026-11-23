"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clashes, DayState, fromText, makeSectionsOf, planBulk, rowKey, shortDay, slotRange, takerLabel, type Affected } from "@/lib/affected";
import { getRooms, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DATE_RE, slotStarted } from "@/lib/time";
import { getAffected, loadDays, workingDays } from "./data";

const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

/**
 * Move an affected class: to a suggestion, or to a room and time the admin picked. A picked one is
 * checked first (room free, sections free, faculty free then and just before and after); "move
 * anyway" saves it despite a clash with a section or faculty member, never into a busy room.
 */
function goTo(form: FormData) {
  const back = s(form, "back").startsWith("/admin/affected") ? s(form, "back") : "/admin/affected";
  return (k: "msg" | "error", v: string): never => {
    const [base, q = ""] = back.split("?");
    const p = new URLSearchParams(q);
    p.delete("msg");
    p.delete("error");
    p.set(k, v);
    redirect(`${base}?${p.toString()}`);
  };
}

const needsUpdate = (e: { code?: string; message: string }, fn: string) => e.code === "PGRST202" || e.message.includes(fn);
const why = (takenBy: string) => takerLabel(takenBy) || "a booking";

export async function moveAffected(form: FormData) {
  const go = goTo(form);
  const a: Affected = {
    date: s(form, "from_date"),
    room: s(form, "from_room"),
    slots: s(form, "from_slots").split(",").map(Number).filter(Boolean),
    subject: s(form, "subject"),
    faculty: s(form, "faculty").split(",").filter(Boolean),
    facultyName: null,
    takenBy: s(form, "why"),
    takenKind: "",
    cause: "booking",
  };
  const date = s(form, "to_date");
  const room = s(form, "to_room");
  const slots = await getSlots();
  const start = slots.findIndex((x) => String(x.id) === s(form, "to_start"));
  if (!DATE_RE.test(a.date) || !DATE_RE.test(date) || !a.room || !a.subject || !a.slots.length) go("error", "Something was missing; refresh the page and try again.");
  if (!room) go("error", "Pick a room.");
  if (start < 0 || start + a.slots.length > slots.length) go("error", "Pick a start time with enough slots after it for the whole class.");
  const ids = slots.slice(start, start + a.slots.length).map((x) => x.id);
  if (date < a.date) go("error", "A class can only move to the same day or a later one.");

  const [{ days, semesterSections }, rooms] = await Promise.all([loadDays([date]), getRooms()]);
  if (!rooms.some((r) => r.id === room)) go("error", "Room not found.");
  const sectionsOf = makeSectionsOf(semesterSections);
  const st = new DayState(days[0], sectionsOf);
  if (date === a.date) st.vacate(a);
  const problems = clashes(a, st, room, ids, slots, sectionsOf);
  const roomBusy = problems.some((p) => p.includes("is not free"));
  if (roomBusy || (problems.length && form.get("force") !== "on")) {
    go("error", `${a.subject} was not moved: ${problems.join("; ")}.${roomBusy ? "" : " Tick \"Move anyway\" to move it regardless."}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_move_class", {
    p_room: room,
    p_date: date,
    p_slots: ids,
    p_subject: a.subject,
    p_faculty: a.faculty.join(","),
    p_from: fromText(a, { date, slots: ids }, slots),
    p_why: why(a.takenBy),
  });
  revalidatePath("/", "layout");
  if (error) {
    const missing = error.code === "PGRST202" || /admin_move_class/.test(error.message);
    go("error", missing ? "Moving classes needs database update 0038. Run it in the Supabase SQL Editor." : `${a.subject} was not moved: ${error.message}`);
  }
  go("msg", `Moved ${a.subject} to ${room}, ${shortDay(date)}, ${slotRange(slots, ids)}.${problems.length ? ` Note: ${problems.join("; ")}.` : ""}`);
}

/**
 * Move many affected classes at once: the ticked ones, each to its best free room and time given the
 * classes moved before it (the plan the page shows). A class with no room left stays where it is.
 */
export async function bulkMoveAffected(form: FormData) {
  const go = goTo(form);
  const start = s(form, "start");
  const span = Number(s(form, "days")) || 7;
  const picked = new Set(form.getAll("pick").map(String));
  if (!DATE_RE.test(start)) go("error", "Something was missing; refresh the page and try again.");
  if (!picked.size) go("error", "Tick at least one class to move.");
  const dates = await workingDays(start, span);
  const { rows, rooms, slots, states, sectionsOf } = await getAffected(dates);
  const started = (date: string, id: number) => slotStarted(date, slots.find((x) => x.id === id) ?? { starts: "00:00" });
  const plan = planBulk(rows.filter((r) => picked.has(rowKey(r))), states, rooms, slots, sectionsOf, started);
  const supabase = await createClient();
  let moved = 0;
  const failed: string[] = [];
  for (const { a, to } of plan) {
    if (!to) {
      failed.push(`${a.subject} (${shortDay(a.date)}): no free room`);
      continue;
    }
    const { error } = await supabase.rpc("admin_move_class", {
      p_room: to.room,
      p_date: to.date,
      p_slots: to.slots,
      p_subject: a.subject,
      p_faculty: a.faculty.join(","),
      p_from: fromText(a, to, slots),
      p_why: why(a.takenBy),
    });
    if (error && needsUpdate(error, "admin_move_class")) go("error", "Moving classes needs database update 0038. Run it in the Supabase SQL Editor.");
    if (error) failed.push(`${a.subject} (${shortDay(a.date)}): ${error.message}`);
    else moved++;
  }
  revalidatePath("/", "layout");
  const text = `Moved ${moved} ${moved === 1 ? "class" : "classes"}.${failed.length ? ` Not moved: ${failed.join("; ")}.` : ""}`;
  go(moved ? "msg" : "error", text);
}
