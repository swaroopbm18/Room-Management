"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar along the top of the window while the next page loads, for every link on the site
 * and for Back and Forward. Links that also dim the page (PendingLink) show the same bar. It only
 * appears when the page takes more than a moment, so quick pages don't flash.
 */
export default function NavigationProgress() {
  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const [loading, setLoading] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLoading(false);
  };

  // The new page has arrived
  useEffect(stop, [url]);

  useEffect(() => {
    const start = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [
        setTimeout(() => setLoading(true), 150),
        // In case the page never changes (an error, say)
        setTimeout(() => setLoading(false), 15_000),
      ];
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin) return;
      // The same page, or only a jump to a section of it
      if (to.pathname === location.pathname && to.search === location.search) return;
      // Files served by routes, not pages
      if (/\.(pdf|xlsx|csv|ics)$|\/(backup|export)$|^\/cal\//.test(to.pathname)) return;
      start();
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", start);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  return loading ? (
    <div role="status" aria-label="Loading" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden print:hidden">
      <div className="loading-bar h-full bg-brand-500" />
    </div>
  ) : null;
}
