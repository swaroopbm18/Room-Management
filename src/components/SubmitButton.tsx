"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import ConfirmDialog from "./ConfirmDialog";
import LoadingOverlay from "./LoadingOverlay";
import Spinner from "./Spinner";

/**
 * A form's submit button that shows it is working: it turns into a spinner, can't be clicked
 * twice, and a status message covers the page until the action finishes.
 */
export default function SubmitButton({
  children,
  className = "btn-primary",
  pendingText,
  message,
  confirm,
  confirmLabel,
  formAction,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  /** Shown on the button while working, e.g. "Approving…". */
  pendingText?: string;
  /** Shown in the centre of the screen while working. Defaults to pendingText. */
  message?: string;
  /** Asks this question in a dialog first; Cancel doesn't submit. */
  confirm?: string;
  /** The dialog's yes button, e.g. "Delete". */
  confirmLabel?: string;
  /** Submits to this action instead of the form's own. */
  formAction?: (form: FormData) => void | Promise<void>;
} & React.AriaAttributes & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, "name" | "value" | "title">) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={className}
        formAction={formAction}
        formNoValidate={formAction ? true : undefined}
        onClick={
          confirm
            ? (e) => {
                // Ask first; the form is submitted from the dialog, with this button as the submitter
                e.preventDefault();
                if (formAction || ref.current?.form?.reportValidity() !== false) setAsking(true);
              }
            : undefined
        }
        {...rest}
      >
        {pending ? (
          <>
            <Spinner className="h-4 w-4" />
            {pendingText}
          </>
        ) : (
          children
        )}
      </button>
      {confirm && (
        <ConfirmDialog
          open={asking}
          message={confirm}
          confirmLabel={confirmLabel}
          danger={!/btn-primary/.test(className)}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            ref.current?.form?.requestSubmit(ref.current);
          }}
        />
      )}
      {pending && <LoadingOverlay label={message ?? pendingText ?? "Working…"} />}
    </>
  );
}
