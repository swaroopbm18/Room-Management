import { afterEach, describe, expect, it, vi } from "vitest";
import { closingDay, defaultSlot, setMakeupSundays, slotEnded, slotOpen, slotStarted } from "../time";
import type { Slot } from "../types";
import { SLOTS } from "./fixtures";

/** The fixture's morning plus an afternoon slot, which Saturday doesn't have. */
const DAY: Slot[] = [...SLOTS, { id: 5, starts: "14:00", ends: "14:55", label: "2:00 PM – 2:55 PM" }];

/** Sets the clock to a time in India (UTC+5:30), e.g. at("2026-11-24", "09:00"). */
function at(date: string, time: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${date}T${time}:00+05:30`));
}

afterEach(() => {
  vi.useRealTimers();
  setMakeupSundays([]);
});

describe("defaultSlot: which day and slot Home opens on", () => {
  it("opens on the slot running now", () => {
    at("2026-11-24", "09:00"); // Tuesday, during slot 2
    expect(defaultSlot(DAY)).toEqual({ date: "2026-11-24", slotId: 2 });
  });

  it("opens on the next slot in a break", () => {
    at("2026-11-24", "10:00"); // between 9:50 and 10:10
    expect(defaultSlot(DAY)).toEqual({ date: "2026-11-24", slotId: 3 });
  });

  it("moves to the next working day once the day's slots are over", () => {
    at("2026-11-24", "16:00");
    expect(defaultSlot(DAY)).toEqual({ date: "2026-11-25", slotId: 1 });
  });

  it("treats Saturday after 2 PM as over and skips Sunday", () => {
    at("2026-11-28", "12:30"); // Saturday: the morning is over and 2 PM is closed
    expect(defaultSlot(DAY)).toEqual({ date: "2026-11-30", slotId: 1 });
  });

  it("skips a holiday, today or the next day", () => {
    at("2026-11-24", "09:00");
    expect(defaultSlot(DAY, new Map([["2026-11-24", "Holiday"]]))).toEqual({ date: "2026-11-25", slotId: 1 });
    at("2026-11-24", "16:00");
    expect(defaultSlot(DAY, new Map([["2026-11-25", "Holiday"]]))).toEqual({ date: "2026-11-26", slotId: 1 });
  });

  it("opens on a make-up Sunday like a working day", () => {
    setMakeupSundays([["2026-11-29", 1]]);
    at("2026-11-29", "09:00");
    expect(defaultSlot(DAY)).toEqual({ date: "2026-11-29", slotId: 2 });
  });
});

describe("Saturday afternoons", () => {
  it("closes Saturday from 2 PM, unless it runs another weekday's timetable", () => {
    expect(slotOpen(closingDay("2026-11-28"), DAY[4])).toBe(false);
    expect(slotOpen(closingDay("2026-11-28"), DAY[0])).toBe(true);
    expect(slotOpen(closingDay("2026-11-28", 1), DAY[4])).toBe(true);
  });
});

describe("slotStarted and slotEnded", () => {
  it("compares today's slots with the time now, and other days by date", () => {
    at("2026-11-24", "09:00");
    expect(slotStarted("2026-11-24", DAY[1])).toBe(true);
    expect(slotEnded("2026-11-24", DAY[1])).toBe(false);
    expect(slotEnded("2026-11-24", DAY[0])).toBe(true);
    expect(slotStarted("2026-11-24", DAY[2])).toBe(false);
    expect(slotEnded("2026-11-23", DAY[4])).toBe(true);
    expect(slotStarted("2026-11-25", DAY[0])).toBe(false);
  });
});
