"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getHolidays, getRooms, getSlots, type FacultySlotStatus } from "@/lib/data";
import { semestersOf } from "@/lib/classTimetable";
import { movedFrom, planSkillLabDay, skillLabTitle, type DayCell, type DayPlan } from "@/lib/skillLab";
import { createClient } from "@/lib/supabase/server";
import { addDays, DATE_RE, isClosedSunday, slotStarted, todayIST, weekdayOf } from "@/lib/time";
import type { ScheduleRow } from "@/lib/types";

const PAGE = "/admin/skill-lab";
const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

function withParam(key: "msg" | "error", value: string) {
  return `${PAGE}?${new URLSearchParams({ [key]: value }).toString()}`;
}

export type SkillLabPreview = {
  error?: string;
  title?: string;
  sections?: string[];
  labs?: string[];
  days?: DayPlan[];
};

type Input = { title: string; reason: string; facultyValue: string; sections: string[]; labs: string[]; slotIds: number[]; days: string[] };

async function readForm(form: FormData): Promise<Input | { error: string }> {
  const from = s(form, "from_date");
  const until = s(form, "to_date") || from;
  if (!DATE_RE.test(from) || !DATE_RE.test(until) || until < from) return { error: "The end date must be on or after the start date." };
  if (from < todayIST()) return { error: "A skill lab can only be booked from today on." };
  if (until > addDays(todayIST(), 28)) return { error: "Rooms can be booked at most 4 weeks ahead." };
  const weekdays = form.getAll("weekdays").map(Number).filter((n) => n >= 1 && n <= 7);
  const [slots, holidays] = await Promise.all([getSlots(), getHolidays()]);
  const days: string[] = [];
  for (let d = from; d <= until && days.length < 24; d = addDays(d, 1)) {
    if (!isClosedSunday(d) && !holidays.has(d) && (!weekdays.length || weekdays.includes(weekdayOf(d)))) days.push(d);
  }
  if (!days.length) return { error: "No working day in those dates. Sundays, holidays and unticked weekdays are skipped." };
  const sections = [...new Set(form.getAll("sections").map((x) => String(x).toUpperCase()).filter((x) => /^\d[A-Z]$/.test(x)))].sort();
  if (!sections.length) return { error: "Pick the sections that go to the skill lab." };
  const labs = [...new Set(form.getAll("labs").map(String).filter(Boolean))];
  if (!labs.length) return { error: "Pick at least one lab for the skill lab." };
  const a = slots.findIndex((x) => String(x.id) === s(form, "from"));
  const b = slots.findIndex((x) => String(x.id) === s(form, "to"));
  if (a < 0 || b < a) return { error: "Check the times: the end must be after the start." };
  const reason = s(form, "reason");
  if (reason.length < 5) return { error: "Please add a description (at least 5 characters)." };
  return {
    title: skillLabTitle(s(form, "title"), sections),
    reason,
    facultyValue: s(form, "faculty"),
    sections,
    labs,
    slotIds: slots.slice(a, b + 1).map((x) => x.id),
    days,
  };
}

async function plan(inp: Input): Promise<DayPlan[]> {
  const supabase = await createClient();
  const [slots, rooms] = await Promise.all([getSlots(), getRooms()]);
  const plans: DayPlan[] = [];
  for (const date of inp.days) {
    const [sch, tt, st, all] = await Promise.all([
      supabase.rpc("get_day_schedule", { p_date: date }),
      supabase.rpc("get_timetable", { p_date: date }),
      supabase.rpc("faculty_status", { p_date: date }),
      supabase.rpc("get_timetable_all", { p_date: date }),
    ]);
    if (sch.error || tt.error) throw new Error((sch.error ?? tt.error)!.message);
    const status = (st.data ?? []) as FacultySlotStatus[];
    const semesterSections = Object.fromEntries(
      semestersOf(((all.data ?? []) as DayCell[]).filter((c) => !c.is_department).map((c) => c.subject)).semesters.map((x) => [x.sem, x.classes]),
    );
    // "@A", "@B", "@ALL" or initials
    const v = inp.facultyValue.toUpperCase();
    const everyone = [...new Set(status.map((f) => f.initials))];
    const faculty =
      v === "@ALL" ? everyone : v === "@A" || v === "@B" ? [...new Set(status.filter((f) => f.cluster === v[1]).map((f) => f.initials))] : v.split(",").map((x) => x.trim()).filter(Boolean);
    plans.push(
      planSkillLabDay({
        date,
        schedule: (sch.data ?? []) as ScheduleRow[],
        timetable: (tt.data ?? []) as DayCell[],
        status,
        rooms,
        slots,
        sections: inp.sections,
        semesterSections,
        labs: inp.labs,
        slotIds: inp.slotIds,
        faculty,
        started: (id) => slotStarted(date, slots.find((x) => x.id === id) ?? { starts: "00:00" }),
      }),
    );
  }
  return plans;
}

/** What the skill lab would release, book and move, without saving anything. */
export async function skillLabPreview(form: FormData): Promise<SkillLabPreview> {
  const inp = await readForm(form);
  if ("error" in inp) return { error: inp.error };
  try {
    return { title: inp.title, sections: inp.sections, labs: inp.labs, days: await plan(inp) };
  } catch (e) {
    return { error: `Could not read the timetable: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}

/** Release the sections' classes, book the labs and move the classes that lost them: all or none. */
export async function adminSkillLab(form: FormData) {
  const inp = await readForm(form);
  if ("error" in inp) redirect(withParam("error", inp.error));
  let days: DayPlan[];
  try {
    days = await plan(inp);
  } catch (e) {
    redirect(withParam("error", `Could not read the timetable: ${e instanceof Error ? e.message : "unknown error"}`));
  }
  const slots = await getSlots();
  const places = days.flatMap((d) => inp.labs.map((room) => ({ room, date: d.date, slots: inp.slotIds.filter((id) => !slotStarted(d.date, slots.find((x) => x.id === id)!)) }))).filter((p) => p.slots.length);
  const releases = days.flatMap((d) => d.releases.map((r) => ({ room: r.room, date: r.date, slot: r.slot, section: r.section })));
  const moves = days.flatMap((d) =>
    d.moves.flatMap((m) => m.slots.map((slot) => ({ room: m.room, date: m.date, slot, subject: m.subject, faculty: m.faculty.join(","), from: movedFrom(m, slots) }))),
  );
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_skill_lab", {
    p_title: inp.title,
    p_reason: inp.reason,
    p_faculty: inp.facultyValue || null,
    p_places: places,
    p_releases: releases,
    p_moves: moves,
  });
  revalidatePath("/", "layout");
  if (error) {
    const missing = error.code === "PGRST202" || /admin_skill_lab/.test(error.message);
    redirect(withParam("error", missing ? "Skill lab needs database update 0037. Run it in the Supabase SQL Editor." : `Nothing was saved: ${error.message}`));
  }
  const r = (data ?? {}) as { booked?: number; released?: number; moved?: number };
  const unplaced = days.reduce((n, d) => n + d.unplaced.length, 0);
  const classes = days.reduce((n, d) => n + d.moves.length, 0);
  redirect(
    withParam(
      "msg",
      `${inp.title}: booked ${r.booked ?? 0} lab slots, released ${r.released ?? 0} class slots of ${inp.sections.join(", ")} and moved ${classes} ${classes === 1 ? "class" : "classes"}.` +
        (unplaced ? ` ${unplaced} ${unplaced === 1 ? "class" : "classes"} could not be moved and show as "Room taken".` : ""),
    ),
  );
}
