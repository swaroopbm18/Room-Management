import { IconTrash } from "@/components/Icons";
import SubmitButton from "@/components/SubmitButton";
import type { ReportDelete } from "@/lib/report";
import { adminDeleteRecord } from "../../actions";

/**
 * Admin-only, on screen only: delete a wrong row, past ones included. Its slots go back to the
 * timetable (a dropped class comes back); the old entry stays in History.
 */
export default function DeleteRecord({ del, type, back }: { del: ReportDelete; type: string; back: string }) {
  return (
    <form action={adminDeleteRecord} className="mt-1 print:hidden">
      <input type="hidden" name="room" value={del.room} />
      <input type="hidden" name="date" value={del.date} />
      <input type="hidden" name="slots" value={del.slots.join(",")} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton
        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
        pendingText="Deleting…"
        message="Deleting the record…"
        confirm={`Delete this ${type.toLowerCase()} record in ${del.room}? Its time goes back to the regular timetable${type === "Class dropped" || type === "Class cancelled" ? " (the class comes back)" : ""}. The old entry stays in History.`}
        confirmLabel="Delete"
      >
        <IconTrash className="h-3.5 w-3.5" /> Delete
      </SubmitButton>
    </form>
  );
}
