import { IconFile, IconTrash } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getClassSemesters, getTimetablePdfs } from "@/lib/data";
import { formatDateTime, todayIST } from "@/lib/time";
import { pdfLabel, pdfUrl, sizeLabel, type TimetablePdf } from "@/lib/timetablePdfs";
import { deleteTimetablePdf } from "../../actions/timetable";
import AreaTabs from "../AreaTabs";
import { BulkPdfUpload, PdfSlotUpload } from "./PdfUpload";

export const dynamic = "force-dynamic";

/**
 * The official timetable PDFs, one per semester or section, kept as the timetable office issued
 * them. Students and faculty open them from the class timetable and their dashboard.
 */
export default async function TimetablePdfs() {
  const [semesters, pdfs] = await Promise.all([getClassSemesters(todayIST()), getTimetablePdfs()]);
  const byKey = new Map(pdfs.map((p) => [p.key, p]));
  // Semesters 3 to 8, each with its sections in the timetable, plus any semester only a PDF names
  const groups = new Map<string, string[]>(["3", "4", "5", "6", "7", "8"].map((sem) => [sem, []]));
  for (const s of semesters) groups.set(s.sem, s.classes.filter((c) => c.length > 1));
  for (const p of pdfs) {
    if (!/^[1-8]/.test(p.key)) continue;
    const list = groups.get(p.key[0]) ?? [];
    if (p.key.length > 1 && !list.includes(p.key)) list.push(p.key);
    groups.set(p.key[0], list.sort());
  }
  const sems = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const options = ["ALL", "FACULTY", ...sems.flatMap(([sem, classes]) => [sem, ...classes])];

  const row = (key: string, hint?: string) => {
    const pdf = byKey.get(key);
    return (
      <tr key={key}>
        <td className="td">
          <span className="font-medium">{pdfLabel(key)}</span>
          {hint && <div className="muted text-xs">{hint}</div>}
        </td>
        <td className="td">{pdf ? <PdfLink pdf={pdf} /> : <span className="muted text-sm">Not uploaded</span>}</td>
        <td className="td">
          <div className="flex items-start justify-end gap-3">
            <PdfSlotUpload pdfKey={key} replace={!!pdf} />
            {pdf && (
              <form action={deleteTimetablePdf}>
                <input type="hidden" name="key" value={key} />
                <SubmitButton
                  className="inline-flex items-center gap-1 py-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  pendingText="Removing…"
                  message="Removing the PDF…"
                  confirm={`Remove the timetable PDF for ${pdfLabel(key).toLowerCase()}? Students will no longer see it.`}
                  confirmLabel="Remove"
                >
                  <IconTrash className="h-3.5 w-3.5" /> Remove
                </SubmitButton>
              </form>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-8">
      <AreaTabs area="timetables" current="/admin/timetable-pdfs" />
      <PageHeader
        title="Timetable PDFs"
        subtitle="Upload the timetable office's PDF for each semester or section. Students see it on their class timetable and faculty on their dashboard. The PDFs are shown as they are: the room timetable on this site still comes from the Word upload on Room timetable."
      />

      <BulkPdfUpload options={options} uploaded={[...byKey.keys()]} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">By semester and section</h2>
        <p className="muted mb-3 text-sm">
          A class shows its section&apos;s PDF; if there is none, its semester&apos;s; and if there is none, the PDF of all classes.
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="thead-ink">
              <tr>
                <th className="th">For</th>
                <th className="th">PDF</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
              {row("ALL", "One PDF with every class's timetable")}
              {row("FACULTY", "Every faculty member's own timetable")}
              {sems.map(([sem, classes]) => [row(sem), ...classes.map((c) => row(c))])}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PdfLink({ pdf }: { pdf: TimetablePdf }) {
  return (
    <div className="text-sm">
      <a href={pdfUrl(pdf.path)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline dark:text-brand-300">
        <IconFile className="h-4 w-4 shrink-0" /> <span className="break-all">{pdf.file_name || "Timetable.pdf"}</span>
      </a>
      <div className="muted text-xs">
        {sizeLabel(pdf.size_bytes)} · {formatDateTime(pdf.uploaded_at)}
        {pdf.uploaded_by ? ` · ${pdf.uploaded_by}` : ""}
      </div>
    </div>
  );
}
