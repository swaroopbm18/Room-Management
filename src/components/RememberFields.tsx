"use client";

import { useEffect, useRef } from "react";

/**
 * Put inside a form: the named fields start with what was picked last time on this device
 * (e.g. the same room or kind of booking), and are remembered when the form is sent.
 */
export default function RememberFields({ scope, fields }: { scope: string; fields: string[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const key = `remember:${scope}`;
  const names = fields.join("|");

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const list = names.split("|");
    const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
      for (const n of list) {
        const el = field(n);
        const v = saved[n];
        if (!el || v === undefined || !("value" in el)) continue;
        // Only a choice that still exists, and only over an empty or default value
        if (el instanceof HTMLSelectElement ? [...el.options].some((o) => o.value === v) : !el.value) el.value = v;
      }
    } catch {
      // storage can be unavailable (private mode); the form works as usual
    }
    const save = () => {
      try {
        const out: Record<string, string> = {};
        for (const n of list) {
          const el = field(n);
          if (el && "value" in el && el.value) out[n] = el.value;
        }
        localStorage.setItem(key, JSON.stringify(out));
      } catch {
        // ignore
      }
    };
    form.addEventListener("submit", save);
    return () => form.removeEventListener("submit", save);
  }, [key, names]);

  return <span ref={ref} hidden />;
}
