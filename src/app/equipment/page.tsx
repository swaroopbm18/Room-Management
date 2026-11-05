import RememberFields from "@/components/RememberFields";
import Link from "next/link";
import { IconCheck, IconPlus, IconTrash, IconX } from "@/components/Icons";
import InlineEdit, { Field } from "@/components/InlineEdit";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { requireStaff } from "@/lib/auth";
import { getHolidays, getRooms, getSlots } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { bookableDates, DATE_RE, formatDate, slotEnded, slotOpen, todayIST, weekdayOf, workingDay } from "@/lib/time";
import SlotRange from "../admin/allot/SlotRange";
import { bookEquipment, cancelEquipment, deleteEquipment, editEquipmentBooking, saveEquipment } from "../actions";

export const dynamic = "force-dynamic";

type Item = { id: number; name: string; notes: string; active: boolean };
type Booking = { id: number; equipment_id: number; date: string; slot_id: number; room_id: string | null; purpose: string; booked_by: string; booked_name: string; created_at: string };

/** Portable projectors, mics, speakers and kits: who has what when, and booking one. */
export default async function Equipment({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const person = await requireStaff();
  const admin = person.role === "admin";
  const today = todayIST();
  const [slots, holidays, rooms] = await Promise.all([getSlots(), getHolidays(), getRooms()]);
  const dates = bookableDates().filter((d) => !holidays.has(d));
  const date = sp.date && DATE_RE.test(sp.date) && dates.includes(sp.date) ? sp.date : workingDay(today, holidays);
  const supabase = await createClient();
  const [itemsRes, dayRes, mineRes, usedRes] = await Promise.all([
    supabase.from("equipment").select("id, name, notes, active").order("name"),
    supabase.from("equipment_bookings").select("*").eq("date", date).is("cancelled_at", null),
    supabase.from("equipment_bookings").select("*").eq("booked_by", person.email).gte("date", today).is("cancelled_at", null).order("date").order("slot_id"),
    // Items that were ever booked keep their history, so only the others can be deleted
    admin ? supabase.from("equipment_bookings").select("equipment_id") : Promise.resolve({ data: [] }),
  ]);
  const everBooked = new Set(((usedRes.data ?? []) as { equipment_id: number }[]).map((b) => b.equipment_id));
  const ready = !itemsRes.error;
  const items = (itemsRes.data ?? []) as Item[];
  const live = items.filter((i) => i.active);
  const day = (dayRes.data ?? []) as Booking[];
  const at = new Map(day.map((b) => [`${b.equipment_id}|${b.slot_id}`, b]));
  const label = new Map(slots.map((s) => [s.id, s.label]));
  const nameOf = new Map(items.map((i) => [i.id, i.name]));
  // One line per booking made in one go
  const mine = [...((mineRes.data ?? []) as Booking[]).reduce((m, b) => {
    const k = `${b.equipment_id}|${b.date}|${b.created_at}`;
    m.set(k, [...(m.get(k) ?? []), b]);
    return m;
  }, new Map<string, Booking[]>()).values()];
  const wd = weekdayOf(date);
  const back = `/equipment?date=${date}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Equipment" subtitle="Book a portable projector, mic, speaker or kit for your class or event. Each item can be booked by one person per slot, first come first served." />
      {!ready && <div className="card muted p-4 text-sm">Equipment booking isn&apos;t set up yet. An admin needs to run supabase/migrations/0024_equipment_and_rollover.sql.</div>}

      {ready && (
        <>
          <nav aria-label="Dates" className="flex gap-1.5 overflow-x-auto pb-1">
            {dates.slice(0, 14).map((d) => (
              <Link
                key={d}
                href={`/equipment?date=${d}`}
                scroll={false}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${d === date ? "bg-brand-700 text-white dark:bg-brand-600" : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"}`}
              >
                {formatDate(d, { year: undefined, month: undefined })}
              </Link>
            ))}
          </nav>

          {live.length === 0 ? (
            <p className="card muted p-6 text-sm">No equipment listed yet.{admin ? " Add some below." : " Ask an admin to add it."}</p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[820px] border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th className="w-44 px-2 text-left font-medium text-neutral-500">{formatDate(date, { weekday: "long", year: undefined })}</th>
                    {slots.map((s) => (
                      <th key={s.id} className="px-1 font-medium whitespace-nowrap text-neutral-500">
                        {s.label.split(" – ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {live.map((i) => (
                    <tr key={i.id}>
                      <th className="px-2 text-left">
                        <div className="font-semibold">{i.name}</div>
                        {i.notes && <div className="muted font-normal">{i.notes}</div>}
                      </th>
                      {slots.map((s) => {
                        const b = at.get(`${i.id}|${s.id}`);
                        if (b)
                          return (
                            <td key={s.id} className={`rounded-md px-1.5 py-2 ${b.booked_by === person.email ? "bg-brand-600 text-white dark:bg-brand-500 dark:text-black" : "bg-brand-100 text-brand-900 dark:bg-brand-900/70 dark:text-brand-100"}`} title={b.purpose}>
                              <div className="truncate font-medium">{b.booked_by === person.email ? "You" : b.booked_name}</div>
                              {b.room_id && <div className="truncate opacity-80">{b.room_id}</div>}
                            </td>
                          );
                        const closed = !slotOpen(wd, s) || slotEnded(date, s);
                        return (
                          <td key={s.id} className={`rounded-md py-2 text-center ${closed ? "border border-dashed border-brand-200 text-neutral-400 dark:border-brand-900" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>
                            {closed ? "–" : "Free"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {live.length > 0 && (
            <form action={bookEquipment} className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-end">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="date" value={date} />
              <div>
                <label className="label" htmlFor="eq-item">Equipment</label>
                <RememberFields scope="equipment" fields={["equipment", "room", "purpose"]} />
                <select id="eq-item" name="equipment" className="input">
                  {live.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <SlotRange slots={slots} idPrefix="eq-" />
              <div>
                <label className="label" htmlFor="eq-room">Room (optional)</label>
                <select id="eq-room" name="room" defaultValue="" className="input">
                  <option value="">Not in a room</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="eq-why">What for</label>
                <input id="eq-why" name="purpose" maxLength={120} className="input" placeholder="e.g. DBMS-3B guest lecture" />
              </div>
              <SubmitButton pendingText="Booking…" message="Booking the equipment…">
                <IconCheck className="h-4 w-4" /> Book for {formatDate(date, { year: undefined, month: undefined })}
              </SubmitButton>
            </form>
          )}

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">
              Your bookings <span className="muted text-sm font-normal">· {mine.length}</span>
            </h2>
            {mine.length === 0 ? (
              <EmptyState title="You have nothing booked">Pick an item, a time and a room in the form above.</EmptyState>
            ) : (
              <ul className="card divide-y divide-brand-100 dark:divide-brand-900">
                {mine.map((g) => (
                  <li key={g[0].id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">{nameOf.get(g[0].equipment_id)}</span>
                      <span className="muted">
                        {" "}
                        · {formatDate(g[0].date, { year: undefined })} · {label.get(g[0].slot_id)?.split(" – ")[0]} to {label.get(g[g.length - 1].slot_id)?.split(" – ")[1]}
                        {g[0].room_id && ` · ${g[0].room_id}`}
                        {g[0].purpose && ` · ${g[0].purpose}`}
                      </span>
                      <InlineEdit action={editEquipmentBooking} back={back} title="Edit this booking" message="Saving the booking…" className="mt-1">
                        <input type="hidden" name="id" value={g[0].id} />
                        <Field label="Room">
                          <select name="room" defaultValue={g[0].room_id ?? ""} className="input py-1.5 font-normal">
                            <option value="">No room</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Purpose" className="min-w-48 flex-1">
                          <input name="purpose" maxLength={120} defaultValue={g[0].purpose} className="input py-1.5 font-normal" />
                        </Field>
                      </InlineEdit>
                    </span>
                    <form action={cancelEquipment}>
                      <input type="hidden" name="id" value={g[0].id} />
                      <input type="hidden" name="back" value={back} />
                      <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Cancelling…" message="Cancelling the booking…" confirm="Cancel this booking?">
                        <IconX className="h-3.5 w-3.5" /> Cancel
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {admin && day.some((b) => b.booked_by !== person.email) && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Everyone&apos;s bookings on {formatDate(date, { year: undefined })} (admin)</h2>
              <ul className="card divide-y divide-brand-100 text-sm dark:divide-brand-900">
                {day
                  .filter((b) => b.booked_by !== person.email)
                  .sort((a, b) => a.equipment_id - b.equipment_id || a.slot_id - b.slot_id)
                  .map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                      <span>
                        {nameOf.get(b.equipment_id)} · {label.get(b.slot_id)} · {b.booked_name}
                        {b.purpose && <span className="muted"> · {b.purpose}</span>}
                      </span>
                      <form action={cancelEquipment}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="back" value={back} />
                        <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Cancelling…" message="Cancelling the booking…" confirm={`Cancel ${b.booked_name}'s booking of ${nameOf.get(b.equipment_id)}?`}>
                          <IconX className="h-3.5 w-3.5" /> Cancel
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {admin && (
            <section className="space-y-2">
              <h2 id="manage" className="scroll-mt-4 text-lg font-semibold">Manage equipment</h2>
              <div className="card divide-y divide-brand-100 dark:divide-brand-900">
                {items.map((i) => (
                  <form key={i.id} action={saveEquipment} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="back" value={back} />
                    <input name="name" defaultValue={i.name} required maxLength={60} aria-label="Name" className="input min-w-40 flex-1 py-1.5" />
                    <input name="notes" defaultValue={i.notes} maxLength={120} aria-label="Notes" placeholder="Notes" className="input min-w-40 flex-1 py-1.5" />
                    <select name="active" defaultValue={String(i.active)} aria-label="Status" className="input w-36 py-1.5">
                      <option value="true">Can be booked</option>
                      <option value="false">Retired</option>
                    </select>
                    <SubmitButton className="btn-secondary py-1.5" pendingText="Saving…" message="Saving…">
                      <IconCheck className="h-4 w-4" /> Save
                    </SubmitButton>
                    {!everBooked.has(i.id) && (
                      <SubmitButton
                        formAction={deleteEquipment}
                        className="btn-secondary px-2.5 py-1.5 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                        pendingText=""
                        message={`Deleting ${i.name}…`}
                        confirm={`Delete ${i.name}? It has never been booked, so nothing else changes.`}
                        aria-label={`Delete ${i.name}`}
                        title="Delete"
                      >
                        <IconTrash className="h-4 w-4" />
                      </SubmitButton>
                    )}
                  </form>
                ))}
                <form action={saveEquipment} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <input type="hidden" name="back" value={back} />
                  <input name="name" required maxLength={60} aria-label="New equipment" placeholder="e.g. Portable projector 1" className="input min-w-40 flex-1 py-1.5" />
                  <input name="notes" maxLength={120} aria-label="Notes" placeholder="Notes, e.g. kept in the HoD office" className="input min-w-40 flex-1 py-1.5" />
                  <SubmitButton className="btn-primary py-1.5" pendingText="Adding…" message="Adding the equipment…">
                    <IconPlus className="h-4 w-4" /> Add
                  </SubmitButton>
                </form>
              </div>
              <p className="muted text-xs">Retiring an item hides it and cancels its future bookings. An item that was never booked can be deleted.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
