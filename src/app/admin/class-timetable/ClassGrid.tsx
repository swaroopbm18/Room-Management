"use client";

import { useEffect, useState } from "react";
import { IconAlert, IconCheck, IconPencil, IconPlus, IconX } from "@/components/Icons";
import SubmitButton from "@/components/SubmitButton";
import type { Slot } from "@/lib/types";
import { deleteClassEntry, saveClassEntry } from "../../actions";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One class taught in a slot (or a block of slots): where, what and by whom. */
export type ClassEntry = { room: string; subject: string; initials: string[]; wholeSemester: boolean };

/** A cell of the class timetable: one slot, or several in a row with the same classes. */
export type Span = { weekday: number; slotIds: number[]; entries: ClassEntry[] };

/**
 * A class's week, days × slots. Each class has a pencil that opens a small form in its cell to
 * fix the subject, faculty initials or room, with Save and Delete; an empty slot can take a new class.
 */
export default function ClassGrid({
  slots,
  days,
  rooms,
  busy,
  names,
  back,
  defaultSubjectSuffix,
}: {
  slots: Slot[];
  days: Span[][];
  rooms: { id: string; name: string }[];
  /** "weekday|slot" → room → subject, for the whole timetable */
  busy: Record<string, Record<string, string>>;
  /** initials → full name */
  names: Record<string, string>;
  back: string;
  defaultSubjectSuffix: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // Bring the open form fully into view, clear of the sticky day column on a phone
  useEffect(() => {
    if (editing) document.getElementById("class-tt-editor")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [editing]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const time = (ids: number[]) => `${slotById.get(ids[0])?.label.split(" – ")[0]} – ${slotById.get(ids[ids.length - 1])?.label.split(" – ")[1]}`;

  const editor = (span: Span, entry: ClassEntry | null) => {
    // A room is offered only if it is free in every slot of the block (or is this class's own room)
    const taken = (room: string) => span.slotIds.map((id) => busy[`${span.weekday}|${id}`]?.[room]).find((x) => x && room !== entry?.room);
    const unknown = entry?.initials.filter((x) => !names[x]) ?? [];
    return (
      <form id="class-tt-editor" action={saveClassEntry} className="space-y-1.5 text-left" onKeyDown={(e) => e.key === "Escape" && setEditing(null)}>
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="weekday" value={span.weekday} />
        <input type="hidden" name="slots" value={span.slotIds.join(",")} />
        <input type="hidden" name="old_room" value={entry?.room ?? ""} />
        <input type="hidden" name="old_subject" value={entry?.subject ?? ""} />
        <div className="text-[11px] font-medium text-brand-700 dark:text-brand-300">
          {entry ? "Edit" : "Add a class"} · {DAY_NAMES[span.weekday - 1]} {time(span.slotIds)}
        </div>
        <label className="block">
          <span className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-300">Subject and section</span>
          <input
            name="subject"
            required
            autoFocus
            defaultValue={entry?.subject ?? ""}
            placeholder={`e.g. DBMS${defaultSubjectSuffix}`}
            className="input px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-300">Faculty initials</span>
          <input
            name="initials"
            list="class-tt-initials"
            defaultValue={entry?.initials.join(", ") ?? ""}
            placeholder="e.g. AKN, KS"
            className="input px-2 py-1 font-mono text-sm uppercase"
          />
        </label>
        {unknown.length > 0 && (
          <p className="flex items-start gap-1 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
            <IconAlert className="mt-px h-3 w-3 shrink-0" /> {unknown.join(", ")} not in the faculty list. Check the spelling.
          </p>
        )}
        <label className="block">
          <span className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-300">Room</span>
          <select name="room" defaultValue={entry?.room ?? rooms.find((r) => !taken(r.id))?.id} className="input px-2 py-1 text-sm">
            {rooms.map((r) => {
              const t = taken(r.id);
              return (
                <option key={r.id} value={r.id} disabled={!!t}>
                  {r.name}
                  {t ? ` · has ${t}` : ""}
                </option>
              );
            })}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <SubmitButton className="btn-primary px-2.5 py-1 text-xs" pendingText="Saving…" message="Saving the class…">
            <IconCheck className="h-3.5 w-3.5" /> Save
          </SubmitButton>
          {entry && (
            <button
              formAction={deleteClassEntry}
              formNoValidate
              className="btn-danger px-2.5 py-1 text-xs"
              onClick={(e) => {
                if (!confirm(`Delete ${entry.subject} in ${entry.room} on ${DAY_NAMES[span.weekday - 1]}s at ${time(span.slotIds)}? The room becomes free from tomorrow.`)) e.preventDefault();
              }}
            >
              <IconX className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <button type="button" onClick={() => setEditing(null)} className="ml-auto px-1.5 py-1 text-xs text-neutral-500 hover:underline dark:text-neutral-400">
            Cancel
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className="card overflow-hidden">
      <datalist id="class-tt-initials">
        {Object.entries(names)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ini, name]) => (
            <option key={ini} value={ini}>
              {name}
            </option>
          ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-100 px-4 py-3 text-xs dark:border-brand-900/70">
        <span className="inline-flex items-center gap-1.5">
          <IconPencil className="h-3.5 w-3.5" /> Edit or delete a class
        </span>
        <span className="inline-flex items-center gap-1.5">
          <IconPlus className="h-3.5 w-3.5" /> Add a class to a free slot
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded bg-amber-200 px-1 text-[10px] font-semibold text-amber-950 dark:bg-amber-900 dark:text-amber-100">Check</span> Initials not in the faculty list
        </span>
        <span className="muted ml-auto hidden sm:inline">Scroll sideways to see every slot. Changes take effect from tomorrow.</span>
      </div>
      <div className="max-h-[75vh] overflow-auto overscroll-contain">
        <table className="border-separate border-spacing-1.5 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 rounded-lg bg-brand-950 px-3 py-3 sm:min-w-24 text-left text-xs font-semibold tracking-wide text-brand-100 uppercase">Day</th>
              {slots.map((s) => (
                <th key={s.id} className="sticky top-0 z-10 min-w-40 rounded-lg bg-brand-900 px-3 py-2 text-left font-medium whitespace-nowrap text-white dark:bg-brand-950">
                  <div className="text-sm">{s.label.split(" – ")[0]}</div>
                  <div className="text-[11px] font-normal text-brand-300">to {s.label.split(" – ")[1]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((spans, i) => (
              <tr key={i}>
                <th className="sticky left-0 z-10 rounded-lg bg-brand-100 px-3 py-2 text-left font-semibold whitespace-nowrap text-brand-950 dark:bg-brand-950 dark:text-brand-100">
                  <span className="sm:hidden">{DAY_NAMES[i].slice(0, 3)}</span>
                  <span className="hidden sm:inline">{DAY_NAMES[i]}</span>
                </th>
                {spans.map((span) => {
                  const base = `${span.weekday}|${span.slotIds[0]}`;
                  const addKey = `${base}|+`;
                  if (span.entries.length === 0) {
                    return (
                      <td key={base} className="h-20 min-w-40 rounded-lg border border-dashed border-brand-200 align-top dark:border-brand-900">
                        {editing === addKey ? (
                          <div className="min-w-56 px-2 py-2">{editor(span, null)}</div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditing(addKey)}
                            aria-label={`Add a class on ${DAY_NAMES[span.weekday - 1]} at ${time(span.slotIds)}`}
                            className="group flex h-full min-h-20 w-full items-center justify-center rounded-lg text-xs font-medium tracking-wide text-brand-400 uppercase transition hover:bg-brand-50 hover:text-brand-700 dark:text-brand-700 dark:hover:bg-brand-950 dark:hover:text-brand-300"
                          >
                            <span className="group-hover:hidden group-focus-visible:hidden">Free</span>
                            <span className="hidden items-center gap-1 group-hover:inline-flex group-focus-visible:inline-flex">
                              <IconPlus className="h-3.5 w-3.5" /> Add
                            </span>
                          </button>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={base} colSpan={span.slotIds.length} className="h-20 min-w-40 rounded-lg bg-brand-100 px-2 py-1.5 align-top text-brand-950 dark:bg-brand-900/60 dark:text-brand-50">
                      <div className="divide-y divide-brand-200/70 dark:divide-brand-800/70">
                        {span.entries.map((e) => {
                          const key = `${base}|${e.room}`;
                          if (editing === key) return <div key={key} className="min-w-56 py-1.5">{editor(span, e)}</div>;
                          const unknown = e.initials.some((x) => !names[x]);
                          return (
                            <div key={key} className="flex items-start gap-1.5 py-1" title={[e.subject, ...e.initials.map((x) => names[x] ?? `${x} (not in the faculty list)`), e.room].join("\n")}>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="font-semibold">{e.subject}</span>
                                  {e.wholeSemester && <span className="rounded bg-black/10 px-1 text-[10px] font-semibold uppercase dark:bg-white/15">All sections</span>}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                                  <span className="font-mono">{e.initials.join(", ") || "No faculty"}</span>
                                  {unknown && <span className="rounded bg-amber-200 px-1 text-[10px] font-semibold text-amber-950 dark:bg-amber-900 dark:text-amber-100">Check</span>}
                                </div>
                                <div className="mt-0.5 text-[11px] opacity-70">{e.room}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditing(key)}
                                aria-label={`Edit ${e.subject} on ${DAY_NAMES[span.weekday - 1]} at ${time(span.slotIds)}`}
                                title="Edit"
                                className="shrink-0 rounded-md p-1 text-brand-700 transition hover:bg-white hover:text-brand-950 dark:text-brand-300 dark:hover:bg-black dark:hover:text-white"
                              >
                                <IconPencil className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
