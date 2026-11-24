"use client";

import { useState } from "react";
import { IconAlert, IconDownload, IconUpload } from "@/components/Icons";
import SubmitButton from "@/components/SubmitButton";
import { readHolidaySheet, type SheetResult } from "@/lib/holidaySheet";
import { formatDate } from "@/lib/time";
import { importHolidays } from "../../actions/calendar";

type Row = SheetResult["holidays"][number] & { status: "add" | "skip"; why?: string };

/**
 * Upload the holiday list as an Excel sheet (or CSV). It is read here in the browser, every row is
 * shown with what will happen to it, and nothing is saved until Add is pressed.
 */
export default function HolidayUpload({ holidays, tomorrow, back }: { holidays: Record<string, string>; tomorrow: string; back: string }) {
  const [rows, setRows] = useState<Row[]>();
  const [problems, setProblems] = useState<SheetResult["problems"]>([]);
  const [error, setError] = useState<string>();
  const [fileName, setFileName] = useState("");

  async function pick(file: File | undefined) {
    setRows(undefined);
    setProblems([]);
    setError(undefined);
    if (!file) return;
    setFileName(file.name);
    try {
      const sheet = readHolidaySheet(file.name, new Uint8Array(await file.arrayBuffer()));
      const seen = new Set<string>();
      setRows(
        sheet.holidays
          .map((h): Row => {
            const sunday = new Date(h.date + "T00:00:00Z").getUTCDay() === 0;
            const why =
              h.date < tomorrow
                ? "Past date, or today"
                : sunday
                  ? "A Sunday, no classes anyway"
                  : holidays[h.date]
                    ? `Already a holiday: ${holidays[h.date]}`
                    : seen.has(h.date)
                      ? "Same date twice in the sheet"
                      : undefined;
            seen.add(h.date);
            return { ...h, status: why ? "skip" : "add", why };
          })
          .sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row),
      );
      setProblems(sheet.problems);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toAdd = (rows ?? []).filter((r) => r.status === "add");

  return (
    <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900 dark:bg-brand-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Upload holidays from Excel</h3>
          <p className="muted text-sm">
            A sheet with a <b>Date</b> column and a <b>Name</b> column, and optionally <b>Make-up day</b> (write No for a holiday that won&apos;t be made up). Dates like 25/12/2026 or
            25 Dec 2026 work. You see every row before anything is saved.
          </p>
        </div>
        <a href="/admin/holidays/template" className="btn-secondary py-1.5 text-sm" download>
          <IconDownload className="h-4 w-4" /> Template
        </a>
      </div>
      <label className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-brand-300 p-3 dark:border-brand-800">
        <span className="sr-only">Holiday sheet</span>
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => pick(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 dark:file:bg-brand-500 dark:file:text-black"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">
          {error}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {problems.slice(0, 8).map((p) => (
            <li key={`${p.row}${p.text}`} className="flex gap-2">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" /> {p.row ? `Row ${p.row}: ` : ""}
              {p.text}, left out
            </li>
          ))}
          {problems.length > 8 && <li>and {problems.length - 8} more rows left out</li>}
        </ul>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <div className="max-h-96 overflow-auto rounded-lg border border-brand-100 bg-white dark:border-brand-900 dark:bg-transparent">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="thead-ink sticky top-0">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Holiday</th>
                  <th className="th">Make-up day</th>
                  <th className="th">Will be</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
                {rows.map((r) => (
                  <tr key={`${r.row}`} className={r.status === "skip" ? "opacity-60" : ""}>
                    <td className="td whitespace-nowrap font-medium">{formatDate(r.date, { weekday: "short" })}</td>
                    <td className="td">{r.name}</td>
                    <td className="td">{r.makeup ? "Yes, suggested" : "No make-up day"}</td>
                    <td className="td">
                      {r.status === "add" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">Added</span>
                      ) : (
                        <span className="muted text-xs">Skipped: {r.why}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {toAdd.length > 0 ? (
            <form action={importHolidays} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="holidays" value={JSON.stringify(toAdd.map(({ date, name, makeup }) => ({ date, name, makeup })))} />
              <SubmitButton pendingText="Adding…" message={`Adding ${toAdd.length} holiday${toAdd.length === 1 ? "" : "s"}…`}>
                <IconUpload className="h-4 w-4" /> Add {toAdd.length} holiday{toAdd.length === 1 ? "" : "s"}
              </SubmitButton>
              <span className="muted text-sm">from {fileName}. They show on the home page, room weeks and every date list at once.</span>
            </form>
          ) : (
            <p className="muted text-sm">Nothing new to add from {fileName}.</p>
          )}
        </div>
      )}
    </div>
  );
}
