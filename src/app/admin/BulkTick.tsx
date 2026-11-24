"use client";

import { useEffect, useState } from "react";

const boxes = (form: string) => [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"][name=ids]`)];

/**
 * "Tick all" for the requests waiting, with how many are ticked, so a whole day's requests can be
 * approved or rejected together without ticking each one.
 */
export default function BulkTick({ form }: { form: string }) {
  const [ticked, setTicked] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const count = () => {
      const all = boxes(form);
      setTotal(all.length);
      setTicked(all.filter((b) => b.checked).length);
    };
    count();
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, [form]);

  const toggle = (on: boolean) => {
    for (const b of boxes(form)) b.checked = on;
    setTicked(on ? total : 0);
  };

  return (
    <label className="mr-auto inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={total > 0 && ticked === total}
        ref={(el) => {
          if (el) el.indeterminate = ticked > 0 && ticked < total;
        }}
        onChange={(e) => toggle(e.target.checked)}
        className="h-4 w-4 accent-brand-600"
      />
      <span className={ticked ? "font-medium" : "muted"}>{ticked ? `${ticked} of ${total} ticked` : "Tick all, or tick requests below to approve or reject several at once."}</span>
    </label>
  );
}
