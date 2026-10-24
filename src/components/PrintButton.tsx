"use client";

import { IconFile } from "./Icons";

export default function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary">
      <IconFile className="h-4 w-4" /> {label}
    </button>
  );
}
