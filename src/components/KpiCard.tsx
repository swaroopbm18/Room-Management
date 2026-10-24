import Link from "next/link";
import { IconArrowRight } from "./Icons";

export default function KpiCard({
  label,
  value,
  hint,
  href,
  linkText,
  icon,
  tone = "light",
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  linkText?: string;
  icon?: React.ReactNode;
  tone?: "light" | "navy" | "ink";
}) {
  const box =
    tone === "navy"
      ? "rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white shadow-lg shadow-brand-900/20"
      : tone === "ink"
        ? "rounded-2xl bg-gradient-to-br from-ink via-brand-950 to-brand-900 text-white shadow-lg shadow-black/20 dark:border dark:border-brand-900"
        : "card";
  const sub = tone === "light" ? "text-brand-700 dark:text-brand-300" : "text-brand-200";
  const chip = tone === "light" ? "bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-200" : "bg-white/10 text-white";
  return (
    <div className={`${box} flex flex-col p-3 sm:p-5`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`text-xs font-medium sm:text-sm ${sub}`}>{label}</div>
        {icon && <span className={`hidden rounded-lg p-1.5 sm:inline-flex ${chip}`}>{icon}</span>}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight sm:text-4xl">{value}</div>
      {hint && <div className={`mt-1 hidden text-xs sm:block ${tone === "light" ? "muted" : "text-brand-200/80"}`}>{hint}</div>}
      {href && (
        <Link
          href={href}
          className={`mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline sm:mt-3 sm:text-sm ${
            tone === "light" ? "text-brand-600 dark:text-brand-400" : "text-white"
          }`}
        >
          {linkText ?? "View"} <IconArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
