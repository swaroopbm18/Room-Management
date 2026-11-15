"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconAlert, IconX } from "./Icons";

export type Affected = { at: string; subject: string; faculty: string | null };

/**
 * A "Classes affected" button in its own colour. Pressing it opens a pop-up listing the regular
 * classes an event, CIE or booking took the place of, with a close button. Esc, Close or a click
 * outside closes it.
 */
export default function AffectedClasses({ classes, title, when, dark = false }: { classes: Affected[]; title: string; when: string; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      closeRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);
  if (!classes.length) return null;
  const label = classes.length === 1 ? "1 class affected" : `${classes.length} classes affected`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm transition sm:text-xs ${
          dark
            ? "bg-amber-400 text-amber-950 ring-1 ring-amber-200/70 hover:bg-amber-300"
            : "bg-amber-500 text-white ring-1 ring-amber-600/30 hover:bg-amber-600 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300"
        }`}
      >
        <IconAlert className="h-3.5 w-3.5" />
        {label}
      </button>
      <dialog
        ref={ref}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        aria-labelledby={headingId}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-amber-200 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px] dark:border-amber-900 dark:bg-ink dark:text-neutral-100"
      >
        <div className="flex items-start justify-between gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4 dark:border-amber-900/60 dark:bg-amber-950/40">
          <div className="min-w-0">
            <h2 id={headingId} className="inline-flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-100">
              <IconAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" /> {label}
            </h2>
            <p className="mt-0.5 text-sm text-amber-900/80 dark:text-amber-200/80">
              {title} · {when}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/60">
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <ul className="max-h-[60vh] divide-y divide-brand-100 overflow-y-auto dark:divide-brand-900">
          {classes.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className="w-20 shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">{c.at}</span>
              <span className="rounded-md bg-amber-200/70 px-2 py-0.5 font-semibold text-amber-950 ring-1 ring-amber-300 ring-inset dark:bg-amber-500/25 dark:text-amber-100 dark:ring-amber-500/50">{c.subject}</span>
              {c.faculty && <span>{c.faculty}</span>}
            </li>
          ))}
        </ul>
        <div className="flex justify-end border-t border-brand-100 bg-brand-50/60 px-5 py-3 dark:border-brand-900 dark:bg-brand-950/40">
          <button ref={closeRef} type="button" className="btn-secondary py-1.5" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
