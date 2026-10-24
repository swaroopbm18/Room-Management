"use client";

import { startTransition, useActionState, useState } from "react";
import { IconAlert, IconCheck, IconUpload } from "@/components/Icons";
import LoadingOverlay from "@/components/LoadingOverlay";
import Spinner from "@/components/Spinner";
import SubmitButton from "@/components/SubmitButton";
import { parseTimetableDocx } from "@/lib/timetableDocx";
import type { Slot } from "@/lib/types";
import { applyTimetableUpload, previewTimetableUpload, type UploadPreview } from "../../actions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Upload the Word timetable, see every cell that would change, then confirm. */
export default function TimetableUpload({ slots, roomIds, effective }: { slots: Slot[]; roomIds: string[]; effective: string }) {
  const [result, compare, comparing] = useActionState<UploadPreview, FormData>(previewTimetableUpload, {});
  const [readError, setReadError] = useState<string>();
  const [reading, setReading] = useState(false);
  const slotLabel = new Map(slots.map((s) => [s.id, s.label]));
  const preview: UploadPreview = readError ? { error: readError } : result;
  const changes = preview.changes ?? [];
  const busy = reading || comparing;

  // The Word file can be several MB, so it is read here and only the timetable is sent.
  async function check(form: FormData) {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return setReadError("Choose the timetable Word file (.docx) first.");
    setReading(true);
    setReadError(undefined);
    try {
      const parsed = parseTimetableDocx(new Uint8Array(await file.arrayBuffer()), new Map(slots.map((s) => [s.starts.slice(0, 5), s.id])), new Set(roomIds));
      const data = new FormData();
      data.set("parsed", JSON.stringify(parsed));
      startTransition(() => compare(data));
    } catch (e) {
      setReadError((e as Error).message);
    } finally {
      setReading(false);
    }
  }

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">Upload the timetable as a Word file</h2>
        <p className="muted mt-1 text-sm">
          Use the same layout as the department&apos;s Room Allocation Time Table: a &quot;Room Name: …&quot; line above each room&apos;s table. Only the rooms in the
          file are changed. You will see every change before anything is saved, and it takes effect from {effective}.
        </p>
      </div>
      <form action={check} className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-brand-300 p-4 dark:border-brand-800">
        <input
          name="file"
          type="file"
          required
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 dark:file:bg-brand-500 dark:file:text-black"
        />
        <button type="submit" disabled={busy} aria-busy={busy} className="btn-secondary">
          {busy ? (
            <>
              <Spinner className="h-4 w-4" /> Reading…
            </>
          ) : (
            <>
              <IconUpload className="h-4 w-4" /> Check for changes
            </>
          )}
        </button>
        {busy && <LoadingOverlay label="Reading the timetable and comparing it…" />}
      </form>

      {preview.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">
          {preview.error}
        </p>
      )}
      {preview.warnings && preview.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {preview.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}

      {preview.payload && changes.length === 0 && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm dark:bg-brand-950">
          No changes: the file matches the current timetable for {preview.rooms?.length} {preview.rooms?.length === 1 ? "room" : "rooms"}.
        </p>
      )}

      {preview.payload && changes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-semibold">{changes.length}</span> {changes.length === 1 ? "cell changes" : "cells change"} across{" "}
            {new Set(changes.map((c) => c.room)).size} of the {preview.rooms?.length} rooms in the file.
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-brand-100 dark:border-brand-900">
            <table className="w-full min-w-[640px]">
              <thead className="thead-ink sticky top-0">
                <tr>
                  <th className="th">Room</th>
                  <th className="th">Day</th>
                  <th className="th">Slot</th>
                  <th className="th">Now</th>
                  <th className="th">From {effective}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
                {changes.map((c) => (
                  <tr key={`${c.room}|${c.weekday}|${c.slot}`}>
                    <td className="td font-medium">{c.room}</td>
                    <td className="td">{DAYS[c.weekday - 1]}</td>
                    <td className="td whitespace-nowrap">{slotLabel.get(c.slot)}</td>
                    <td className="td muted">{c.before}</td>
                    <td className="td font-medium">{c.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={applyTimetableUpload} className="flex justify-end">
            <input type="hidden" name="payload" value={preview.payload} />
            <SubmitButton pendingText="Saving…" message="Saving the new timetable…">
              <IconCheck className="h-4 w-4" /> Apply {changes.length} {changes.length === 1 ? "change" : "changes"}
            </SubmitButton>
          </form>
        </div>
      )}
    </section>
  );
}
