/**
 * The regular class that a booking, CIE or event took the place of, e.g.
 * "Class affected: DBMS-3B · Dr. Ashok Kumar N", the class marked in amber.
 * Renders nothing when the slot had no regular class.
 */
export default function OriginalClass({
  subject,
  faculty,
  className = "",
  compact = false,
}: {
  subject?: string | null;
  faculty?: string | null;
  className?: string;
  /** One short line for grid cells: "Was DBMS-3B". */
  compact?: boolean;
}) {
  if (!subject) return null;
  const label = `Class affected: ${subject}${faculty ? `, ${faculty}` : ""}`;
  return (
    <div className={className} title={label}>
      {compact ? "Was " : "Class affected: "}
      <span className="rounded bg-amber-200/80 px-1 font-semibold text-amber-950 ring-1 ring-amber-300 ring-inset dark:bg-amber-500/25 dark:text-amber-100 dark:ring-amber-500/50">{subject}</span>
      {!compact && faculty && <> · {faculty}</>}
    </div>
  );
}

/** The same as text, for titles, CSV and the report. */
export function originalClassText(subject?: string | null, faculty?: string | null): string {
  return subject ? `Class affected: ${subject}${faculty ? ` (${faculty})` : ""}` : "";
}
