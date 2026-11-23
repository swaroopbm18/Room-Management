import { afterEach, describe, expect, it } from "vitest";
import { addDays, isClosedSunday, mondayOf, nextWorkingDay, setMakeupSundays, weekdayOf, workingDay } from "../time";

afterEach(() => setMakeupSundays([]));

describe("dates", () => {
  it("adds days across a month end", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the Monday of a week, Sunday counting as the next week", () => {
    expect(mondayOf("2026-11-26")).toBe("2026-11-23"); // Thursday
    expect(mondayOf("2026-11-29")).toBe("2026-11-30"); // Sunday
  });

  it("skips Sundays and holidays to the next working day", () => {
    const holidays = new Map([["2026-11-30", "Holiday"]]);
    expect(nextWorkingDay("2026-11-28", holidays)).toBe("2026-12-01"); // Sat → (Sun, holiday Mon) → Tue
    expect(workingDay("2026-11-24", holidays)).toBe("2026-11-24");
  });

  it("treats a make-up Sunday as a working day in the week before it", () => {
    expect(isClosedSunday("2026-11-29")).toBe(true);
    setMakeupSundays([["2026-11-29", weekdayOf("2026-11-24")]]);
    expect(isClosedSunday("2026-11-29")).toBe(false);
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(nextWorkingDay("2026-11-28")).toBe("2026-11-29");
  });
});
