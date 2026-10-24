import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { ScheduleGrid, type GridRow } from "@/components/DayGrid";
import Flash from "@/components/Flash";
import { IconCalendar, IconCheck, IconPlus, IconX } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { getHolidays, getRooms, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { ScheduleRow } from "@/lib/types";
import { addDays, formatDate, formatDateTime, todayIST } from "@/lib/time";
import { addHoliday, adminEditTimetable, removeHoliday } from "../../actions";
import TimetableUpload from "./TimetableUpload";
import SlotRange from "../allot/SlotRange";

export const dynamic = "force-dynamic";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Entry = { room_id: string; slot_id: number; subject: string; faculty_initials: string[]; faculty_name: string | null; is_department: boolean };
type Change = { id: number; room_id: string; weekday: number; slot_ids: number[]; old_value: string; new_value: string; effective_from: string; changed_by: string; created_at: string };

export default async function EditTimetable({ searchParams }: { searchParams: Promise<{ day?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const tomorrow = addDays(today, 1);
  const isoDay = (d: string) => ((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7) + 1; // 1 = Monday, 7 = Sunday
  const day = Number(sp.day) >= 1 && Number(sp.day) <= 6 ? Number(sp.day) : isoDay(tomorrow) === 7 ? 1 : isoDay(tomorrow);
  // The first date from tomorrow on that falls on the chosen weekday
  const showDate = addDays(tomorrow, (day - isoDay(tomorrow) + 7) % 7);

  const supabase = await createClient();
  const [rooms, slots, holidays, ttRes, changesRes, dirRes, peopleRes] = await Promise.all([
    getRooms(),
    getSlots(),
    getHolidays(),
    supabase.rpc("get_timetable", { p_date: showDate }),
    supabase.from("timetable_changes").select("*").order("id", { ascending: false }).limit(30),
    supabase.from("faculty_directory").select("initials, title, full_name").order("initials"),
    supabase.from("people").select("initials, title, full_name").not("initials", "is", null),
  ]);
  const entries = (ttRes.data ?? []) as Entry[];
  const upcoming = [...holidays.entries()].filter(([d]) => d >= today).sort(([a], [b]) => a.localeCompare(b));
  const changes = (changesRes.data ?? []) as Change[];
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const names = new Map<string, string>();
  for (const p of [...(dirRes.data ?? []), ...(peopleRes.data ?? [])] as { initials: string; title: string | null; full_name: string }[]) {
    names.set(p.initials, `${p.title ? p.title + " " : ""}${p.full_name}`);
  }

  const byCell = new Map(entries.map((e) => [`${e.room_id}|${e.slot_id}`, e]));
  const gridRows: GridRow[] = rooms.map((r) => ({
    key: r.id,
    label: r.name,
    cells: new Map(
      slots.map((s) => {
        const e = byCell.get(`${r.id}|${s.id}`);
        const row: ScheduleRow = {
          room_id: r.id,
          room_name: r.name,
          slot_id: s.id,
          slot_label: s.label,
          starts: s.starts,
          ends: s.ends,
          status: !e ? "free" : e.is_department ? "department" : "class",
          subject: e?.subject ?? null,
          faculty_name: e ? (e.is_department ? `${e.subject} department` : e.faculty_name) : null,
          reason: null,
          is_mine: false,
          ended: false,
        };
        return [s.id, row];
      }),
    ),
  }));

  const rangeLabel = (ids: number[]) => {
    const a = slotById.get(ids[0]);
    const b = slotById.get(ids[ids.length - 1]);
    return a && b ? `${a.label.split(" – ")[0]} – ${b.label.split(" – ")[1]}` : "";
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Edit the regular timetable"
        subtitle={`Changes take effect from tomorrow, ${formatDate(tomorrow, { weekday: "long" })}. Today and every earlier day keep the old subject and faculty.`}
      />
      <Flash msg={sp.msg} error={sp.error} />

      <form action={adminEditTimetable} className="card grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="back" value={`/admin/timetable?day=${day}`} />
        <div>
          <label className="label" htmlFor="weekday">Day of the week</label>
          <select id="weekday" name="weekday" defaultValue={day} className="input">
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="room">Room</label>
          <select id="room" name="room" className="input">
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <SlotRange slots={slots} idPrefix="tt-" />
        </div>
        <div>
          <label className="label" htmlFor="subject">Subject and section</label>
          <input id="subject" name="subject" className="input" placeholder="e.g. DBMS-3B · leave empty to make it free" />
        </div>
        <div>
          <label className="label" htmlFor="initials">Faculty initials</label>
          <input id="initials" name="initials" list="faculty-initials" className="input" placeholder="e.g. AKN, KS" />
          <datalist id="faculty-initials">
            {[...names.entries()].map(([ini, name]) => (
              <option key={ini} value={ini}>{name}</option>
            ))}
          </datalist>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="department" className="h-4 w-4 accent-brand-600" />
          Another department&apos;s class (e.g. CSE)
        </label>
        <div className="flex items-end justify-end">
          <SubmitButton pendingText="Saving…" message="Saving the timetable change…">
            <IconCheck className="h-4 w-4" /> Save change
          </SubmitButton>
        </div>
      </form>

      <TimetableUpload slots={slots} roomIds={rooms.map((r) => r.id)} effective={formatDate(tomorrow, { weekday: "long", year: undefined })} />

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Holidays</h2>
          <p className="muted mt-1 text-sm">No regular classes are shown on a holiday. Holidays can be added from tomorrow on, and past holidays stay as they were.</p>
        </div>
        <form action={addHoliday} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="back" value={`/admin/timetable?day=${day}`} />
          <div>
            <label className="label" htmlFor="h-date">Date</label>
            <input id="h-date" name="date" type="date" required min={tomorrow} className="input" />
          </div>
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="h-name">Name</label>
            <input id="h-name" name="name" required maxLength={80} className="input" placeholder="e.g. Kannada Rajyotsava" />
          </div>
          <SubmitButton pendingText="Adding…" message="Adding the holiday…">
            <IconPlus className="h-4 w-4" /> Add holiday
          </SubmitButton>
        </form>
        {upcoming.length > 0 ? (
          <ul className="divide-y divide-brand-100 rounded-lg border border-brand-100 dark:divide-brand-900 dark:border-brand-900">
            {upcoming.map(([d, name]) => (
              <li key={d} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <IconCalendar className="h-4 w-4 text-brand-500" />
                  <span className="font-medium">{formatDate(d, { weekday: "long" })}</span>
                  <span className="muted">· {name}</span>
                </span>
                {d > today ? (
                  <form action={removeHoliday}>
                    <input type="hidden" name="date" value={d} />
                    <input type="hidden" name="back" value={`/admin/timetable?day=${day}`} />
                    <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Removing…" message="Removing the holiday…">
                      <IconX className="h-3.5 w-3.5" /> Remove
                    </SubmitButton>
                  </form>
                ) : (
                  <span className="muted text-xs">Today</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">No upcoming holidays.</p>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Regular timetable for {DAYS[day - 1]}s <span className="muted text-sm font-normal">from {formatDate(showDate)}</span>
          </h2>
          <AutoSubmitSelect name="day" label="Day" value={String(day)} options={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))} />
        </div>
        <ScheduleGrid corner="Room" slots={slots} rows={gridRows} hint="The regular timetable only, without one-off bookings, CIEs or dropped classes." />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent timetable changes</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="thead-ink">
              <tr>
                <th className="th">Changed at</th>
                <th className="th">Room</th>
                <th className="th">Day & slots</th>
                <th className="th">Before</th>
                <th className="th">After</th>
                <th className="th">From</th>
                <th className="th">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100 dark:divide-brand-900">
              {changes.length === 0 && (
                <tr>
                  <td className="td muted" colSpan={7}>No changes yet. The timetable is as uploaded.</td>
                </tr>
              )}
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className="td whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                  <td className="td font-medium">{c.room_id}</td>
                  <td className="td whitespace-nowrap">
                    {DAYS[c.weekday - 1]}
                    <div className="muted text-xs">{rangeLabel(c.slot_ids)}</div>
                  </td>
                  <td className="td">{c.old_value}</td>
                  <td className="td font-medium">{c.new_value}</td>
                  <td className="td whitespace-nowrap">{formatDate(c.effective_from)}</td>
                  <td className="td text-xs">{c.changed_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
