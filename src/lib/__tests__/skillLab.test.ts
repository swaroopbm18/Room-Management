import { describe, expect, it } from "vitest";
import { planSkillLabDay, type DayCell, type DayInput } from "../skillLab";
import { DATE, ROOMS, SLOTS, day, free, row } from "./fixtures";

const tt = (room: string, slot: number, subject: string, faculty: string[]): DayCell => ({ room_id: room, slot_id: slot, subject, faculty_initials: faculty, is_department: false });

/** A skill lab for 3B in LAB-1 over slots 1–2. LAB-1 has 3A's practical then; 3B has DBMS in CR-1. */
function input(over: Partial<DayInput> = {}): DayInput {
  const timetable = [tt("LAB-1", 1, "ML(P)-3A", ["AAA"]), tt("LAB-1", 2, "ML(P)-3A", ["AAA"]), tt("CR-1", 1, "DBMS-3B", ["BBB"]), tt("CR-1", 2, "DBMS-3B", ["BBB"])];
  return {
    date: DATE,
    schedule: day(timetable.map((c) => row(c.room_id, c.slot_id, "class", c.subject))),
    timetable,
    status: free(["AAA", "BBB", "SKL"], [["AAA", 1], ["AAA", 2], ["BBB", 1], ["BBB", 2]]),
    rooms: ROOMS,
    slots: SLOTS,
    sections: ["3B"],
    semesterSections: { "3": ["3A", "3B"] },
    labs: ["LAB-1"],
    slotIds: [1, 2],
    faculty: ["SKL"],
    started: () => false,
    ...over,
  };
}

describe("planSkillLabDay", () => {
  it("releases the attending section's own classes", () => {
    const plan = planSkillLabDay(input());
    expect(plan.releases.map((r) => [r.room, r.slot, r.section])).toEqual([
      ["CR-1", 1, "3B"],
      ["CR-1", 2, "3B"],
    ]);
  });

  it("moves another section's practical out of the lab to a free lab at the same time", () => {
    const plan = planSkillLabDay(input());
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0]).toMatchObject({ subject: "ML(P)-3A", from: "LAB-1", room: "LAB-2", slots: [1, 2] });
    expect(plan.unplaced).toEqual([]);
  });

  it("does not treat an attending section's class in the lab as displaced", () => {
    const timetable = [tt("LAB-1", 1, "ML(P)-3B", ["AAA"]), tt("LAB-1", 2, "ML(P)-3B", ["AAA"])];
    const plan = planSkillLabDay(input({ timetable, schedule: day(timetable.map((c) => row(c.room_id, c.slot_id, "class", c.subject))) }));
    expect(plan.moves).toEqual([]);
    expect(plan.unplaced).toEqual([]);
  });

  it("keeps a class shared with a section that is not attending", () => {
    const timetable = [tt("CR-2", 1, "OS-3A/3B", ["BBB"])];
    const plan = planSkillLabDay(input({ timetable, schedule: day(timetable.map((c) => row(c.room_id, c.slot_id, "class", c.subject))) }));
    expect(plan.releases).toEqual([]);
    expect(plan.shared).toHaveLength(1);
  });

  it("flags the skill lab's faculty when they are busy then", () => {
    const plan = planSkillLabDay(input({ status: free(["AAA", "BBB", "SKL"], [["SKL", 2]]) }));
    expect(plan.facultyClashes).toHaveLength(1);
  });
});
