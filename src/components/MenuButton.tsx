"use client";

import { IconMenu } from "./Icons";
import { OPEN_EVENT } from "./SideNav";

/** Opens the side navigation drawer on phones and tablets. */
export default function MenuButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} aria-label="Open menu" title="Menu" className={className}>
      <IconMenu className="h-5 w-5" />
    </button>
  );
}
