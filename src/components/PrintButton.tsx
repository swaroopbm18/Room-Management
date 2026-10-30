"use client";

import { IconPrinter } from "./Icons";

/** Opens the browser's print dialog; hidden on paper. */
export default function PrintButton({ label = "Print", className = "btn-secondary" }: { label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${className} print:hidden`}>
      <IconPrinter className="h-4 w-4" /> {label}
    </button>
  );
}
