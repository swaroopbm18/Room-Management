"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconAlert, IconCheck, IconFile, IconUpload } from "@/components/Icons";
import LoadingOverlay from "@/components/LoadingOverlay";
import Spinner from "@/components/Spinner";
import { createClient } from "@/lib/supabase/client";
import { guessPdfKey, KEY_RE, MAX_PDF_BYTES, PDF_BUCKET, pdfLabel, sizeLabel } from "@/lib/timetablePdfs";

/** Upload one PDF for a semester or section; returns an error message, or nothing when saved. */
async function uploadPdf(file: File, key: string): Promise<string | undefined> {
  if (!KEY_RE.test(key)) return "Pick the semester or section this PDF is for.";
  if (file.type && file.type !== "application/pdf") return "This is not a PDF.";
  if (file.size >= MAX_PDF_BYTES) return `The PDF must be under ${sizeLabel(MAX_PDF_BYTES)}.`;
  const supabase = createClient();
  const path = `${key}/${crypto.randomUUID()}.pdf`;
  const up = await supabase.storage.from(PDF_BUCKET).upload(path, file, { contentType: "application/pdf" });
  if (up.error) return `Upload failed: ${up.error.message}`;
  const { data: old, error } = await supabase.rpc("admin_save_timetable_pdf", { p_key: key, p_path: path, p_file_name: file.name });
  if (error) {
    await supabase.storage.from(PDF_BUCKET).remove([path]);
    return error.message;
  }
  // The PDF it replaced is no longer needed
  if (old) await supabase.storage.from(PDF_BUCKET).remove([String(old)]);
}

type Row = { id: string; file: File; key: string; state: "ready" | "uploading" | "done" | "error"; error?: string };

/**
 * Bulk upload: pick any number of PDFs, check which semester or section each is for (guessed from
 * its name), then upload them all. A PDF for a semester or section that has one replaces it.
 */
export function BulkPdfUpload({ options, uploaded }: { options: string[]; uploaded: string[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const keys = [...new Set([...options, ...rows.map((r) => r.key).filter(Boolean)])];
  const has = new Set(uploaded);
  const pending = rows.filter((r) => r.state !== "done");
  const dupes = new Set(pending.map((r) => r.key).filter((k, i, a) => k && a.indexOf(k) !== i));

  function pick(list: FileList | null) {
    setError(undefined);
    const files = [...(list ?? [])];
    setRows((old) => [
      ...old.filter((r) => r.state !== "done"),
      ...files.map((file) => ({ id: crypto.randomUUID(), file, key: guessPdfKey(file.name), state: "ready" as const })),
    ]);
  }

  const update = (id: string, patch: Partial<Row>) => setRows((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function uploadAll() {
    if (pending.some((r) => !r.key)) return setError("Pick the semester or section for every PDF first.");
    if (dupes.size) return setError(`Two PDFs are for ${[...dupes].map(pdfLabel).join(", ")}. Keep one for each.`);
    setError(undefined);
    setBusy(true);
    let failed = 0;
    for (const r of pending) {
      update(r.id, { state: "uploading", error: undefined });
      const err = await uploadPdf(r.file, r.key);
      if (err) failed++;
      update(r.id, err ? { state: "error", error: err } : { state: "done" });
    }
    setBusy(false);
    if (failed) setError(`${failed} of ${pending.length} PDFs could not be uploaded. Fix them below and upload again.`);
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">Upload many PDFs at once</h2>
        <p className="muted mt-1 text-sm">
          Pick every timetable PDF together, for example one per section, the PDF of all classes and the PDF of every faculty member&apos;s timetable. Each
          file&apos;s semester or section is guessed from its name (3A.pdf, Sem 5.pdf, CLASS_TT…, INDIV_TT…); check it before uploading. Up to{" "}
          {sizeLabel(MAX_PDF_BYTES)} each.
        </p>
      </div>
      <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-dashed border-brand-300 p-4 text-sm dark:border-brand-800">
        <IconUpload className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        <span className="font-medium">Choose PDFs</span>
        <span className="muted">You can pick several files.</span>
        <input type="file" multiple accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
      </label>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-brand-100 dark:border-brand-900">
          <table className="w-full min-w-[560px]">
            <thead className="thead-ink">
              <tr>
                <th className="th">File</th>
                <th className="th">For</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td">
                    <span className="flex items-center gap-2 font-medium break-all">
                      <IconFile className="h-4 w-4 shrink-0" /> {r.file.name}
                    </span>
                    <span className="muted text-xs">{sizeLabel(r.file.size)}</span>
                  </td>
                  <td className="td">
                    <select
                      aria-label={`Semester or section for ${r.file.name}`}
                      className="input py-1"
                      value={r.key}
                      disabled={busy || r.state === "done"}
                      onChange={(e) => update(r.id, { key: e.target.value, state: "ready", error: undefined })}
                    >
                      <option value="">Pick…</option>
                      {keys.map((k) => (
                        <option key={k} value={k}>{pdfLabel(k)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td text-sm">
                    {r.state === "done" && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <IconCheck className="h-4 w-4" /> Uploaded
                      </span>
                    )}
                    {r.state === "uploading" && (
                      <span className="inline-flex items-center gap-1">
                        <Spinner className="h-4 w-4" /> Uploading…
                      </span>
                    )}
                    {r.state === "error" && <span className="text-red-700 dark:text-red-400">{r.error}</span>}
                    {r.state === "ready" &&
                      (dupes.has(r.key) ? (
                        <span className="text-amber-700 dark:text-amber-400">Another PDF is for this too</span>
                      ) : r.key && has.has(r.key) ? (
                        <span className="muted">Replaces the current PDF</span>
                      ) : (
                        <span className="muted">{r.key ? "New" : "Pick what it is for"}</span>
                      ))}
                  </td>
                  <td className="td text-right">
                    {r.state !== "done" && (
                      <button type="button" disabled={busy} className="text-xs font-medium text-red-600 hover:underline dark:text-red-400" onClick={() => setRows((old) => old.filter((x) => x.id !== r.id))}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p role="alert" className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {pending.length > 0 && (
        <div className="flex justify-end">
          <button type="button" className="btn-primary" disabled={busy} aria-busy={busy} onClick={uploadAll}>
            {busy ? <Spinner className="h-4 w-4" /> : <IconUpload className="h-4 w-4" />} Upload {pending.length} {pending.length === 1 ? "PDF" : "PDFs"}
          </button>
        </div>
      )}
      {busy && <LoadingOverlay label="Uploading the timetable PDFs…" />}
    </section>
  );
}

/** Upload or replace the PDF of one semester or section, straight from its row. */
export function PdfSlotUpload({ pdfKey, replace }: { pdfKey: string; replace: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    const err = await uploadPdf(file, pdfKey);
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <label className={`btn-secondary cursor-pointer py-1 text-xs ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? <Spinner className="h-3.5 w-3.5" /> : <IconUpload className="h-3.5 w-3.5" />}
        {busy ? "Uploading…" : replace ? "Replace" : "Upload PDF"}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={busy}
          aria-label={`${replace ? "Replace" : "Upload"} the PDF for ${pdfLabel(pdfKey)}`}
          onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))}
        />
      </label>
      {error && <span role="alert" className="max-w-56 text-right text-xs text-red-700 dark:text-red-400">{error}</span>}
    </span>
  );
}
