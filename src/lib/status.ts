import type { SlotStatus } from "./types";

// Blue-and-black status palette, shared by badges and the day grid.
export const STATUS_LABEL: Record<SlotStatus, string> = {
  free: "Free",
  class: "Class",
  department: "Other dept",
  booked: "Booked",
  cie: "CIE",
  event: "Event",
  closed: "No classes",
};

export const STATUS_BADGE: Record<SlotStatus, string> = {
  free: "bg-white text-brand-700 ring-brand-400 dark:bg-black dark:text-brand-300 dark:ring-brand-600",
  class: "bg-brand-100 text-brand-900 ring-brand-200 dark:bg-brand-900/70 dark:text-brand-100 dark:ring-brand-800",
  department: "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:ring-neutral-800",
  booked: "bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:text-black dark:ring-brand-500",
  cie: "bg-ink text-white ring-ink dark:bg-white dark:text-black dark:ring-white",
  event: "bg-brand-800 text-white ring-brand-800 dark:bg-brand-300 dark:text-brand-950 dark:ring-brand-300",
  closed: "bg-neutral-50 text-neutral-400 ring-neutral-200 dark:bg-neutral-950 dark:text-neutral-500 dark:ring-neutral-800",
};

export const STATUS_CELL: Record<SlotStatus, string> = {
  free: "border border-dashed border-brand-300 bg-white text-brand-700 dark:border-brand-800 dark:bg-black dark:text-brand-300",
  class: "bg-brand-100 text-brand-950 dark:bg-brand-900/60 dark:text-brand-50",
  department: "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400",
  booked: "bg-brand-600 text-white dark:bg-brand-500 dark:text-black",
  cie: "bg-ink text-white dark:bg-white dark:text-black",
  event: "bg-brand-800 text-white dark:bg-brand-300 dark:text-brand-950",
  // Saturday after 2 PM: no classes are held, so the slot is neither free nor taken
  closed: "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(115,115,115,0.08)_6px_12px)] bg-neutral-50 text-neutral-400 dark:bg-neutral-950 dark:text-neutral-600",
};
