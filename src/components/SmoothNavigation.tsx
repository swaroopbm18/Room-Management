"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const keyOf = (pathname: string, search: string) => `${pathname}?${search}`;

/**
 * Smooth navigation across the site. Links keep the scroll position (so a filter or tab
 * change doesn't jump), and this decides what happens instead: a new page starts at the top
 * and fades in, a link to a section (#who, #timetable…) glides to it, and Back or Forward
 * returns to where you were on that page.
 */
export default function SmoothNavigation() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = keyOf(pathname, search);
  const lastPath = useRef(pathname);
  const current = useRef(url);
  // Where each page was scrolled to, for Back and Forward
  const positions = useRef(new Map<string, number>());
  const lastY = useRef(0);
  const popped = useRef(false);

  const restore = (key: string) => requestAnimationFrame(() => window.scrollTo({ top: positions.current.get(key) ?? 0, behavior: "instant" }));

  useEffect(() => {
    // The browser would restore the position before the page has rendered, so it's done here
    history.scrollRestoration = "manual";
    const onScroll = () => (lastY.current = scrollY);
    // Next may render the page before or after this hears about Back or Forward
    const onPop = () => {
      const key = keyOf(location.pathname, new URLSearchParams(location.search).toString());
      if (current.current === key) restore(key);
      else popped.current = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useEffect(() => {
    if (current.current === url) return;
    // The page we left, as it was before the new one could shorten it
    positions.current.set(current.current, lastY.current);
    current.current = url;
    const newPage = lastPath.current !== pathname;
    lastPath.current = pathname;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (popped.current) {
      popped.current = false;
      restore(url);
    } else if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
    else if (newPage) window.scrollTo({ top: 0, behavior: "instant" });

    if (newPage && !reduce)
      document.querySelector("main")?.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "ease-out" });
  }, [pathname, url]);

  return null;
}
