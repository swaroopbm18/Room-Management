import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { displayName, requireStaff } from "@/lib/auth";
import { getDaySchedule, getFacultyStatus, getHolidays } from "@/lib/data";
import { sectionRows } from "@/lib/clashes";
import { createClient } from "@/lib/supabase/server";
import { addDays, bookableDates, DATE_RE, formatDate } from "@/lib/time";
import RequestForm from "./RequestForm";

export const dynamic = "force-dynamic";

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; date?: string; slot?: string }>;
}) {
  const sp = await searchParams;
  const person = await requireStaff();
  const date = sp.date && DATE_RE.test(sp.date) ? sp.date : "";
  const holidays = await getHolidays();
  const day = date && !holidays.has(date) ? await getDaySchedule(date) : [];
  const row = day.find((r) => r.room_id === sp.room && String(r.slot_id) === sp.slot);

  if (!row || row.status !== "free" || row.ended) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold">This slot is not free</h1>
        <p className="muted mt-2 text-sm">Only free slots can be requested. Pick another one from the list.</p>
        <Link href={`/free${date ? `?date=${date}` : ""}`} className="btn-primary mt-6">
          See free slots
        </Link>
      </div>
    );
  }

  const roomDay = day
    .filter((r) => r.room_id === row.room_id)
    .map((r) => ({ id: r.slot_id, label: r.slot_label, status: r.status, ended: r.ended, subject: r.subject }));

  const supabase = await createClient();
  const { data: subjectRows } = await supabase.from("faculty_subjects").select("subject").eq("email", person.email).order("subject");
  const subjects = (subjectRows ?? []).map((r) => r.subject as string);
  // The same weekday in the following weeks, while bookings are open (holidays are refused when sent)
  const open = bookableDates();
  const weeks = [1, 2, 3].map((k) => addDays(date, 7 * k)).filter((d) => open.includes(d) && !holidays.has(d)).map((d) => ({ date: d, label: formatDate(d) }));
  // What the requester is doing in each slot that day, for clash warnings
  const status = person.initials ? await getFacultyStatus(date) : null;
  const busy = (status ?? []).filter((f) => f.initials === person.initials && f.busy).map((f) => ({ slot_id: f.slot_id, activity: f.activity, room_id: f.room_id }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Request a room" subtitle={`Requesting as ${displayName(person)} (${person.email})`} />
      <div className="card mb-6 grid grid-cols-2 divide-x divide-brand-100 dark:divide-brand-900">
        {[
          ["Room", row.room_name],
          ["Date", formatDate(date)],
        ].map(([k, v]) => (
          <div key={k} className="p-4">
            <div className="muted text-xs uppercase">{k}</div>
            <div className="mt-0.5 font-medium">{v}</div>
          </div>
        ))}
      </div>
      <RequestForm room={row.room_id} date={date} initialSlot={row.slot_id} slots={roomDay} email={person.email} subjects={subjects} busy={busy} day={sectionRows(day)} weeks={weeks} />
    </div>
  );
}
