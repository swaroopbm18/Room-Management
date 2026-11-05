"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { undoLast } from "@/app/actions";
import { IconAlert, IconCheck, IconRestore, IconX } from "./Icons";
import SubmitButton from "./SubmitButton";

type Note = { msg?: string; error?: string; undo?: string; back: string; key: number };

/**
 * The message after an action, as a small card at the bottom of the screen. A success fades
 * after a few seconds (longer when it can be undone); an error stays until it is closed.
 * The message is taken out of the address bar, so a refresh doesn't show it again.
 */
function ToastInner() {
  const params = useSearchParams();
  // The sign-in page shows its own errors
  const skip = usePathname().startsWith("/login");
  const [note, setNote] = useState<Note | null>(null);
  const msg = params.get("msg") ?? undefined;
  const error = params.get("error") ?? undefined;
  const undo = params.get("undo") ?? undefined;

  useEffect(() => {
    if (skip || (!msg && !error)) return;
    const rest = new URLSearchParams(window.location.search);
    ["msg", "error", "undo"].forEach((k) => rest.delete(k));
    const clean = `${window.location.pathname}${rest.size ? `?${rest}` : ""}${window.location.hash}`;
    setNote({ msg, error, undo, back: clean, key: Date.now() });
    window.history.replaceState(window.history.state, "", clean);
  }, [skip, msg, error, undo]);

  useEffect(() => {
    if (!note || note.error) return;
    const t = setTimeout(() => setNote(null), note.undo ? 10000 : 5000);
    return () => clearTimeout(t);
  }, [note]);

  if (!note) return null;
  const bad = !!note.error;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      <div
        key={note.key}
        role={bad ? "alert" : "status"}
        aria-live={bad ? "assertive" : "polite"}
        className={`pointer-events-auto flex w-full max-w-lg animate-[toast-in_.2s_ease-out] items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
          bad
            ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            : "border-brand-200 bg-white text-brand-950 dark:border-brand-800 dark:bg-ink dark:text-brand-50"
        }`}
      >
        {bad ? <IconAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
        <span className="min-w-0 flex-1 break-words">{note.error ?? note.msg}</span>
        {note.undo && (
          <form action={undoLast} className="-my-1">
            <input type="hidden" name="token" value={note.undo} />
            <input type="hidden" name="back" value={note.back} />
            <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Undoing…" message="Undoing…">
              <IconRestore className="h-3.5 w-3.5" /> Undo
            </SubmitButton>
          </form>
        )}
        <button type="button" onClick={() => setNote(null)} aria-label="Close message" className="-m-1 rounded p-1 opacity-70 hover:opacity-100">
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function Toast() {
  return (
    <Suspense fallback={null}>
      <ToastInner />
    </Suspense>
  );
}
