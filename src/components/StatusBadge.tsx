import { STATUS_BADGE, STATUS_LABEL } from "@/lib/status";
import type { SlotStatus } from "@/lib/types";

export default function StatusBadge({ status }: { status: SlotStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[status]}`}>
      {status === "free" && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
