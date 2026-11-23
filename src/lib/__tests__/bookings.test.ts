import { describe, expect, it } from "vitest";
import { mergeRuns } from "../bookings";
import { SLOTS } from "./fixtures";

type R = { date: string; room_id: string; slot_id: number; title: string };
const r = (room_id: string, slot_id: number, title = "IEEE talk", date = "2026-11-24"): R => ({ date, room_id, slot_id, title });

describe("mergeRuns", () => {
  it("joins back-to-back slots of one booking", () => {
    const runs = mergeRuns([r("CR-1", 1), r("CR-1", 2), r("CR-1", 3)], SLOTS, (a, b) => a.title === b.title);
    expect(runs).toHaveLength(1);
    expect(runs[0].slotIds).toEqual([1, 2, 3]);
    expect(runs[0].range).toBe("8:00 AM – 11:05 AM");
  });

  it("starts a new record after a gap, in another room or for another booking", () => {
    const runs = mergeRuns([r("CR-1", 1), r("CR-1", 3), r("CR-2", 2), r("CR-1", 4, "CIE")], SLOTS, (a, b) => a.title === b.title);
    expect(runs.map((x) => [x.first.room_id, x.slotIds])).toEqual([
      ["CR-1", [1]],
      ["CR-1", [3]],
      ["CR-2", [2]],
      ["CR-1", [4]],
    ]);
  });
});
