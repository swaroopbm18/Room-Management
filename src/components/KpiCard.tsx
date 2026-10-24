import Link from "next/link";

export default function KpiCard({
  label,
  value,
  hint,
  href,
  linkText,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <div className="card flex flex-col p-3 sm:p-5">
      <div className="text-xs font-medium text-brand-700 sm:text-sm dark:text-brand-300">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight sm:text-4xl">{value}</div>
      {hint && <div className="muted mt-1 hidden text-xs sm:block">{hint}</div>}
      {href && (
        <Link href={href} className="mt-2 text-xs font-medium sm:mt-3 sm:text-sm text-brand-600 hover:underline dark:text-brand-400">
          {linkText ?? "View"} →
        </Link>
      )}
    </div>
  );
}
