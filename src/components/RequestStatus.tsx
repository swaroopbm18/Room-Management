import type { RequestRow } from "@/lib/types";

const STYLES: Record<string, string> = {
  pending: "bg-white text-brand-700 ring-brand-400 dark:bg-black dark:text-brand-300 dark:ring-brand-600",
  approved: "bg-brand-600 text-white ring-brand-600 dark:bg-brand-500 dark:text-black dark:ring-brand-500",
  rejected: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  withdrawn: "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:ring-neutral-800",
  expired: "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:ring-neutral-800",
};

export default function RequestStatus({ status, expired }: { status: RequestRow["status"]; expired?: boolean }) {
  const s = status === "pending" && expired ? "expired" : status;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STYLES[s]}`}>{s}</span>;
}
