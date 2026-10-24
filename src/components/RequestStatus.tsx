import type { RequestRow } from "@/lib/types";

const STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  rejected: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  withdrawn: "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:ring-neutral-800",
  expired: "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:ring-neutral-800",
};

export default function RequestStatus({ status, expired }: { status: RequestRow["status"]; expired?: boolean }) {
  const s = status === "pending" && expired ? "expired" : status;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STYLES[s]}`}>{s}</span>;
}
