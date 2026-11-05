import DateInput from "@/components/DateInput";
import Flash from "@/components/Flash";
import { IconCalendarCheck, IconFlag } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import PrintButton from "@/components/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import { getDaySchedule, getHolidays, getRooms, getSlots } from "@/lib/data";
import { kindLabel } from "@/lib/rooms";
import { parseGroups, planSeating } from "@/lib/seating";
import { DATE_RE, formatDate, todayIST, workingDay } from "@/lib/time";
import SlotRange from "../allot/SlotRange";
import { blockCieWeek } from "../../actions";

export const dynamic = "force-dynamic";

const SHARES = [
  ["1", "Every seat"],
  ["0.75", "Three in four seats"],
  ["0.5", "Every other seat"],
] as const;

/** Splits classes across the rooms free for a CIE, prints a seating sheet per room and books them. */
export default async function Seating({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string; classes?: string; share?: string; title?: string; msg?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const [slots, holidays, rooms] = await Promise.all([getSlots(), getHolidays(), getRooms()]);
  const date = sp.date && DATE_RE.test(sp.date) ? sp.date : workingDay(todayIST(), holidays);
  const fromI = Math.max(0, slots.findIndex((s) => String(s.id) === sp.from));
  const toI = Math.max(fromI, slots.findIndex((s) => String(s.id) === sp.to));
  const picked = slots.slice(fromI, toI + 1);
  const share = Number(SHARES.find(([v]) => v === sp.share)?.[0] ?? "0.5");
  const title = (sp.title ?? "").trim() || "CIE";
  const { groups, bad } = parseGroups(sp.classes ?? "");
  const asked = groups.length > 0;
  const day = asked ? await getDaySchedule(date) : [];
  const free = rooms.filter((r) => picked.every((s) => day.some((d) => d.room_id === r.id && d.slot_id === s.id && (d.status === "free" || (d.status === "cie" && d.subject === title)))));
  // Rooms already booked for this exam stay in the plan, so it reads the same after booking
  const { plan, unseated, spare } = asked ? planSeating(groups, free, share) : { plan: [], unseated: [], spare: [] };
  const noSeats = free.filter((r) => !r.capacity);
  const total = groups.reduce((n, g) => n + g.students, 0);
  const time = picked.length ? `${picked[0].label.split(" – ")[0]} – ${picked[picked.length - 1].label.split(" – ")[1]}` : "";
  const back = `/admin/seating?${new URLSearchParams({ date, from: String(picked[0]?.id ?? ""), to: String(picked[picked.length - 1]?.id ?? ""), classes: sp.classes ?? "", share: String(share), title }).toString()}`;

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
        <PageHeader title="CIE seating planner" subtitle="Type each class and its number of students. The planner fills the rooms free at that time, biggest first, prints a seating sheet for each room's door and can book the rooms for the CIE." />
        <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="st-date">Date</label>
            <DateInput id="st-date" name="date" defaultValue={date} holidays={Object.fromEntries(holidays)} />
          </div>
          <div className="sm:col-span-1 lg:col-span-2">
            <SlotRange slots={slots} idPrefix="st-" initialFrom={fromI} initialTo={toI} />
          </div>
          <div>
            <label className="label" htmlFor="st-share">Seating</label>
            <select id="st-share" name="share" defaultValue={String(share)} className="input">
              {SHARES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="st-classes">Classes and students, one per line</label>
            <textarea id="st-classes" name="classes" rows={5} defaultValue={sp.classes} className="input font-mono text-sm" placeholder={"3A 64\n3B 62\n5A 58"} />
          </div>
          <div className="flex flex-col justify-between gap-3">
            <div>
              <label className="label" htmlFor="st-title">Exam name</label>
              <input id="st-title" name="title" maxLength={60} defaultValue={sp.title} className="input" placeholder="e.g. CIE 2 · DBMS" />
            </div>
            <button className="btn-primary">
              <IconCalendarCheck className="h-4 w-4" /> Plan seating
            </button>
          </div>
        </form>
        {bad.length > 0 && <Flash error={`Couldn't read: ${bad.join(" · ")}. Write each line as the class and a number, e.g. 3A 64.`} />}
      </div>

      {asked && (
        <>
          <section className="space-y-3 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {formatDate(date)} · {time}
                <span className="muted ml-2 text-sm font-normal">
                  {total} students in {plan.length} room{plan.length === 1 ? "" : "s"} · {spare.length} free room{spare.length === 1 ? "" : "s"} to spare
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {plan.length > 0 && <PrintButton label="Print seating sheets" />}
                {plan.length > 0 && !plan.every((p) => picked.every((s) => day.some((d) => d.room_id === p.room.id && d.slot_id === s.id && d.status === "cie"))) && (
                  <form action={blockCieWeek}>
                    <input type="hidden" name="back" value={back} />
                    {plan.map((p) => (
                      <input key={p.room.id} type="hidden" name="rooms" value={p.room.id} />
                    ))}
                    <input type="hidden" name="from_date" value={date} />
                    <input type="hidden" name="to_date" value={date} />
                    <input type="hidden" name="from" value={picked[0]?.id} />
                    <input type="hidden" name="to" value={picked[picked.length - 1]?.id} />
                    <input type="hidden" name="kind" value="cie" />
                    <input type="hidden" name="title" value={title} />
                    <input type="hidden" name="reason" value={`Seating: ${groups.map((g) => g.name).join(", ")}`} />
                    <SubmitButton pendingText="Booking…" message="Booking the rooms for the CIE…" confirm={`Book ${plan.map((p) => p.room.name).join(", ")} for ${title} on ${formatDate(date)}, ${time}?`}>
                      <IconFlag className="h-4 w-4" /> Book these {plan.length} rooms
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
            {unseated.length > 0 && (
              <Flash error={`Not enough free seats: ${unseated.map((u) => `${u.group} roll ${u.from}–${u.to}`).join(", ")} have no room. Use more seats per room or pick another time.`} />
            )}
            {noSeats.length > 0 && <p className="muted text-xs">Skipped {noSeats.map((r) => r.name).join(", ")}: no seat count yet. Add it under Room details.</p>}
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-brand-50 text-left text-xs text-brand-800 uppercase dark:bg-brand-950 dark:text-brand-200">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Room</th>
                    <th className="px-3 py-2.5 font-semibold">Seats used</th>
                    <th className="px-3 py-2.5 font-semibold">Students</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
                  {plan.map((p) => (
                    <tr key={p.room.id}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{p.room.name}</div>
                        <div className="muted text-xs">
                          {kindLabel(p.room.kind)} · {p.room.capacity} seats
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {p.used} of {p.seats}
                      </td>
                      <td className="px-3 py-2.5">{p.parts.map((x) => `${x.group} roll ${x.from}–${x.to}`).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* One sheet per room for its door */}
          <div className="hidden print:block">
            {plan.map((p) => (
              <section key={p.room.id} className="flex min-h-[90vh] break-after-page flex-col items-center justify-center gap-6 text-center">
                <div className="text-xl">BMSCE · Department of Machine Learning</div>
                <div className="text-3xl font-semibold">{title}</div>
                <div className="text-xl">
                  {formatDate(date, { weekday: "long" })} · {time}
                </div>
                <div className="text-7xl font-bold">{p.room.name}</div>
                <table className="mt-4 text-2xl">
                  <tbody>
                    {p.parts.map((x) => (
                      <tr key={x.group}>
                        <td className="px-6 py-2 text-left font-semibold">Class {x.group}</td>
                        <td className="px-6 py-2 text-left">
                          Roll {x.from} to {x.to}
                        </td>
                        <td className="px-6 py-2 text-right">{x.to - x.from + 1} students</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
