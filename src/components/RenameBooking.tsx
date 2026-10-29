import { adminRenameBooking } from "@/app/actions";
import { IconPencil } from "./Icons";
import SubmitButton from "./SubmitButton";

/** Admin-only: change the name a booked slot shows in the timetable (covers the whole booking). */
export default function RenameBooking({ room, date, slot, title, back }: { room: string; date: string; slot: number; title: string; back: string }) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand-600 hover:underline group-open:hidden dark:text-brand-400 [&::-webkit-details-marker]:hidden">
        <IconPencil className="h-3.5 w-3.5" /> Rename
      </summary>
      <form action={adminRenameBooking} className="mt-1 flex flex-wrap items-center gap-2">
        <input type="hidden" name="room" value={room} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="slot" value={slot} />
        <input type="hidden" name="back" value={back} />
        <input name="title" defaultValue={title} required maxLength={80} aria-label="New name" className="input w-48 py-1.5" />
        <SubmitButton className="btn-primary py-1.5" pendingText="Saving…" message="Renaming the booking…">
          Save
        </SubmitButton>
      </form>
    </details>
  );
}
