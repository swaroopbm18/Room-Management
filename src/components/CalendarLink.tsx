"use client";

import { useState } from "react";

/** A faculty member's private calendar link, with buttons to add it to a calendar app or copy it. */
export default function CalendarLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const webcal = url.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href={google} target="_blank" rel="noopener" className="btn-primary">
          Add to Google Calendar
        </a>
        <a href={webcal} className="btn-secondary">
          Apple or Outlook calendar
        </a>
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <input readOnly value={url} aria-label="Your calendar link" className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}
