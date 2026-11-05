"use client";

import { useRef } from "react";
import { IconPencil } from "./Icons";
import SubmitButton from "./SubmitButton";

/**
 * The one way to edit a row in place: a small "Edit" link opens the fields under it, with Save
 * and Cancel. Esc also cancels.
 */
export default function InlineEdit({
  action,
  label = "Edit",
  title,
  back,
  message = "Saving…",
  className = "",
  children,
}: {
  action: (form: FormData) => void | Promise<void>;
  /** The link text, e.g. "Edit". */
  label?: string;
  /** Read by screen readers, e.g. "Edit the Diwali holiday". */
  title?: string;
  back: string;
  /** Shown in the middle of the screen while saving. */
  message?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  return (
    <details ref={ref} className={`group w-full ${className}`} onKeyDown={(e) => e.key === "Escape" && close()}>
      <summary
        aria-label={title}
        className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand-600 hover:underline group-open:hidden dark:text-brand-400 [&::-webkit-details-marker]:hidden"
      >
        <IconPencil className="h-3.5 w-3.5" /> {label}
      </summary>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-brand-50/60 p-3 dark:bg-brand-950/40">
        <input type="hidden" name="back" value={back} />
        {children}
        <div className="flex gap-2">
          <SubmitButton className="btn-primary py-1.5" pendingText="Saving…" message={message}>
            Save
          </SubmitButton>
          <button type="button" className="btn-secondary py-1.5" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </details>
  );
}

/** A labelled field for InlineEdit forms. */
export function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid gap-1 text-xs font-medium ${className}`}>
      {label}
      {children}
    </label>
  );
}
