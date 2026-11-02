import { adminEditBooking } from "@/app/actions";
import { IconPencil } from "./Icons";
import SubmitButton from "./SubmitButton";

/**
 * Admin-only: change the name and description a booked slot shows in the timetable.
 * Covers the whole booking: every back-to-back slot of it in that room on that day.
 */
export default function EditBooking({
  room,
  date,
  slot,
  title,
  reason,
  back,
}: {
  room: string;
  date: string;
  slot: number;
  title: string;
  reason: string;
  back: string;
}) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand-600 hover:underline group-open:hidden dark:text-brand-400 [&::-webkit-details-marker]:hidden">
        <IconPencil className="h-3.5 w-3.5" /> Edit name or description
      </summary>
      <form action={adminEditBooking} className="mt-2 grid w-full max-w-md gap-2">
        <input type="hidden" name="room" value={room} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="slot" value={slot} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="old_reason" value={reason} />
        <label className="grid gap-1 text-xs font-medium">
          Name
          <input name="title" defaultValue={title} required maxLength={80} className="input py-1.5 font-normal" />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Description
          <textarea name="reason" defaultValue={reason} required maxLength={500} rows={2} className="input py-1.5 font-normal" />
        </label>
        <div>
          <SubmitButton className="btn-primary py-1.5" pendingText="Saving…" message="Saving the booking…">
            Save
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
