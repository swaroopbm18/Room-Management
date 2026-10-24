import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import { getDaySchedule, getSlots } from "@/lib/data";
import { DATE_RE, defaultSlot, formatDate, isSunday, todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string }> }) {
  const sp = await searchParams;
  const slots = await getSlots();
  const fallback = defaultSlot(slots);
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : fallback.date;
  const slotId = slots.some((s) => String(s.id) === sp.slot) ? Number(sp.slot) : fallback.slotId;
  const slot = slots.find((s) => s.id === slotId)!;

  const day = await getDaySchedule(date);
  const rows = day.filter((r) => r.slot_id === slotId);
  const freeToday = day.filter((r) => r.status === "free" && !r.ended).length;
  const freeNow = rows.filter((r) => r.status === "free").length;
  const totalRooms = rows.length;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Classroom allotment</h1>
          <p className="mt-1 text-lg text-brand-700 dark:text-brand-300">
            {formatDate(date, { weekday: "long" })} · {slot.label} <span className="muted text-sm">IST</span>
          </p>
        </div>
        <AutoSubmitSelect
          name="slot"
          label="Slot"
          value={String(slotId)}
          options={slots.map((s) => ({ value: String(s.id), label: s.label }))}
        />
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard
          label={date === todayIST() ? "Free slots today" : `Free slots on ${formatDate(date, { weekday: "long", day: undefined, month: undefined, year: undefined })}`}
          value={freeToday}
          hint={date === todayIST() ? "Room-slots still free for the rest of the day" : `Room-slots free on ${formatDate(date)}`}
          href={`/free?date=${date}`}
          linkText="Explore free slots"
        />
        <KpiCard label="Free rooms in this slot" value={freeNow} hint={slot.label} />
        <KpiCard label="Rooms" value={totalRooms} hint={`${totalRooms - freeNow} in use in this slot`} />
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-brand-50 dark:bg-brand-950">
              <tr>
                <th className="th w-28 sm:w-40">Classroom</th>
                <th className="th">Subject</th>
                <th className="th">Faculty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
              {rows.map((r) => (
                <tr key={r.room_id} className="hover:bg-brand-50/50 dark:hover:bg-brand-950/40">
                  <td className="td font-medium">{r.room_name}</td>
                  <td className="td">
                    {r.status === "free" ? (
                      <span className="muted">—</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{r.subject}</span>
                        {r.status !== "class" && <StatusBadge status={r.status} />}
                      </div>
                    )}
                    {r.reason && r.status !== "free" && <div className="muted mt-0.5 text-xs">{r.reason}</div>}
                  </td>
                  <td className="td">
                    {r.status === "free" ? (
                      <StatusBadge status="free" />
                    ) : r.status === "department" ? (
                      <span className="muted">{r.subject} department</span>
                    ) : (
                      r.faculty_name ?? <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
