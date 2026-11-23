"use client";

import { useRef, useState } from "react";
import FacultyPicker, { type PickFaculty } from "@/components/FacultyPicker";
import { IconFlag, IconPlus, IconSearch, IconX } from "@/components/Icons";
import LoadingOverlay from "@/components/LoadingOverlay";
import SubmitButton from "@/components/SubmitButton";
import type { Slot } from "@/lib/types";
import { adminBulkAllot, bulkAllotPreview, type BulkPreview } from "../../actions";
import SlotRange from "../allot/SlotRange";

export type Kind = "cie" | "see" | "event" | "skill_lab" | "class_request";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ordinal = (n: string) => `${n}${n === "1" ? "st" : n === "2" ? "nd" : n === "3" ? "rd" : "th"}`;

/**
 * Bulk allotment: one CIE, SEE, event, skill lab or class over a run of days, each row its own rooms
 * and times. An event or skill lab names the sections attending: their own classes then are
 * released. Preview first (what it takes, what is already booked there, which classes are released
 * and which lose their room), then allot all or none.
 */
export default function BulkAllotForm({
  rooms,
  slots,
  semesters,
  faculty,
  firstDay,
  back,
  initialKind = "cie",
}: {
  rooms: { id: string; name: string; summary: string; lab?: boolean }[];
  slots: Slot[];
  semesters: { sem: string; classes: string[] }[];
  faculty: PickFaculty[];
  firstDay: string;
  back: string;
  initialKind?: Kind;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [rows, setRows] = useState([0]);
  const [next, setNext] = useState(1);
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const exam = kind === "cie" || kind === "see";
  const forSections = kind === "event" || kind === "skill_lab";
  // A skill lab lists the labs first
  const roomList = kind === "skill_lab" ? [...rooms].sort((a, b) => Number(!!b.lab) - Number(!!a.lab)) : rooms;

  const check = async () => {
    if (!form.current?.reportValidity()) return;
    setChecking(true);
    try {
      setPreview(await bulkAllotPreview(new FormData(form.current)));
    } catch {
      setPreview({ error: "Could not check the slots. Please try again." });
    }
    setChecking(false);
  };

  return (
    <form ref={form} action={adminBulkAllot} onChange={() => setPreview(null)} className="card space-y-6 p-6">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="rowkeys" value={rows.join(",")} />

      <section className="space-y-3">
        <h2 className="font-semibold">1. Days</h2>
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
        <p className="muted text-xs">Sundays (other than make-up days) and holidays are skipped.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">2. Rooms and times</h2>
        {rows.map((key, i) => {
          const mine = picked[key] ?? [];
          return (
            <div key={key} className={`grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] ${i > 0 ? "border-t border-brand-100 pt-3 dark:border-brand-900" : ""}`}>
              <div>
                <span className="label">{rows.length > 1 ? `Rooms (row ${i + 1})` : "Rooms"}</span>
                <details className="relative">
                  <summary className="input flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                    <span className="truncate">{mine.length ? mine.map((id) => rooms.find((r) => r.id === id)?.name ?? id).join(", ") : "Pick rooms"}</span>
                    <span aria-hidden className="muted text-xs">▾</span>
                  </summary>
                  <div className="absolute z-20 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-xl border border-brand-100 bg-white p-2 shadow-xl dark:border-brand-900 dark:bg-ink">
                    {roomList.map((r) => (
                      <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-brand-50 dark:hover:bg-brand-950">
                        <input
                          type="checkbox"
                          name={`rooms-${key}`}
                          value={r.id}
                          className="mt-0.5 h-4 w-4 accent-brand-600"
                          onChange={(e) => setPicked((p) => ({ ...p, [key]: e.target.checked ? [...mine, r.id] : mine.filter((x) => x !== r.id) }))}
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
              <SlotRange slots={slots} idPrefix={`b${key}-`} />
              <div className="flex items-end lg:h-full lg:pb-0.5">
                {i > 0 && (
                  <button
                    type="button"
                    className="btn-secondary py-2"
                    onClick={() => {
                      setRows(rows.filter((k) => k !== key));
                      setPreview(null);
                    }}
                    aria-label={`Remove row ${i + 1}`}
                  >
                    <IconX className="h-4 w-4" /> Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="btn-secondary py-2 text-sm"
          onClick={() => {
            setRows([...rows, next]);
            setNext(next + 1);
            setPreview(null);
          }}
        >
          <IconPlus className="h-4 w-4" /> Add rooms at another time
        </button>
        <p className="muted text-xs">Each row books its rooms at its times on every day above. Use rows when some rooms are needed at different times.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">3. What it is for</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="kind">Reason</label>
            <select id="kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="cie">CIE (exam)</option>
              <option value="see">SEE (exam)</option>
              <option value="event">College event</option>
              <option value="skill_lab">Skill lab</option>
              <option value="class_request">Class</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="title">{kind === "class_request" ? "Subject" : "Title"}</label>
            <input id="title" name="title" className="input" key={kind}
              defaultValue={kind === "skill_lab" ? "Skill Lab" : undefined}
              placeholder={kind === "see" ? "e.g. DBMS, 3rd sem" : kind === "cie" ? "e.g. CIE-2, 5th sem" : kind === "event" ? "e.g. IEEE workshop on GenAI" : "e.g. DBMS-3B extra class"} />
            {forSections && <p className="muted mt-1 text-xs">The sections are added: &quot;{kind === "skill_lab" ? "Skill Lab" : "Workshop"} - 3B/3D&quot;.</p>}
          </div>
          <div>
            <label className="label" htmlFor="reason">Description <span className="text-red-600">*</span></label>
            <input id="reason" name="reason" required minLength={5} className="input" placeholder="Shown on the timetable" />
          </div>
          {kind === "class_request" ? (
            <div>
              <label className="label" htmlFor="faculty">Faculty for the class</label>
              <select id="faculty" name="faculty" className="input" defaultValue="">
                <option value="">No faculty assigned</option>
                {faculty.map((f) => (
                  <option key={f.initials} value={f.initials}>{f.name === f.initials ? f.initials : `${f.name} (${f.initials})`}</option>
                ))}
              </select>
            </div>
          ) : (
            <FacultyPicker key={kind} faculty={faculty} emptyText={kind === "see" ? "SEE Co-ordinators" : kind === "cie" ? "CIE Co-ordinators" : "None"} />
          )}
        </div>

        {exam && semesters.length > 0 && (
          <fieldset className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <legend className="px-1 text-sm font-semibold">Cancel the classes of the semesters writing it (optional)</legend>
            <p className="muted mb-3 text-xs">
              Every regular class of the semesters you tick is cancelled on each of these days, all day. Students see one line, &quot;{kind === "see" ? "SEE" : "CIE"}: classes cancelled&quot;, instead of each class.
            </p>
            <div className="flex flex-wrap gap-2">
              {semesters.map(({ sem, classes }) => (
                <label
                  key={sem}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-100 dark:border-brand-900 dark:bg-ink dark:has-[:checked]:border-amber-500 dark:has-[:checked]:bg-amber-950"
                >
                  <input type="checkbox" name="semesters" value={sem} className="h-4 w-4 accent-amber-600" />
                  <span>
                    <span className="font-semibold">{ordinal(sem)} semester</span>
                    <span className="muted block text-xs">{classes.length === 1 && classes[0] === sem ? "All sections" : classes.join(" · ")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {forSections && semesters.length > 0 && (
          <fieldset className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-800 dark:bg-brand-950/30">
            <legend className="px-1 text-sm font-semibold">
              Sections attending {kind === "skill_lab" ? <span className="text-red-600">*</span> : <span className="muted font-normal">(optional)</span>}
            </legend>
            <p className="muted mb-3 text-xs">
              Their own classes at these times are released, since the students are here, so those rooms are free. Classes of other sections that lose
              their room show in Classes affected, ready to move.
            </p>
            <div className="space-y-2">
              {semesters
                .filter((x) => x.classes.some((c) => c.length > 1))
                .map(({ sem, classes }) => (
                  <div key={sem} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-28 text-sm font-medium">{ordinal(sem)} semester</span>
                    {classes.map((c) => (
                      <label
                        key={c}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-100 bg-white px-2.5 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-100 dark:border-brand-900 dark:bg-ink dark:has-[:checked]:bg-brand-900"
                      >
                        <input type="checkbox" name="sections" value={c} className="h-4 w-4 accent-brand-600" />
                        {c}
                      </label>
                    ))}
                  </div>
                ))}
            </div>
          </fieldset>
        )}
      </section>

      {preview && (
        <section className={`rounded-xl border p-4 text-sm ${preview.error ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/40"}`} aria-live="polite">
          {preview.error ? (
            <p className="text-red-700 dark:text-red-300">{preview.error}</p>
          ) : (
            <div className="space-y-2">
              <p className="font-medium">
                {preview.slots} slots in {preview.rooms} {preview.rooms === 1 ? "room" : "rooms"} over {preview.days!.length} {preview.days!.length === 1 ? "day" : "days"}: {preview.days!.map((d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })).join(", ")}.
              </p>
              {preview.clashes!.length ? (
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">Already booked; these are overwritten if you go ahead:</p>
                  <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                    {preview.clashes!.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-emerald-700 dark:text-emerald-300">Nothing else is booked in these rooms and times.</p>
              )}
              {preview.title && forSections && <p>Saved as <span className="font-semibold">{preview.title}</span>.</p>}
              {forSections && (
                <PreviewList
                  tone="good"
                  title={`Released: ${preview.released!.length} ${preview.released!.length === 1 ? "class" : "classes"} of the sections attending`}
                  empty="No class of these sections is released at these times."
                  rows={preview.released!}
                />
              )}
              <PreviewList
                tone="warn"
                title={`Lose their room: ${preview.displaced!.length} ${preview.displaced!.length === 1 ? "class" : "classes"}, listed in Classes affected to move`}
                empty="No other class loses its room."
                rows={preview.displaced!}
              />
              {preview.readDays && <p className="muted text-xs">Classes are checked for the first {preview.readDays} days.</p>}
              <p className="muted text-xs">Everything is allotted together: if any slot fails, nothing is saved.</p>
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
            pendingText="Allotting…"
            message="Allotting every room and time…"
            confirm={preview.clashes!.length ? `Overwrite ${preview.clashes!.length} existing ${preview.clashes!.length === 1 ? "booking" : "bookings"} and allot all ${preview.slots} slots?` : undefined}
            confirmLabel="Yes, allot all"
          >
            <IconFlag className="h-4 w-4" /> Allot all {preview.slots} slots
          </SubmitButton>
        )}
      </div>
      {checking && <LoadingOverlay label="Checking the slots…" />}
    </form>
  );
}

function PreviewList({ title, empty, rows, tone }: { title: string; empty: string; rows: string[]; tone: "good" | "warn" }) {
  return (
    <div>
      <p className={`font-medium ${rows.length ? (tone === "good" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300") : ""}`}>{rows.length ? title : empty}</p>
      {rows.length > 0 && (
        <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
          {rows.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
