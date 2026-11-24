"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Someone typing or picking in a form, or a dialog open: a refresh then waits. */
function busy() {
  const el = document.activeElement;
  return !!el?.closest("input, textarea, select, [contenteditable]") || !!document.querySelector("dialog[open]");
}

/**
 * Keeps a page that's been left open up to date. The one in the layout reloads the data when you
 * come back to the tab after a minute or more; a page adds one with `every` (seconds) to also
 * reload on that interval while it's on screen, so the current slot and free rooms move on by
 * themselves. Only the data reloads: the scroll position and anything typed stay.
 */
export default function AutoRefresh({ every }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const refresh = () => {
      if (!busy()) router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) refresh();
    };
    if (!every) document.addEventListener("visibilitychange", onVisible);
    const timer = every ? setInterval(() => document.visibilityState === "visible" && refresh(), every * 1000) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearInterval(timer);
    };
  }, [router, every]);
  return null;
}
