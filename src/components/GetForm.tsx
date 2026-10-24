"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import LoadingOverlay from "./LoadingOverlay";

/** A filter form that loads its results in place, with the loading overlay while it does. */
export default function GetForm({ className, children, message = "Loading…" }: { className?: string; children: React.ReactNode; message?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v) params.set(k, v);
        startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending && <LoadingOverlay label={message} />}
    </form>
  );
}
