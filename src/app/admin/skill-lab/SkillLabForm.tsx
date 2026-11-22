"use client";

import { useRef, useState } from "react";
import FacultyPicker, { type PickFaculty } from "@/components/FacultyPicker";
import { IconFlag, IconSearch } from "@/components/Icons";
import LoadingOverlay from "@/components/LoadingOverlay";
import SubmitButton from "@/components/SubmitButton";
import type { DayPlan } from "@/lib/skillLab";
import type { Slot } from "@/lib/types";
import SlotRange from "../allot/SlotRange";
import { adminSkillLab, skillLabPreview, type SkillLabPreview } from "./actions";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ordinal = (n: string) => `${n}${n === "1" ? "st" : n === "2" ? "nd" : n === "3" ? "rd" : "th"}`;
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

type RoomOption = { id: string; name: string; summary: string; lab: boolean };

/**
 * Skill lab: the sections that go, the labs, the days and times. Preview shows, day by day, the
 * classes released, the classes moved (and where to) and any class that could not be moved.
 */
export default function SkillLabForm({
  rooms,
  slots,
  semesters,
  faculty,
  firstDay,
}: {
  rooms: RoomOption[];
  slots: Slot[];
  semesters: { sem: string; classes: string[] }[];
  faculty: PickFaculty[];
  firstDay: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<SkillLabPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [labs, setLabs] = useState<string[]>([]);
  const labRooms = [...rooms].sort((a, b) => Number(b.lab) - Number(a.lab));

  const check = async () => {
    if (!form.current?.reportValidity()) return;
    setChecking(true);
    try {
      setPreview(await skillLabPreview(new FormData(form.current)));
    } catch {
      setPreview({ error: "Could not check the timetable. Please try again." });
    }
    setChecking(false);
  };

  const days = preview?.days ?? [];
  const totals = {
    released: days.reduce((n, d) => n + d.releases.length, 0),
    moved: days.reduce((n, d) => n + d.moves.length, 0),
    unplaced: days.reduce((n, d) => n + d.unplaced.length, 0),
  };

  return (
    <form ref={form} action={adminSkillLab} onChange={() => setPreview(null)} className="card space-y-6 p-6">
      <section className="space-y-3">
        <h2 className="font-semibold">1. Sections at the skill lab</h2>
        <p className="muted text-xs">Their own classes at the skill lab&apos;s time are released, so their rooms are free for the classes that lose a lab.</p>
        <div className="space-y-2">
          {semesters
            .filter((s) => s.classes.some((c) => c.length > 1))
            .map(({ sem, classes }) => (
              <fieldset key={sem} className="flex flex-wrap items-center gap-1.5">
                <legend className="mb-1 text-sm font-medium">{ordinal(sem)} semester</legend>
                {classes.map((c) => (
                  <label
                    key={c}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-100 px-2.5 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:border-brand-900 dark:has-[:checked]:bg-brand-950"
                  >
                    <input type="checkbox" name="sections" value={c} className="h-4 w-4 accent-brand-600" />
                    {c}
                  </label>
                ))}
              </fieldset>
            ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">2. Labs, days and time</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <span className="label">Labs for the skill lab</span>
            <details className="relative">
              <summary className="input flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span className="truncate">{labs.length ? labs.join(", ") : "Pick labs"}</span>
                <span aria-hidden className="muted text-xs">▾</span>
              </summary>
              <div className="absolute z-20 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-xl border border-brand-100 bg-white p-2 shadow-xl dark:border-brand-900 dark:bg-ink">
                {labRooms.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-brand-50 dark:hover:bg-brand-950">
                    <input
                      type="checkbox"
                      name="labs"
                      value={r.id}
                      className="mt-0.5 h-4 w-4 accent-brand-600"
                      onChange={(e) => setLabs((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))}
                    />
                    <span>
                      <span className="font-medium">{r.name}</span>
                      {r.summary && <span className="muted block text-xs">{r.summary}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <SlotRange slots={slots} idPrefix="sl-" initialTo={slots.length - 1} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[12rem_12rem_minmax(0,1fr)]">
          <div>
            <label className="label" htmlFor="from_date">Start date</label>
            <input id="from_date" name="from_date" type="date" required defaultValue={firstDay} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="to_date">End date</label>
            <input id="to_date" name="to_date" type="date" required defaultValue={firstDay} className="input" />
          </div>
          <fieldset>
            <legend className="label">
              Only on <span className="muted font-normal">(leave all unticked for every working day)</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w, i) => (
                <label key={w} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-100 px-2.5 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:border-brand-900 dark:has-[:checked]:bg-brand-950">
                  <input type="checkbox" name="weekdays" value={i + 1} className="h-4 w-4 accent-brand-600" />
                  {w}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">3. Details</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="title">Name</label>
            <input id="title" name="title" className="input" defaultValue="Skill Lab" />
            <p className="muted mt-1 text-xs">The sections are added: &quot;Skill Lab - 3B/3D&quot;.</p>
          </div>
          <div>
            <label className="label" htmlFor="reason">Description <span className="text-red-600">*</span></label>
            <input id="reason" name="reason" required minLength={5} className="input" placeholder="e.g. Skill Lab - Cluster B" />
          </div>
          <FacultyPicker faculty={faculty} label="Faculty" />
        </div>
      </section>

      {preview && (
        <section
          className={`rounded-xl border p-4 text-sm ${preview.error ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/40"}`}
          aria-live="polite"
        >
          {preview.error ? (
            <p className="text-red-700 dark:text-red-300">{preview.error}</p>
          ) : (
            <div className="space-y-4">
              <p className="font-medium">
                {preview.title} in {preview.labs!.join(", ")} on {days.map((d) => dayLabel(d.date)).join(", ")}: {totals.released} class{" "}
                {totals.released === 1 ? "slot" : "slots"} released, {totals.moved} {totals.moved === 1 ? "class" : "classes"} moved
                {totals.unplaced ? `, ${totals.unplaced} could not be moved` : ""}.
              </p>
              {days.map((d) => (
                <DayPreview key={d.date} day={d} slots={slots} />
              ))}
              <p className="muted text-xs">Everything is saved together: if any slot fails, nothing is saved. A class that could not be moved shows as &quot;Room taken&quot; for its students.</p>
            </div>
          )}
        </section>
      )}

      <div className="sticky-save flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={check}>
          <IconSearch className="h-4 w-4" /> Preview
        </button>
        {preview && !preview.error && (
          <SubmitButton
            pendingText="Saving…"
            message="Booking the labs and moving the classes…"
            confirm={`Book the labs, release ${totals.released} class slots and move ${totals.moved} ${totals.moved === 1 ? "class" : "classes"}?`}
            confirmLabel="Yes, save all"
          >
            <IconFlag className="h-4 w-4" /> Book skill lab and move classes
          </SubmitButton>
        )}
      </div>
      {checking && <LoadingOverlay label="Working out the moves…" />}
    </form>
  );
}

function range(slots: Slot[], ids: number[]) {
  const a = slots.find((s) => s.id === ids[0]);
  const b = slots.find((s) => s.id === ids[ids.length - 1]);
  return a && b ? `${a.label.split(" – ")[0]} – ${b.label.split(" – ")[1]}` : "";
}

/** One day: released classes (merged into runs), moves, classes left without a room, warnings. */
function DayPreview({ day, slots }: { day: DayPlan; slots: Slot[] }) {
  const order = new Map(slots.map((s, i) => [s.id, i]));
  const runs: { room: string; subject: string; section: string; ids: number[] }[] = [];
  for (const r of [...day.releases].sort((a, b) => a.room.localeCompare(b.room) || (order.get(a.slot) ?? 0) - (order.get(b.slot) ?? 0))) {
    const last = runs[runs.length - 1];
    if (last && last.room === r.room && last.subject === r.subject && (order.get(last.ids[last.ids.length - 1]) ?? -9) + 1 === order.get(r.slot)) last.ids.push(r.slot);
    else runs.push({ room: r.room, subject: r.subject, section: r.section, ids: [r.slot] });
  }
  runs.sort((a, b) => (order.get(a.ids[0]) ?? 0) - (order.get(b.ids[0]) ?? 0) || a.room.localeCompare(b.room));
  const warn = [...day.facultyClashes, ...day.overwritten.map((x) => `Overwritten: ${x}`), ...day.shared];

  return (
    <div className="space-y-2 border-t border-brand-100 pt-3 dark:border-brand-900">
      <h3 className="font-semibold">{dayLabel(day.date)}</h3>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">Moved ({day.moves.length})</p>
          {day.moves.length ? (
            <ul className="mt-1 space-y-1">
              {day.moves.map((m) => {
                const same = m.slots.join() === m.fromSlots.join();
                return (
                  <li key={`${m.from}-${m.fromSlots[0]}-${m.subject}`} className="text-xs">
                    <span className="font-medium">{m.subject}</span>
                    {m.facultyName && <span className="muted"> · {m.facultyName}</span>}
                    <br />
                    {m.from}, {range(slots, m.fromSlots)} → <span className="font-medium">{m.room}</span>
                    {same ? ", same time" : <>, <span className="font-medium">{range(slots, m.slots)}</span></>}
                    {m.released && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">freed room</span>}
                    {m.department && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">other department: let them know</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted mt-1 text-xs">No class loses its lab.</p>
          )}
          {day.unplaced.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold tracking-wide text-red-700 uppercase dark:text-red-400">Could not move ({day.unplaced.length})</p>
              <ul className="mt-1 space-y-1">
                {day.unplaced.map((u) => (
                  <li key={`${u.room}-${u.slots[0]}-${u.subject}`} className="text-xs">
                    <span className="font-medium">{u.subject}</span>
                    {u.facultyName && <span className="muted"> · {u.facultyName}</span>}, {u.room}, {range(slots, u.slots)}: no free {/\(P\)|LAB/i.test(u.subject) ? "lab" : "room"} at a time the class and its faculty are free
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase dark:text-brand-300">Released ({day.releases.length} slots)</p>
          {runs.length ? (
            <ul className="mt-1 space-y-0.5">
              {runs.map((r) => (
                <li key={`${r.room}-${r.ids[0]}`} className="text-xs">
                  <span className="font-medium">{r.section}</span> · {r.subject} in {r.room}, {range(slots, r.ids)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted mt-1 text-xs">These sections have no class then.</p>
          )}
        </div>
      </div>
      {warn.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800 dark:text-amber-300">
          {warn.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
