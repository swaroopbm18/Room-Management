"use client";

import { useFormStatus } from "react-dom";
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
  formAction,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  /** Shown on the button while working, e.g. "Approving…". */
  pendingText?: string;
  /** Shown in the centre of the screen while working. Defaults to pendingText. */
  message?: string;
  /** Asks "OK / Cancel" with this question first; Cancel doesn't submit. */
  confirm?: string;
  /** Submits to this action instead of the form's own. */
  formAction?: (form: FormData) => void | Promise<void>;
} & React.AriaAttributes & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, "name" | "value" | "title">) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={className}
        formAction={formAction}
        formNoValidate={formAction ? true : undefined}
        onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
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
      {pending && <LoadingOverlay label={message ?? pendingText ?? "Working…"} />}
    </>
  );
}
