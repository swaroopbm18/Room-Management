import type { Room, RoomKind } from "./types";

export const ROOM_KINDS: { value: RoomKind; label: string }[] = [
  { value: "classroom", label: "Classroom" },
  { value: "lab", label: "Lab" },
  { value: "seminar", label: "Seminar hall" },
];

export const SEAT_STEPS = [30, 60, 90, 120];

export const kindLabel = (k?: RoomKind) => ROOM_KINDS.find((x) => x.value === k)?.label ?? "Classroom";

/** A room with at least `seats` seats (a room with no capacity set always counts), of `kind`, with a projector if asked. */
export function roomMatches(r: Room, want: { seats: number; kind: string; projector: boolean }): boolean {
  if (want.seats && r.capacity != null && r.capacity < want.seats) return false;
  if (want.kind && (r.kind ?? "classroom") !== want.kind) return false;
  if (want.projector && !r.projector) return false;
  return true;
}

/** "60 seats · Lab · Projector" */
export const roomSummary = (r: Room) =>
  [r.capacity ? `${r.capacity} seats` : null, r.kind && r.kind !== "classroom" ? kindLabel(r.kind) : null, r.projector ? "Projector" : null].filter(Boolean).join(" · ");
