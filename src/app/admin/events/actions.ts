"use server";

import { redirect } from "next/navigation";
import { bySection, makeSectionsOf, releasesFor, shortDay, takersOn } from "@/lib/affected";
import { getSlots } from "@/lib/data";
import { eventLabel, eventPlaces } from "@/lib/events";
import { skillLabTitle } from "@/lib/skillLab";
import { createClient } from "@/lib/supabase/server";
import { DATE_RE, slotStarted } from "@/lib/time";
import { loadDays, workingDays } from "../affected/data";
import { refreshPages } from "../../actions/shared";

const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

function goTo(form: FormData) {
  const back = s(form, "back").startsWith("/admin/events") ? s(form, "back") : "/admin/events";
  return (k: "msg" | "error", v: string): never => {
    const [base, q = ""] = back.split("?");
    const p = new URLSearchParams(q);
    p.delete("msg");
    p.delete("error");
    p.set(k, v);
    redirect(`${base}?${p.toString()}`);
  };
}

const needs0042 = (e: { code?: string; message: string }) => e.code === "PGRST202" || e.message.includes("admin_change_event");

/** The event's days from the form, and every slot it changed on them (and classes moved for it in the two weeks after). */
async function placesOf(form: FormData, go: (k: "msg" | "error", v: string) => never) {
  const title = s(form, "title");
  const dates = s(form, "dates").split(",").filter((d) => DATE_RE.test(d)).sort();
  if (!title || !dates.length) go("error", "Something was missing; refresh the page and try again.");
  // Classes moved for it may be on a later day
  const after = await workingDays(dates[dates.length - 1], 15);
  const { days } = await loadDays([...new Set([...dates, ...after])].sort());
  return { title, dates, places: eventPlaces(title, dates, days) };
}

/**
 * Rename an event, CIE, SEE or skill lab, and change its description, on every one of its days.
 * Its sections stay in its name; the classes released and moved for it name it by its new name.
 */
export async function editEvent(form: FormData) {
  const go = goTo(form);
  const { title, places } = await placesOf(form, go);
  const sections = s(form, "sections").split(",").filter(Boolean);
  const label = s(form, "label");
  const reason = s(form, "reason");
  if (!label) go("error", "Give the event a name.");
  if (reason.length < 5) go("error", "Please add a description (at least 5 characters).");
  const newTitle = sections.length ? skillLabTitle(label, sections) : label;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_change_event", { p_places: places, p_title: title, p_new_title: newTitle, p_reason: reason, p_cancel: false });
  refreshPages();
  if (error) go("error", needs0042(error) ? "Editing events needs database update 0042. Run it in the Supabase SQL Editor." : error.message);
  go("msg", newTitle === title ? `${title} updated.` : `Renamed "${title}" to "${newTitle}" everywhere.`);
}

/**
 * Cancel an event on all its days or one: each slot goes back to how it was before it, so its rooms
 * have their classes again, the classes released or cancelled for it are back, and the classes moved
 * for it return to their own rooms.
 */
export async function cancelEvent(form: FormData) {
  const go = goTo(form);
  const { title, dates, places } = await placesOf(form, go);
  const day = s(form, "day");
  const only = day && day !== "all" ? day : null;
  if (only && !dates.includes(only)) go("error", "Pick one of the event's days.");
  // One day: that day's slots, and classes moved for it from that day
  const picked = only ? places.filter((p) => p.date === only || (p.date > only && !dates.includes(p.date))) : places;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_change_event", { p_places: picked, p_title: title, p_new_title: null, p_reason: null, p_cancel: true });
  refreshPages();
  if (error) go("error", needs0042(error) ? "Cancelling events needs database update 0042. Run it in the Supabase SQL Editor." : error.message);
  const n = Number(data ?? 0);
  go("msg", `Cancelled ${eventLabel(title)}${only ? ` on ${shortDay(only)}` : ""}: ${n} ${n === 1 ? "slot is" : "slots are"} back as ${n === 1 ? "it was" : "they were"} before.`);
}

/**
 * Add sections to an event or skill lab on all its days: its name gets the sections, so their classes
 * whose room it took are no longer affected, and their own classes in its times are released.
 */
export async function addSectionsToEvent(form: FormData) {
  const go = goTo(form);
  const title = s(form, "title");
  const dates = s(form, "dates").split(",").filter((d) => DATE_RE.test(d)).sort();
  const added = [...new Set(form.getAll("section").map((x) => String(x).trim().toUpperCase()).filter((x) => /^\d[A-Z]$/.test(x)))];
  if (!title || !dates.length) go("error", "Something was missing; refresh the page and try again.");
  if (!added.length) go("error", "Tick the sections to add.");
  const known = s(form, "known").split(",").filter((x) => /^\d[A-Z]$/.test(x));
  const [{ days, semesterSections }, slots] = await Promise.all([loadDays(dates), getSlots()]);
  const sectionsOf = makeSectionsOf(semesterSections);
  const supabase = await createClient();
  let released = 0;
  let newTitle = title;
  for (const day of days) {
    const t = takersOn(day, [title]).find((x) => x.title === title);
    if (!t) continue;
    // Sections named only in its description count as attending too, and go into its name now
    const had = [...new Set([...t.sections, ...known])];
    const newSecs = added.filter((k) => !had.includes(k));
    if (!newSecs.length) continue;
    const attending = [...had, ...newSecs].sort(bySection);
    newTitle = `${t.label} - ${attending.join("/")}`;
    const releases = releasesFor(day, t, attending, newSecs, sectionsOf).filter((r) => !slotStarted(day.date, slots.find((x) => x.id === r.slot) ?? { starts: "00:00" }));
    const { data, error } = await supabase.rpc("admin_add_sections", { p_date: day.date, p_slots: t.slots, p_title: title, p_new_title: newTitle, p_releases: releases });
    if (error) {
      refreshPages();
      go("error", error.code === "PGRST202" || error.message.includes("admin_add_sections") ? "Adding sections needs database update 0038. Run it in the Supabase SQL Editor." : `${shortDay(day.date)}: ${error.message}`);
    }
    released += (data as { released?: number } | null)?.released ?? 0;
  }
  refreshPages();
  if (newTitle === title) go("error", "Those sections are already in it.");
  go("msg", `Added ${added.join(", ")}: now "${newTitle}". Released ${released} ${released === 1 ? "class slot" : "class slots"} of theirs, so those rooms are free.`);
}
