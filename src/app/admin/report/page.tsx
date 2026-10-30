import GetForm from "@/components/GetForm";
import PageHeader from "@/components/PageHeader";
import PrintButton from "@/components/PrintButton";
import { getSlots } from "@/lib/data";
import { getReport } from "@/lib/report";
import { DATE_RE, formatDate, formatDateTime, mondayOf, todayIST } from "@/lib/time";
import SlotRange from "../allot/SlotRange";

export const dynamic = "force-dynamic";

export const metadata = { title: "Report", robots: { index: false } };

export default async function Report({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const start = sp.start && DATE_RE.test(sp.start) ? sp.start : mondayOf(today);
  const end = sp.end && DATE_RE.test(sp.end) && sp.end >= start ? sp.end : today >= start ? today : start;
  const slots = await getSlots();
  const fromIdx = Math.max(0, slots.findIndex((s) => String(s.id) === sp.from));
  const toIdx = sp.to ? Math.max(fromIdx, slots.findIndex((s) => String(s.id) === sp.to)) : slots.length - 1;
  const entries = await getReport(start, end, slots[fromIdx].id, slots[toIdx].id);
  const query = new URLSearchParams({ start, end, from: String(slots[fromIdx].id), to: String(slots[toIdx].id) }).toString();
  const timeRange = fromIdx === 0 && toIdx === slots.length - 1 ? "All slots" : `${slots[fromIdx].label.split(" – ")[0]} – ${slots[toIdx].label.split(" – ")[1]}`;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Report"
          subtitle="Events, CIEs, dropped classes and extra classes (approved requests) between two dates. Print it or save it as a PDF for signatures."
        />
        <GetForm className="card flex flex-wrap items-end gap-3 p-4" message="Preparing the report…">
          <div>
            <label className="label" htmlFor="start">From date</label>
            <input id="start" type="date" name="start" defaultValue={start} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="end">To date</label>
            <input id="end" type="date" name="end" defaultValue={end} className="input" />
          </div>
          <div className="min-w-64">
            <SlotRange slots={slots} idPrefix="r-" initialFrom={fromIdx} initialTo={toIdx} />
          </div>
          <button className="btn-secondary">Show report</button>
          <div className="ml-auto flex flex-wrap gap-2">
            <a href={`/admin/report/csv?${query}`} className="btn-secondary">
              Download CSV
            </a>
            <PrintButton label="Print / save as PDF" className="btn-primary" />
          </div>
        </GetForm>
      </div>

      <article className="card p-6 print:border-0 print:p-0 print:shadow-none">
        <header className="mb-4 text-center">
          <div className="text-lg font-semibold">B.M.S. College of Engineering, Bengaluru</div>
          <div className="text-sm">Department of Machine Learning</div>
          <div className="mt-2 text-base font-semibold">Room allotment report: events, dropped classes and extra classes</div>
          <div className="muted mt-1 text-xs print:text-black">
            {formatDate(start)} to {formatDate(end)} · {timeRange} · Generated {formatDateTime(new Date().toISOString())}
          </div>
        </header>

        <table className="report-table w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-12">Sl. No</th>
              <th>Date</th>
              <th>Time</th>
              <th>Room</th>
              <th>Faculty name</th>
              <th>Type</th>
              <th>Description</th>
              <th className="w-40">Faculty signature</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center">
                  No events, dropped classes or extra classes in this period.
                </td>
              </tr>
            )}
            {entries.map((e, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                <td className="whitespace-nowrap">{formatDate(e.date, { weekday: "short", year: undefined })}</td>
                <td className="whitespace-nowrap">{e.time}</td>
                <td className="whitespace-nowrap">{e.room}</td>
                <td>{e.faculty}</td>
                <td className="whitespace-nowrap">{e.type}</td>
                <td>{e.description}</td>
                <td className="h-10" />
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-16 flex flex-wrap justify-between gap-10 text-sm">
          <div className="flex flex-wrap gap-10">
            <div className="w-56 border-t border-neutral-500 pt-1">HoD (Cluster A)</div>
            <div className="w-56 border-t border-neutral-500 pt-1">HoD (Cluster B)</div>
          </div>
          <div>
            <div className="w-56 border-t border-neutral-500 pt-1">Date</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
