"use server";

// Faculty: profiles, sign-in list, subjects, duties, clusters, leave and substitutes.

import { redirect } from "next/navigation";
import { getSlots } from "@/lib/data";
import { addDays, formatDate, todayIST } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { back, withParam, undoToken, run, s, slotRange, run25, refreshPages } from "./shared";

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
  refreshPages();
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
  refreshPages();
  if (error) {
    redirect(withParam(back(form, "/admin/faculty"), "error", error.message));
  }
  const kept = data === "kept_history" ? " Their past requests are kept, but they can no longer sign in." : "";
  redirect(withParam(s(form, "done") || "/admin/faculty", "msg", `${initials} deleted.${kept}`));
}

/**
 * Deletes a faculty record whatever the timetable says. With "into" set, it is merged into that
 * faculty member: their classes (from tomorrow), duties, cluster, leave and sign-in move there, and
 * the typo is remembered for later uploads. Without it, they are taken off every class they are on.
 */
export async function purgeFaculty(form: FormData) {
  const supabase = await createClient();
  const initials = s(form, "initials").toUpperCase();
  const into = s(form, "into").toUpperCase();
  const { data, error } = await supabase.rpc("admin_purge_faculty", { p_initials: initials, p_into: into || null });
  refreshPages();
  if (error) redirect(withParam(back(form, "/admin/faculty"), "error", error.message));
  const r = (data ?? {}) as { slots?: number; account?: string | null };
  const n = r.slots ?? 0;
  const slots = `${n} class slot${n === 1 ? "" : "s"}`;
  const from = formatDate(addDays(todayIST(), 1), { weekday: "long" });
  const msg = into
    ? `${initials} merged into ${into}.` +
      (n ? ` ${slots} moved to ${into} from ${from}.` : "") +
      (r.account === "moved" ? ` Their sign-in now uses ${into}.` : "") +
      ` A timetable upload that still says ${initials} will read it as ${into}.`
    : `${initials} deleted.` +
      (n ? ` Taken off ${slots} from ${from}.` : "") +
      (r.account === "kept_history" ? " Their past requests are kept, but they can no longer sign in." : "");
  redirect(withParam(s(form, "done") || "/admin/faculty", "msg", msg));
}

/** Stops reading a remembered typo as someone else's initials. */
export async function removeFacultyAlias(form: FormData) {
  await run(form, "/admin/people", "admin_remove_faculty_alias", { p_alias: s(form, "alias") }, `${s(form, "alias")} is no longer read as ${s(form, "initials")}.`);
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
  refreshPages();
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
  refreshPages();
  const to = back(form, "/admin/subjects");
  redirect(
    error
      ? withParam(to, "error", error.message)
      : withParam(to, "msg", data ? `${data} ${data === 1 ? "subject" : "subjects"} added from the timetable.` : "Everyone already has every subject the timetable gives them."),
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
  refreshPages();
  redirect(error ? withParam(to, "error", error.message) : withParam(to, "msg", `Saved ${data} duty ${data === 1 ? "slot" : "slots"} for ${new Set(entries.map((e) => e.initials)).size} faculty.`));
}

/** Save the HoD cluster of every faculty member on the form (fields named "cluster:<initials>"). */
export async function setFacultyClusters(form: FormData) {
  const entries = [...form.entries()]
    .filter(([k]) => k.startsWith("cluster:"))
    .map(([k, v]) => ({ initials: k.slice("cluster:".length), cluster: String(v) }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_faculty_clusters", { p_entries: entries });
  refreshPages();
  const to = back(form, "/admin/faculty");
  redirect(error ? withParam(to, "error", error.message) : withParam(to, "msg", data ? `Clusters saved: ${data} ${data === 1 ? "change" : "changes"}.` : "No cluster changed."));
}

/** A faculty member on leave from one date to another (one day when "to" is empty). */
export async function addLeave(form: FormData) {
  const supabase = await createClient();
  const from = s(form, "from");
  const to = s(form, "to") || from;
  const { error } = await supabase.rpc("admin_add_leave", { p_initials: s(form, "initials"), p_from: from || null, p_to: to || null, p_reason: s(form, "reason") });
  refreshPages();
  const days = from === to ? formatDate(from, { weekday: "long" }) : `${formatDate(from)} to ${formatDate(to)}`;
  redirect(withParam(back(form, "/admin/leave"), error ? "error" : "msg", error ? error.message : `${s(form, "initials").toUpperCase()} is on leave ${days}.`));
}

export async function removeLeave(form: FormData) {
  const undo = s(form, "initials") ? undoToken("leave", { p_initials: s(form, "initials"), p_from: s(form, "from"), p_to: s(form, "to"), p_reason: s(form, "reason") }) : undefined;
  await run(form, "/admin/leave", "admin_remove_leave", { p_id: Number(s(form, "id")) }, "Leave removed.", undo);
}

export async function updateLeave(form: FormData) {
  const from = s(form, "from");
  await run25(form, "/admin/leave", "admin_update_leave", { p_id: Number(s(form, "id")), p_from: from || null, p_to: s(form, "to") || from || null, p_reason: s(form, "reason") }, "Leave updated.");
}

/** Removes someone from the sign-in list; anyone with requests on record keeps a row without access. */
export async function deletePerson(form: FormData) {
  await run25(form, "/admin/people", "admin_delete_person", { p_email: s(form, "email") }, (r) =>
    r === "kept_history" ? `${s(form, "email")} can no longer sign in. Their past requests still show their name.` : `${s(form, "email")} deleted.`,
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
