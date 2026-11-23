import { IconPencil } from "@/components/Icons";
import SubmitButton from "@/components/SubmitButton";
import type { ReportEdit } from "@/lib/report";
import { adminEditRecord } from "../../actions/bookings";

/**
 * Admin-only, on screen only: change a report row's name, description and faculty. The change
 * covers every slot in the row; the old entries stay in History.
 */
export default function EditRecord({ edit, faculty, back }: { edit: ReportEdit; faculty: { initials: string; name: string }[]; back: string }) {
  return (
    <details className="group mt-1 print:hidden">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand-600 hover:underline group-open:hidden dark:text-brand-400 [&::-webkit-details-marker]:hidden">
        <IconPencil className="h-3.5 w-3.5" /> Edit
      </summary>
      <form action={adminEditRecord} className="mt-2 grid w-full max-w-md gap-2">
        <input type="hidden" name="room" value={edit.room} />
        <input type="hidden" name="date" value={edit.date} />
        <input type="hidden" name="slots" value={edit.slots.join(",")} />
        <input type="hidden" name="back" value={back} />
        <label className="grid gap-1 text-xs font-medium">
          Name
          <input name="title" defaultValue={edit.title} maxLength={80} className="input py-1.5 font-normal" />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Description
          <textarea name="reason" defaultValue={edit.reason} required minLength={3} maxLength={500} rows={3} className="input py-1.5 font-normal" />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Faculty
          <select name="faculty" defaultValue="" className="input py-1.5 font-normal">
            <option value="">Keep as it is</option>
            <option value="-">No faculty</option>
            {faculty.map((f) => (
              <option key={f.initials} value={f.initials}>
                {f.name === f.initials ? f.initials : `${f.name} (${f.initials})`}
              </option>
            ))}
          </select>
        </label>
        <div>
          <SubmitButton className="btn-primary py-1.5" pendingText="Saving…" message="Saving the record…">
            Save
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
