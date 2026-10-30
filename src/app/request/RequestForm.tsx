"use client";

import LoadingOverlay from "@/components/LoadingOverlay";
import Spinner from "@/components/Spinner";
import { useRouter } from "next/navigation";
import { IconAlert, IconCheck, IconFlag, IconUpload, IconUsers } from "@/components/Icons";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SlotStatus } from "@/lib/types";
import { clashText, findClashes, type BusyAt, type SectionRow } from "@/lib/clashes";

const MAX_BYTES = 5 * 1024 * 1024;

type RoomSlot = { id: number; label: string; status: SlotStatus; ended: boolean; subject: string | null };

export default function RequestForm({
  room,
  date,
  initialSlot,
  slots,
  email,
  subjects,
  busy: busyAt,
  day,
}: {
  room: string;
  date: string;
  initialSlot: number;
  slots: RoomSlot[]; // this room's slots for the day, in time order
  email: string;
  subjects: string[]; // allotted to this faculty member by an admin
  busy: ({ slot_id: number } & BusyAt)[]; // what the requester is doing that day
  day: SectionRow[]; // every class that day, for section clashes
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([initialSlot]);
  const [type, setType] = useState<"class" | "event">("class");
  const [subject, setSubject] = useState<string | null>(subjects.length === 1 ? subjects[0] : null);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pos = (id: number) => slots.findIndex((s) => s.id === id);
  const clashes = findClashes({
    room,
    slotIds: [...selected].sort((a, b) => pos(a) - pos(b)),
    subject: type === "class" ? subject : null,
    busy: new Map(busyAt.map((b) => [b.slot_id, b])),
    day,
  });
  const startOf = (id: number) => slots.find((s) => s.id === id)?.label.split(" – ")[0] ?? "";
  const selectable = (s: RoomSlot) => s.status === "free" && !s.ended;

  // Keep the selection one unbroken run of free slots: extend at either end, shrink from
  // either end, or start over from a slot that isn't next to it.
  function toggle(id: number) {
    const sel = [...selected].sort((a, b) => pos(a) - pos(b));
    const first = pos(sel[0]);
    const last = pos(sel[sel.length - 1]);
    const p = pos(id);
    if (sel.includes(id)) {
      if (sel.length === 1) return;
      if (p === first) setSelected(sel.slice(1));
      else if (p === last) setSelected(sel.slice(0, -1));
      else setSelected(sel.filter((x) => pos(x) < p));
    } else if (p === last + 1 || p === first - 1) {
      setSelected([...sel, id]);
    } else {
      setSelected([id]);
    }
  }

  function pickFile(f: File | null) {
    setError(null);
    if (f && f.type !== "application/pdf") return setError("The permission letter must be a PDF."), setFile(null);
    if (f && f.size >= MAX_BYTES) return setError("The permission letter must be under 5 MB."), setFile(null);
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (type === "class" && subjects.length === 0) return setError("No subjects are allotted to you yet. Ask an admin to add your subjects.");
    if (type === "class" && !subject) return setError("Pick the subject the class is for.");
    if (description.trim().length < 5) return setError("Please describe what the room is for.");
    setBusy(true);
    const supabase = createClient();
    let pdfPath: string | null = null;
    if (type === "event" && file) {
      pdfPath = `${email}/${crypto.randomUUID()}.pdf`;
      const up = await supabase.storage.from("letters").upload(pdfPath, file, { contentType: "application/pdf" });
      if (up.error) {
        setBusy(false);
        return setError(`Upload failed: ${up.error.message}`);
      }
    }
    const { error } = await supabase.rpc("create_group_request", {
      p_room: room,
      p_date: date,
      p_slots: [...selected].sort((a, b) => pos(a) - pos(b)),
      p_type: type,
      p_description: description,
      p_pdf_path: pdfPath,
      p_subject: type === "class" ? subject : null,
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    router.push("/faculty?msg=" + encodeURIComponent("Request sent. An admin will review it."));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6">
      <fieldset>
        <legend className="label">Slots</legend>
        <p className="muted mb-2 text-xs">
          Pick one slot, or several in a row for a longer class or event. Selected: {selected.length}{" "}
          {selected.length === 1 ? "slot" : "slots"}.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {slots.map((s) => {
            const on = selected.includes(s.id);
            const ok = selectable(s);
            return (
              <button
                key={s.id}
                type="button"
                disabled={!ok}
                onClick={() => toggle(s.id)}
                aria-pressed={on}
                className={`rounded-lg border px-2 py-2 text-left text-xs transition-colors ${
                  on
                    ? "border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500 dark:text-black"
                    : ok
                      ? "border-dashed border-brand-300 hover:border-brand-500 hover:bg-brand-50 dark:border-brand-800 dark:hover:bg-brand-950"
                      : "cursor-not-allowed border-transparent bg-neutral-100 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600"
                }`}
              >
                <div className="font-semibold">{s.label.split(" – ")[0]}</div>
                <div className="truncate opacity-80">{ok ? (on ? "Selected" : "Free") : s.ended ? "Ended" : s.subject ?? "Taken"}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Request type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { v: "class" as const, t: "Request for class", d: "Extra or make-up class. No letter needed." },
            { v: "event" as const, t: "Request for event", d: "Attach the permission letter as a PDF under 5 MB." },
          ].map((o) => (
            <label
              key={o.v}
              className={`cursor-pointer rounded-xl border p-4 ${
                type === o.v ? "border-brand-500 bg-brand-50 dark:bg-brand-950" : "border-brand-100 dark:border-brand-900"
              }`}
            >
              <input type="radio" name="type" value={o.v} checked={type === o.v} onChange={() => setType(o.v)} className="sr-only" />
              <div className="flex items-center gap-2 font-medium">
                {o.v === "class" ? <IconUsers className="h-4 w-4" /> : <IconFlag className="h-4 w-4" />}
                {o.t}
              </div>
              <div className="muted mt-0.5 text-xs">{o.d}</div>
            </label>
          ))}
        </div>
      </fieldset>

      {type === "class" && (
        <fieldset>
          <legend className="label">
            Subject <span className="text-red-600">*</span>
          </legend>
          {subjects.length === 0 ? (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              No subjects are allotted to you yet. Ask an admin to add your subjects, then request the room for a class.
            </p>
          ) : (
            <>
              <p className="muted mb-2 text-xs">Your subjects, as allotted by the admin.</p>
              <div className="flex flex-wrap gap-2">
                {subjects.map((sub) => (
                  <label
                    key={sub}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      subject === sub
                        ? "border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500 dark:text-black"
                        : "border-brand-200 hover:border-brand-500 hover:bg-brand-50 dark:border-brand-800 dark:hover:bg-brand-950"
                    }`}
                  >
                    <input type="radio" name="subject" value={sub} checked={subject === sub} onChange={() => setSubject(sub)} className="sr-only" />
                    {sub}
                  </label>
                ))}
              </div>
            </>
          )}
        </fieldset>
      )}

      <div>
        <label className="label" htmlFor="description">
          Description <span className="text-red-600">*</span>
        </label>
        <textarea
          id="description"
          required
          minLength={5}
          maxLength={500}
          rows={4}
          className="input"
          placeholder={type === "class" ? "e.g. Make-up class, unit 4" : "e.g. IEEE student branch workshop on LLMs"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {type === "event" && (
        <div>
          <label className="label" htmlFor="letter">
            <span className="inline-flex items-center gap-1.5">
              <IconUpload className="h-4 w-4" /> Permission letter (PDF, under 5 MB)
            </span>
          </label>
          <p className="mb-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Uploading the permission letter is mandatory. If it is not uploaded, the admin can reject the request.
          </p>
          <input
            id="letter"
            type="file"
            accept="application/pdf"
            className="input file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1 file:text-white"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file && <div className="muted mt-1 text-xs">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div>}
        </div>
      )}

      {clashes.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <IconAlert className="h-4 w-4 shrink-0" /> Possible clash
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-6">
            {clashes.map((c, i) => (
              <li key={i}>{clashText(c, "You", startOf(c.slot_id))}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs opacity-80">You can still send the request; the admin sees the same warning.</p>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy || (type === "class" && subjects.length === 0)}>
          {busy ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
      {busy && <LoadingOverlay label={type === "event" && file ? "Uploading the letter and sending your request…" : "Sending your request…"} />}
    </form>
  );
}
