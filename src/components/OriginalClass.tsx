/**
 * The regular class that a booking, CIE or event took the place of, e.g.
 * "Original class: DBMS-3B · Dr. Ashok Kumar N", with the class struck through.
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
  const label = `Original class: ${subject}${faculty ? `, ${faculty}` : ""}`;
  return (
    <div className={className} title={label}>
      {compact ? "Was " : "Original class: "}
      <s className="font-medium">{subject}</s>
      {!compact && faculty && <> · {faculty}</>}
    </div>
  );
}

/** The same as text, for titles, CSV and the report. */
export function originalClassText(subject?: string | null, faculty?: string | null): string {
  return subject ? `Original class: ${subject}${faculty ? ` (${faculty})` : ""}` : "";
}
