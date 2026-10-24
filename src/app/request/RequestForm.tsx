"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024;

export default function RequestForm({ room, date, slot, email }: { room: string; date: string; slot: number; email: string }) {
  const router = useRouter();
  const [type, setType] = useState<"class" | "event">("class");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickFile(f: File | null) {
    setError(null);
    if (f && f.type !== "application/pdf") return setError("The approval letter must be a PDF."), setFile(null);
    if (f && f.size >= MAX_BYTES) return setError("The approval letter must be under 5 MB."), setFile(null);
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (description.trim().length < 5) return setError("Please describe what the room is for.");
    if (type === "event" && !file) return setError("Attach the approval letter (PDF, under 5 MB).");
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
    const { error } = await supabase.rpc("create_request", {
      p_room: room,
      p_date: date,
      p_slot: slot,
      p_type: type,
      p_description: description,
      p_pdf_path: pdfPath,
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
        <legend className="label">Request type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { v: "class" as const, t: "Request for class", d: "Extra or make-up class. No letter needed." },
            { v: "event" as const, t: "Request for event", d: "Needs the approval letter as a PDF under 5 MB." },
          ].map((o) => (
            <label
              key={o.v}
              className={`cursor-pointer rounded-xl border p-4 ${
                type === o.v ? "border-brand-500 bg-brand-50 dark:bg-brand-950" : "border-brand-100 dark:border-brand-900"
              }`}
            >
              <input type="radio" name="type" value={o.v} checked={type === o.v} onChange={() => setType(o.v)} className="sr-only" />
              <div className="font-medium">{o.t}</div>
              <div className="muted mt-0.5 text-xs">{o.d}</div>
            </label>
          ))}
        </div>
      </fieldset>

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
          placeholder={type === "class" ? "e.g. Make-up class for DBMS-3B, unit 4" : "e.g. IEEE student branch workshop on LLMs"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {type === "event" && (
        <div>
          <label className="label" htmlFor="letter">
            Approval letter (PDF, under 5 MB) <span className="text-red-600">*</span>
          </label>
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

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  );
}
