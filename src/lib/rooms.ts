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

/** "MEL-CR-506" → "MEL-CR", to prefer rooms in the same block. */
const blockOf = (id: string) => id.replace(/-?[^-]*$/, "");

export type RoomSuggestion = { room: Room; why: string[] };

/**
 * Rooms free in every one of `slotIds` that day, most like `like` first: the same kind of room,
 * enough seats, a projector if it has one, then the same block and the nearest size.
 */
export function suggestRooms(rooms: Room[], free: (roomId: string, slotId: number) => boolean, slotIds: number[], like: Room | undefined, limit = 6): RoomSuggestion[] {
  return rooms
    .filter((r) => r.id !== like?.id && slotIds.length > 0 && slotIds.every((s) => free(r.id, s)))
    .map((r) => {
      const why: string[] = [];
      let score = 0;
      if (like) {
        if ((r.kind ?? "classroom") === (like.kind ?? "classroom")) {
          score += 4;
          why.push(kindLabel(r.kind));
        }
        if (like.capacity && r.capacity && r.capacity >= like.capacity) {
          score += 3;
          why.push(`${r.capacity} seats`);
        }
        if (like.projector && r.projector) {
          score += 2;
          why.push("projector");
        }
        if (blockOf(r.id) && blockOf(r.id) === blockOf(like.id)) {
          score += 1;
          why.push("same block");
        }
      }
      const gap = like?.capacity && r.capacity ? Math.abs(r.capacity - like.capacity) : 999;
      return { room: r, why, score, gap };
    })
    .sort((a, b) => b.score - a.score || a.gap - b.gap || a.room.sort_order - b.room.sort_order)
    .slice(0, limit)
    .map(({ room, why }) => ({ room, why }));
}
