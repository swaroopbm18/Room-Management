import type { SlotStatus } from "@/lib/types";

const STYLES: Record<SlotStatus, string> = {
  free: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  class: "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-800",
  department: "bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:ring-neutral-800",
  booked: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  cie: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  event: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
};

const LABELS: Record<SlotStatus, string> = {
  free: "Free",
  class: "Class",
  department: "Other dept",
  booked: "Booked",
  cie: "CIE",
  event: "Event",
};

export default function StatusBadge({ status }: { status: SlotStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
