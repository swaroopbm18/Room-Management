import { describe, expect, it } from "vitest";
import { affectedOn, byPriority, causeOf, DayState, makeSectionsOf, type Day } from "../affected";
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

  it("leaves out a class whose sections are named only in the event's description (the bug)", () => {
    const out = affected([cell("LAB-1", 1, "ML(P)-3B")], [row("LAB-1", 1, "event", "Skill Lab", { reason: "Skill lab for 3B and 3D" })]);
    expect(out).toEqual([]);
  });

  it("still lists a class of a section that does not attend", () => {
    const out = affected([cell("LAB-1", 1, "ML(P)-3A")], [row("LAB-1", 1, "event", "Skill Lab - 3B")]);
    expect(out).toHaveLength(1);
    expect(out[0].cause).toBe("event");
  });

  it("leaves out a class whose section is at an event in another room", () => {
    const out = affected([cell("CR-1", 1, "DBMS-3A")], [row("CR-1", 1, "booked", "DBMS-3B"), row("LAB-1", 1, "event", "Workshop - 3A")]);
    expect(out).toEqual([]);
  });

  it("leaves out a class whose section's class was released for an event", () => {
    const out = affected([cell("CR-1", 1, "DBMS-3A")], [row("CR-1", 1, "booked", "OS-3B"), row("CR-2", 1, "free", null, { reason: "Class dropped: 3A at Workshop" })]);
    expect(out).toEqual([]);
  });

  it("lists a class whose room a CIE took, unless its semester is off for it", () => {
    const cie = row("CR-1", 1, "cie", "CIE-2, 5th sem");
    expect(affected([cell("CR-1", 1, "DBMS-3A")], [cie])[0]?.cause).toBe("exam");
    const off = row("CR-2", 4, "free", null, { reason: "Class dropped: Cancelled for CIE: CIE-2, semester 3" });
    expect(affected([cell("CR-1", 1, "DBMS-3A")], [cie, off])).toEqual([]);
  });

  it("puts events first, then exams, then other bookings", () => {
    const tt = [cell("CR-1", 1, "DBMS-3A"), cell("CR-2", 1, "OS-3B"), cell("LAB-2", 2, "AI-3A")];
    const out = affected(tt, [row("CR-1", 1, "booked", "ML-5A"), row("CR-2", 1, "cie", "CIE-1"), row("LAB-2", 2, "event", "Hackathon")]).sort(byPriority(SLOTS));
    expect(out.map((a) => a.cause)).toEqual(["event", "exam", "booking"]);
  });
});

describe("causeOf", () => {
  it("treats a skill lab or an approved event request as an event, and a moved class as a booking", () => {
    expect(causeOf({ status: "booked", subject: "Skill Lab - 3B/3D", reason: "" })).toBe("event");
    expect(causeOf({ status: "booked", subject: "AI workshop", reason: "" })).toBe("event");
    expect(causeOf({ status: "booked", subject: "DBMS-3A", reason: "" })).toBe("booking");
    expect(causeOf({ status: "cie", subject: "SEE DBMS", reason: "" })).toBe("exam");
  });
});
