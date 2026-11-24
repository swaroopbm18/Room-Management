"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconAlert } from "@/components/Icons";

/** Shown in place of a page that failed to load, e.g. when the database can't be reached for a moment. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <section role="alert" className="card mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300">
        <IconAlert className="h-7 w-7" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="muted mt-1">This page couldn&apos;t load just now. It usually works on a second try.</p>
        {error.digest && <p className="muted mt-2 text-xs">Reference: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Go to the home page
        </Link>
      </div>
    </section>
  );
}
