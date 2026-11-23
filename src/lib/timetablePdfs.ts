// The official timetable PDFs: one per semester ("3") or section ("3A"), one of every class
// ("ALL") and one of every faculty member ("FACULTY"). Stored as uploaded, in the public
// "timetables" bucket.

export type TimetablePdf = { key: string; path: string; file_name: string; size_bytes: number; uploaded_by: string; uploaded_at: string };

export const PDF_BUCKET = "timetables";
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const KEY_RE = /^([1-8][A-Z]?|ALL|FACULTY)$/;

/** What a key is for, in words: "Class 3A", "Semester 3", "All classes", "All faculty". */
export function pdfLabel(key: string) {
  if (key === "ALL") return "All classes";
  if (key === "FACULTY") return "All faculty (individual timetables)";
  return key.length === 1 ? `Semester ${key} (all sections)` : `Class ${key}`;
}

/**
 * The key a file is most likely for, from its name: "3A.pdf", "Sem 5 C.pdf" or "TT_3A_2026.pdf"
 * give a section, "Semester 3.pdf" a semester, "INDIV_TT…" the faculty PDF and "CLASS_TT…" all
 * classes. Empty when the name doesn't say, so the admin picks.
 */
export function guessPdfKey(fileName: string): string {
  const name = fileName.replace(/\.pdf$/i, "").toUpperCase();
  if (/INDIV|FACULTY|STAFF/.test(name)) return "FACULTY";
  const section = name.match(/(?<![A-Z0-9])(?:SEM(?:ESTER)?[\s_-]*)?([1-8])[\s_-]?([A-H])(?![A-Z0-9])/);
  if (section) return section[1] + section[2];
  const semester = name.match(/SEM(?:ESTER)?[\s_-]*([1-8])(?![0-9])/) ?? name.match(/(?<![A-Z0-9])([1-8])(?:ST|ND|RD|TH)?[\s_-]*SEM/);
  if (semester) return semester[1];
  if (/CLASS|\bALL\b/.test(name)) return "ALL";
  return "";
}

/** The PDF to show for a class: its section's, else its semester's, else the one of all classes. */
export function pdfForClass(pdfs: TimetablePdf[], cls: string | undefined): TimetablePdf | undefined {
  const byKey = new Map(pdfs.map((p) => [p.key, p]));
  const k = String(cls ?? "").toUpperCase();
  return (KEY_RE.test(k) && k !== "FACULTY" ? byKey.get(k) ?? byKey.get(k[0]) : undefined) ?? byKey.get("ALL");
}

/** Public link to a stored PDF. */
export const pdfUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PDF_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;

export const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
