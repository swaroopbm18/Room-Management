"use server";

// Holidays, day swaps, make-up days and notices.

import { redirect } from "next/navigation";
import { DATE_RE, formatDate, weekdayOf } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { back, withParam, undoToken, refreshPages, run, s } from "./shared";

export async function addHoliday(form: FormData) {
  if (s(form, "no_makeup") !== "1") return run(form, "/admin/holidays", "admin_add_holiday", { p_date: s(form, "date"), p_name: s(form, "name") }, "Holiday added.");
  // Added with "No make-up day" ticked: mark it too, so it never shows in the make-up suggestions
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_holiday", { p_date: s(form, "date"), p_name: s(form, "name") });
  const { error: mark } = error ? { error: null } : await supabase.rpc("admin_set_holiday_makeup", { p_date: s(form, "date"), p_needed: false });
  refreshPages();
  const to = back(form, "/admin/holidays");
  if (error) redirect(withParam(to, "error", error.message));
  redirect(withParam(to, "msg", mark ? `Holiday added, but it couldn't be marked "No make-up day" (${mark.message}).` : "Holiday added, with no make-up day."));
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

/** Mark a holiday as needing no make-up day, or as needing one again. */
export async function setHolidayMakeup(form: FormData) {
  const needed = s(form, "needed") === "1";
  const name = s(form, "name");
  await run(
    form,
    "/admin/holidays",
    "admin_set_holiday_makeup",
    { p_date: s(form, "date"), p_needed: needed },
    needed ? `${name || "The holiday"} is back in the make-up suggestions.` : `No make-up day for ${name || "that holiday"}.`,
    needed ? undefined : undoToken("makeup", { p_date: s(form, "date"), p_needed: true }),
  );
}

/**
 * Holidays read from an uploaded Excel or CSV sheet (in the browser), after the admin has seen the
 * preview. Each is added like one typed in by hand; dates that are already holidays are left alone.
 */
export async function importHolidays(form: FormData) {
  const to = back(form, "/admin/holidays");
  let rows: { date: string; name: string; makeup: boolean }[] = [];
  try {
    rows = (JSON.parse(s(form, "holidays")) as typeof rows).filter((r) => DATE_RE.test(r.date) && typeof r.name === "string" && r.name.trim()).slice(0, 200);
  } catch {
    /* handled below */
  }
  if (!rows.length) redirect(withParam(to, "error", "No holidays to add. Upload the sheet again."));
  const supabase = await createClient();
  let added = 0;
  const failed: string[] = [];
  let unmarked = 0;
  for (const r of rows) {
    const { error } = await supabase.rpc("admin_add_holiday", { p_date: r.date, p_name: r.name.trim().slice(0, 80) });
    if (error) {
      failed.push(`${formatDate(r.date, { year: undefined })}: ${error.message}`);
      continue;
    }
    added++;
    if (!r.makeup) {
      const { error: e } = await supabase.rpc("admin_set_holiday_makeup", { p_date: r.date, p_needed: false });
      if (e) unmarked++;
    }
  }
  refreshPages();
  const msg = [
    `${added} holiday${added === 1 ? "" : "s"} added from the sheet.`,
    failed.length ? `${failed.length} not added (${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "; …" : ""}).` : "",
    unmarked ? `${unmarked} couldn't be marked "No make-up day": run migration 0046 first.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  redirect(withParam(to, added ? "msg" : "error", msg));
}

export async function addNotice(form: FormData) {
  await run(form, "/admin/holidays", "admin_add_notice", { p_message: s(form, "message"), p_starts: s(form, "starts"), p_ends: s(form, "ends") }, "Notice added.");
}

export async function removeNotice(form: FormData) {
  const undo = s(form, "message") ? undoToken("notice", { p_message: s(form, "message"), p_starts: s(form, "starts"), p_ends: s(form, "ends") }) : undefined;
  await run(form, "/admin/holidays", "admin_remove_notice", { p_id: Number(s(form, "id")) }, "Notice removed.", undo);
}

export async function copyHolidays(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_copy_holidays", { p_from: s(form, "from_date"), p_to: s(form, "to_date"), p_years: Number(s(form, "years")) || 1 });
  refreshPages();
  redirect(withParam(back(form, "/admin/rollover"), error ? "error" : "msg", error ? error.message : `${data} holiday${data === 1 ? "" : "s"} copied. Check festivals whose date moves each year.`));
}

export async function updateHoliday(form: FormData) {
  await run(form, "/admin/holidays", "admin_update_holiday", { p_date: s(form, "date"), p_new_date: s(form, "new_date") || s(form, "date"), p_name: s(form, "name") }, "Holiday updated.");
}

export async function updateNotice(form: FormData) {
  await run(form, "/admin/holidays", "admin_update_notice", { p_id: Number(s(form, "id")), p_message: s(form, "message"), p_starts: s(form, "starts"), p_ends: s(form, "ends") }, "Notice updated.");
}
