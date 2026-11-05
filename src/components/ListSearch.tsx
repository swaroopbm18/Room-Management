"use client";

import { useEffect, useRef, useState } from "react";
import { IconSearch, IconX } from "./Icons";

/**
 * A search box that hides the rows of a list that don't match, as you type. Rows are the
 * elements inside `#target` with a `data-search` attribute; their text is what is matched.
 * Press "/" anywhere to jump to the box, Esc to clear it.
 */
export default function ListSearch({ target, placeholder = "Search", className = "" }: { target: string; placeholder?: string; className?: string }) {
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<{ shown: number; total: number } | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const rows = [...document.querySelectorAll<HTMLElement>(`#${target} [data-search]`)];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const r of rows) {
      const text = `${r.dataset.search ?? ""} ${r.textContent ?? ""}`.toLowerCase();
      const hit = words.every((w) => text.includes(w));
      r.hidden = !hit;
      if (hit) shown++;
    }
    // Groups (data-search-group) with nothing left in them are hidden too
    for (const g of document.querySelectorAll<HTMLElement>(`#${target} [data-search-group]`)) {
      g.hidden = words.length > 0 && !g.querySelector("[data-search]:not([hidden])");
    }
    setCounts({ shown, total: rows.length });
  }, [q, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <label className="relative min-w-56 flex-1 sm:max-w-sm">
        <span className="sr-only">{placeholder}</span>
        <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand-400" />
        <input
          ref={ref}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder={`${placeholder}  ( / )`}
          className="input pr-8 pl-9"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
            <IconX className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      {q && counts && (
        <span className="muted text-sm" aria-live="polite">
          {counts.shown === 0 ? "No matches" : `${counts.shown} of ${counts.total}`}
        </span>
      )}
    </div>
  );
}
