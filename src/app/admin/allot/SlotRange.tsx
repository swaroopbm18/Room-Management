"use client";

import { useState } from "react";
import type { Slot } from "@/lib/types";

/** Start and end time pickers; the end moves along so it never comes before the start. */
export default function SlotRange({ slots, idPrefix = "" }: { slots: Slot[]; idPrefix?: string }) {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label" htmlFor={`${idPrefix}from`}>Start time</label>
        <select
          id={`${idPrefix}from`}
          name="from"
          className="input"
          value={slots[from]?.id}
          onChange={(e) => {
            const i = slots.findIndex((s) => String(s.id) === e.target.value);
            setFrom(i);
            if (to < i) setTo(i);
          }}
        >
          {slots.map((s) => (
            <option key={s.id} value={s.id}>{s.label.split(" – ")[0]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}to`}>End time</label>
        <select id={`${idPrefix}to`} name="to" className="input" value={slots[to]?.id} onChange={(e) => setTo(slots.findIndex((s) => String(s.id) === e.target.value))}>
          {slots.map((s, i) => (
            <option key={s.id} value={s.id} disabled={i < from}>
              {s.label.split(" – ")[1]}
            </option>
          ))}
        </select>
        <p className="muted mt-1 text-xs">{to - from + 1 === 1 ? "1 slot" : `${to - from + 1} slots`}</p>
      </div>
    </div>
  );
}
