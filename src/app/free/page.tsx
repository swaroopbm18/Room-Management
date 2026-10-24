import Link from "next/link";
import { IconClock, IconPlus } from "@/components/Icons";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import PageHeader from "@/components/PageHeader";
import { getPerson } from "@/lib/auth";
import { getDaySchedule } from "@/lib/data";
import { bookableDates, DATE_RE, formatDate, isSunday, todayIST, workingDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function FreeSlots({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const dates = bookableDates();
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : workingDay(todayIST());
  const [person, day] = await Promise.all([getPerson(), getDaySchedule(date)]);
  const canRequest = !!person && dates.includes(date);

  const free = day.filter((r) => r.status === "free" && !r.ended);
  const bySlot = new Map<number, typeof free>();
  for (const r of free) bySlot.set(r.slot_id, [...(bySlot.get(r.slot_id) ?? []), r]);

  return (
    <div>
      <PageHeader
        title="Free slots"
        subtitle={
          <>
            {free.length} free room-slots on {formatDate(date, { weekday: "long" })}
            {!person && " · Faculty can sign in to request a room"}
          </>
        }
      >
        <AutoSubmitSelect
          name="date"
          label="Date"
          value={date}
          options={(dates.includes(date) ? dates : [date, ...dates]).map((d) => ({ value: d, label: formatDate(d) }))}
        />
      </PageHeader>

      {free.length === 0 ? (
        <div className="card muted p-10 text-center">No free slots left on this day.</div>
      ) : (
        <div className="space-y-4">
          {[...bySlot.entries()].map(([slotId, rooms]) => (
            <section key={slotId} className="card p-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 font-semibold">
                  <span className="rounded-lg bg-brand-900 p-1.5 text-white dark:bg-brand-800">
                    <IconClock className="h-4 w-4" />
                  </span>
                  {rooms[0].slot_label}
                </h2>
                <span className="muted text-sm">{rooms.length} free</span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {rooms.map((r) => (
                  <li key={r.room_id}>
                    {canRequest ? (
                      <Link
                        href={`/request?room=${encodeURIComponent(r.room_id)}&date=${date}&slot=${slotId}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-brand-200 px-3 py-1.5 text-sm hover:border-brand-500 hover:bg-brand-50 dark:border-brand-800 dark:hover:bg-brand-950"
                        title={r.reason ?? undefined}
                      >
                        <span className="font-medium">{r.room_name}</span>
                        <span className="inline-flex items-center gap-0.5 text-brand-600 dark:text-brand-400">
                          <IconPlus className="h-3.5 w-3.5" />
                          Request
                        </span>
                      </Link>
                    ) : (
                      <span
                        className="inline-flex rounded-lg border border-brand-100 px-3 py-1.5 text-sm dark:border-brand-900"
                        title={r.reason ?? undefined}
                      >
                        {r.room_name}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
