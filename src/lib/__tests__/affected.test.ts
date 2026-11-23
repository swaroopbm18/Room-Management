import { describe, expect, it } from "vitest";
import { affectedOn, DayState, makeSectionsOf, type Day } from "../affected";
import type { DayCell } from "../skillLab";
import { DATE, SLOTS, day, free, row } from "./fixtures";

const sectionsOf = makeSectionsOf({ "3": ["3A", "3B"] });
const cell = (room: string, slot: number, subject: string): DayCell => ({ room_id: room, slot_id: slot, subject, faculty_initials: ["AAA"], is_department: false });

function affected(timetable: DayCell[], schedule: ReturnType<typeof row>[]) {
  const d: Day = { date: DATE, timetable, schedule: day(schedule), status: free(["AAA"]) };
  return affectedOn(new DayState(d, sectionsOf), d, SLOTS, () => false, () => false);
}

describe("affectedOn", () => {
  it("lists a class whose room an event took, joining back-to-back slots", () => {
    const tt = [cell("CR-1", 1, "DBMS-3A"), cell("CR-1", 2, "DBMS-3A")];
    const out = affected(tt, [row("CR-1", 1, "event", "IEEE talk"), row("CR-1", 2, "event", "IEEE talk")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ room: "CR-1", slots: [1, 2], subject: "DBMS-3A", takenBy: "IEEE talk" });
  });

  it("leaves out a class still in its room", () => {
    expect(affected([cell("CR-1", 1, "DBMS-3A")], [row("CR-1", 1, "class", "DBMS-3A")])).toEqual([]);
  });

  it("leaves out a class whose own section the booking is for", () => {
    expect(affected([cell("LAB-1", 1, "ML(P)-3B")], [row("LAB-1", 1, "booked", "Skill Lab-3B")])).toEqual([]);
  });

  it("leaves out a class whose room went to a class moved there", () => {
    const moved = row("CR-1", 1, "booked", "OS-3B", { reason: "Moved from LAB-1, Skill Lab" });
    expect(affected([cell("CR-1", 1, "DBMS-3A")], [moved])).toEqual([]);
  });

  it("leaves out a class already moved elsewhere the same day", () => {
    const tt = [cell("CR-1", 1, "DBMS-3A")];
    const out = affected(tt, [row("CR-1", 1, "event", "IEEE talk"), row("CR-2", 3, "booked", "DBMS-3A", { reason: "Moved from CR-1, IEEE talk" })]);
    expect(out).toEqual([]);
  });
});
