"use client";

import { useEffect } from "react";

/**
 * Makes the manual's contents, quick-start cards and other in-page links glide to their section,
 * even where the browser would jump (reduced motion set in the OS, or a section the search box
 * hid). The address keeps the section, so Back and a copied link still work.
 */
export default function ManualScroll({ root }: { root: string }) {
  useEffect(() => {
    const box = document.getElementById(root);
    if (!box) return;

    const glide = (id: string, push: boolean) => {
      const target = document.getElementById(id);
      if (!target) return false;
      // A section the search box hid: clear the search so it can be shown
      if (target.closest("[hidden]")) {
        const search = box.querySelector<HTMLInputElement>('input[type="search"]');
        if (search) {
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          set?.call(search, "");
          search.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      // After the search has shown it again
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.classList.add("manual-flash");
        window.setTimeout(() => target.classList.remove("manual-flash"), 1600);
      });
      if (push && location.hash !== `#${id}`) history.pushState(history.state, "", `#${id}`);
      return true;
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const id = decodeURIComponent(a.getAttribute("href")!.slice(1));
      if (id && glide(id, true)) e.preventDefault();
    };
    box.addEventListener("click", onClick);

    // Opened with a section in the address (e.g. /help#admin-start): go there once the page is drawn
    const first = decodeURIComponent(location.hash.slice(1));
    if (first) window.setTimeout(() => glide(first, false), 50);

    return () => box.removeEventListener("click", onClick);
  }, [root]);

  return null;
}
