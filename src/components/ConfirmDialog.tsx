"use client";

import { useEffect, useId, useRef } from "react";
import { IconAlert } from "./Icons";

/**
 * A yes/no question in a dialog over the page, used instead of the browser's own pop-up.
 * Esc or Cancel closes it; focus starts on Cancel so Enter never deletes by accident.
 */
export default function ConfirmDialog({
  open,
  message,
  confirmLabel = "Yes, go ahead",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const textId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      cancelRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => e.target === ref.current && onCancel()}
      aria-labelledby={textId}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-brand-100 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px] dark:border-brand-900 dark:bg-ink dark:text-neutral-100"
    >
      <div className="flex gap-3 p-5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${danger ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300"}`}>
          <IconAlert className="h-5 w-5" />
        </span>
        <p id={textId} className="pt-1.5 text-sm leading-relaxed">
          {message}
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-brand-100 bg-brand-50/60 px-5 py-3 dark:border-brand-900 dark:bg-brand-950/40">
        <button ref={cancelRef} type="button" className="btn-secondary py-1.5" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`${danger ? "btn-danger" : "btn-primary"} py-1.5`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
