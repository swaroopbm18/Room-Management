"use client";

import { useState } from "react";
import DateInput from "@/components/DateInput";
import { IconPlus, IconX } from "@/components/Icons";
import type { Room, Slot } from "@/lib/types";
import SlotRange from "./SlotRange";

/**
 * Where and when: a date, a start and end time and a room. One event can take several rooms at
 * different times: each row is one more room or time, all saved together under the same reason.
 * The rows share the field names (date, from, to, room), in order.
 */
export default function AllotPlaces({
  rooms,
  slots,
  defaultDate,
  maxDate,
  holidays,
  workingSundays,
}: {
  rooms: Pick<Room, "id" | "name">[];
  slots: Slot[];
  defaultDate: string;
  maxDate: string;
  holidays: Record<string, string>;
  workingSundays: string[];
}) {
  const [rows, setRows] = useState([0]);
  const [next, setNext] = useState(1);

  return (
    <div className="space-y-3 sm:col-span-2 lg:col-span-3">
      {rows.map((key, i) => (
        <div key={key} className={`grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_minmax(0,1.4fr)_1fr_auto] ${i > 0 ? "border-t border-brand-100 pt-3 dark:border-brand-900" : ""}`}>
          <div>
            <label className="label" htmlFor={key === 0 ? "date" : `date-${key}`}>{i === 0 ? "Date" : `Date (${i + 1})`}</label>
            <DateInput id={key === 0 ? "date" : `date-${key}`} name="date" required defaultValue={defaultDate} max={maxDate} holidays={holidays} workingSundays={workingSundays} />
            {i === 0 && <p className="muted mt-1 text-xs">Pick an earlier date to record a CIE, event or class that already took place.</p>}
          </div>
          <SlotRange slots={slots} idPrefix={key === 0 ? "" : `p${key}-`} />
          <div>
            <label className="label" htmlFor={key === 0 ? "room" : `room-${key}`}>{i === 0 ? "Room" : `Room (${i + 1})`}</label>
            <select id={key === 0 ? "room" : `room-${key}`} name="room" className="input">
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-1 lg:h-full lg:pb-0.5">
            {i > 0 && (
              <button type="button" className="btn-secondary py-2" onClick={() => setRows(rows.filter((k) => k !== key))} aria-label={`Remove room or time ${i + 1}`}>
                <IconX className="h-4 w-4" /> Remove
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary py-2 text-sm"
        onClick={() => {
          setRows([...rows, next]);
          setNext(next + 1);
        }}
      >
        <IconPlus className="h-4 w-4" /> Add another room or time
      </button>
      {rows.length > 1 && <p className="muted text-xs">All {rows.length} rooms and times are allotted together for the same event, with the details below.</p>}
    </div>
  );
}
