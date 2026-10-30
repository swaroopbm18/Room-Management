"use client";

import { useEffect, useRef, useState } from "react";
import { COLOR_THEMES, DEFAULT_COLOR } from "@/lib/colors";
import { IconCheck, IconPalette } from "./Icons";

// Navbar button that recolours the whole site. The choice is saved in localStorage and
// applied before first paint by the script in layout.tsx.
export default function ColorPicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string>(DEFAULT_COLOR);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(document.documentElement.dataset.color ?? DEFAULT_COLOR);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: string) {
    const root = document.documentElement;
    if (id === DEFAULT_COLOR) delete root.dataset.color;
    else root.dataset.color = id;
    try {
      localStorage.setItem("color", id);
    } catch {}
    setCurrent(id);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change colour theme"
        title="Change colour theme"
        aria-expanded={open}
        aria-haspopup="true"
        className="rounded-lg p-2 text-brand-100 hover:bg-white/10"
      >
        <IconPalette className="h-5 w-5" />
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 w-64 p-3 text-neutral-900 dark:text-neutral-100">
          <div className="mb-2 text-xs font-semibold tracking-wide text-brand-700 uppercase dark:text-brand-300">Colour theme</div>
          <div className="grid grid-cols-2 gap-1">
            {COLOR_THEMES.map((c) => {
              const on = c.id === current;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => choose(c.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-brand-50 dark:hover:bg-brand-950 ${on ? "font-medium" : ""}`}
                >
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white ring-1 ring-black/10"
                    style={{ background: `linear-gradient(135deg, ${c.swatch[0]}, ${c.swatch[1]})` }}
                  >
                    {on && <IconCheck className="h-3 w-3" />}
                  </span>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
