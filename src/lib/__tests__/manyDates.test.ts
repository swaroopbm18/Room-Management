import { beforeEach, describe, expect, it, vi } from "vitest";

// One call for several dates (migration 0045), and one call a day when the database doesn't have it yet
const rpc = vi.fn();
let cookies: { name: string }[] = [{ name: "sb-x-auth-token" }];
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => cookies }) }));
vi.mock("../supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

const { getDaySchedules, getTimetables } = await import("../data");

beforeEach(() => {
  rpc.mockReset();
  cookies = [{ name: "sb-x-auth-token" }];
});

describe("several dates in one call", () => {
  it("splits the rows by date, in the order asked, with empty days kept", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { on_date: "2026-11-26", room_id: "B", slot_id: 1 },
        { on_date: "2026-11-24", room_id: "A", slot_id: 1 },
        { on_date: "2026-11-26", room_id: "C", slot_id: 2 },
      ],
      error: null,
    });
    const out = await getDaySchedules(["2026-11-26", "2026-11-25", "2026-11-24"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_day_schedule_many", { p_dates: ["2026-11-26", "2026-11-25", "2026-11-24"] });
    expect(out.map((rows) => rows.map((r) => r.room_id))).toEqual([["B", "C"], [], ["A"]]);
  });

  it("falls back to one call a day before database update 0045", async () => {
    rpc.mockImplementation(async (fn: string, args: { p_date?: string }) =>
      fn === "get_timetable_many" ? { data: null, error: { message: "function does not exist" } } : { data: [{ room_id: args.p_date }], error: null },
    );
    const out = await getTimetables(["2026-11-24", "2026-11-25"]);
    expect(out.map((rows) => rows[0].room_id)).toEqual(["2026-11-24", "2026-11-25"]);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("uses the shared one-day reads for students, who aren't signed in", async () => {
    cookies = [];
    rpc.mockImplementation(async (_fn: string, args: { p_date: string }) => ({ data: [{ room_id: args.p_date }], error: null }));
    await getDaySchedules(["2026-11-24", "2026-11-25"]);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["get_day_schedule", "get_day_schedule"]);
  });

  it("makes no call for a single date beyond the usual one", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await getTimetables(["2026-11-24"]);
    expect(rpc).toHaveBeenCalledWith("get_timetable", { p_date: "2026-11-24" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
