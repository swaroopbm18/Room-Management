"use client";

import { IconMoon, IconSun } from "./Icons";

export default function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
  }
  return (
    <button type="button" onClick={toggle} aria-label="Toggle dark theme" title="Toggle dark theme" className="rounded-lg p-2 text-brand-100 hover:bg-white/10">
      <IconMoon className="h-5 w-5 dark:hidden" />
      <IconSun className="hidden h-5 w-5 dark:block" />
    </button>
  );
}
