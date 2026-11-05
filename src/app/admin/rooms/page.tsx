import Flash from "@/components/Flash";
import { IconCheck, IconPlus, IconQr, IconTrash } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import PendingLink from "@/components/PendingLink";
import SubmitButton from "@/components/SubmitButton";
import { getRooms } from "@/lib/data";
import { ROOM_KINDS } from "@/lib/rooms";
import { createClient } from "@/lib/supabase/server";
import { addRoom, deleteRoom, updateRoom } from "../../actions";

export const dynamic = "force-dynamic";

/** Each room's seats, kind and projector, used to filter free rooms. */
export default async function RoomDetails({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [rooms, usedRes] = await Promise.all([getRooms(), supabase.rpc("admin_rooms_in_use")]);
  const ready = rooms.some((r) => r.kind !== undefined);
  // Before migration 0022 there is no add or delete; a room with anything on record can't be deleted
  const canAddDelete = !usedRes.error;
  const used = new Set((usedRes.data ?? []) as string[]);

  return (
    <div className="space-y-6">
      <PageHeader title="Room details" subtitle="Seats, kind of room and projector for each room. Anyone looking for a free room can filter by them on the Free slots page.">
        <PendingLink href="/admin/rooms/posters" className="btn-secondary">
          <IconQr className="h-4 w-4" /> QR posters
        </PendingLink>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error} />
      {!ready && <div className="card muted p-4 text-sm">Run supabase/migrations/0020_day_swaps_notices_rooms.sql in the Supabase SQL Editor to save room details.</div>}
      {ready && !canAddDelete && <div className="card muted p-4 text-sm">Run supabase/migrations/0022_delete_faculty_and_rooms.sql in the Supabase SQL Editor to add and delete rooms.</div>}

      {canAddDelete && <AddRoom />}

      <div className="card divide-y divide-brand-100 dark:divide-brand-900">
        {rooms.map((r) => (
          <form key={r.id} action={updateRoom} className="grid items-end gap-3 p-4 sm:grid-cols-[7rem_7rem_10rem_auto_1fr_auto]">
            <input type="hidden" name="room" value={r.id} />
            <input type="hidden" name="back" value="/admin/rooms" />
            <div>
              <div className="muted text-xs">Room</div>
              <div className="text-lg font-semibold">{r.name}</div>
            </div>
            <div>
              <label className="label" htmlFor={`cap-${r.id}`}>Seats</label>
              <input id={`cap-${r.id}`} name="capacity" type="number" min={1} max={1000} defaultValue={r.capacity ?? ""} className="input" placeholder="e.g. 60" />
            </div>
            <div>
              <label className="label" htmlFor={`kind-${r.id}`}>Kind</label>
              <select id={`kind-${r.id}`} name="kind" defaultValue={r.kind ?? "classroom"} className="input">
                {ROOM_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" name="projector" defaultChecked={!!r.projector} className="h-4 w-4 accent-brand-600" /> Projector
            </label>
            <div>
              <label className="label" htmlFor={`notes-${r.id}`}>Notes</label>
              <input id={`notes-${r.id}`} name="notes" maxLength={120} defaultValue={r.notes ?? ""} className="input" placeholder="e.g. Smart board, 40 PCs" />
            </div>
            <div className="flex gap-2">
              <SubmitButton className="btn-primary" pendingText="Saving…" message={`Saving room ${r.name}…`}>
                <IconCheck className="h-4 w-4" /> Save
              </SubmitButton>
              {canAddDelete && !used.has(r.id) && (
                <SubmitButton
                  formAction={deleteRoom}
                  className="btn-secondary px-2.5 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                  pendingText=""
                  message={`Deleting room ${r.name}…`}
                  confirm={`Delete room ${r.name}? It has no classes or bookings yet, and it will disappear from every list.`}
                  aria-label={`Delete room ${r.name}`}
                >
                  <IconTrash className="h-4 w-4" />
                </SubmitButton>
              )}
            </div>
          </form>
        ))}
      </div>
      {canAddDelete && <p className="muted text-xs">Only rooms with no classes, requests or bookings on record can be deleted, so the history never loses a room.</p>}
    </div>
  );
}

/** A new room: it shows on the home page, Free slots, Class timetables and every admin list. */
function AddRoom() {
  return (
    <form action={addRoom} className="card grid items-end gap-3 p-4 sm:grid-cols-[10rem_7rem_10rem_auto_1fr_auto]">
      <input type="hidden" name="back" value="/admin/rooms" />
      <div>
        <label className="label" htmlFor="new-room">Add a room</label>
        <input id="new-room" name="room" required maxLength={24} className="input font-mono uppercase" placeholder="e.g. MEL-CR-509" />
      </div>
      <div>
        <label className="label" htmlFor="new-cap">Seats</label>
        <input id="new-cap" name="capacity" type="number" min={1} max={1000} className="input" placeholder="e.g. 60" />
      </div>
      <div>
        <label className="label" htmlFor="new-kind">Kind</label>
        <select id="new-kind" name="kind" defaultValue="classroom" className="input">
          {ROOM_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="projector" className="h-4 w-4 accent-brand-600" /> Projector
      </label>
      <div>
        <label className="label" htmlFor="new-notes">Notes</label>
        <input id="new-notes" name="notes" maxLength={120} className="input" placeholder="e.g. Smart board, 40 PCs" />
      </div>
      <SubmitButton className="btn-primary" pendingText="Adding…" message="Adding the room…">
        <IconPlus className="h-4 w-4" /> Add room
      </SubmitButton>
    </form>
  );
}
