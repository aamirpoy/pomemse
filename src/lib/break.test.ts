import { describe, expect, it } from "vitest";
import { totalMs } from "./time";
const r = (u: string, a: string, b: string | null) => ({ user_id: u, check_in_at: a, check_out_at: b });
describe("1 hour break", () => {
  it("deducts 1h once per completed employee-day", () => {
    const rows = [r("a", "2026-10-03T08:00:00", "2026-10-03T12:00:00"), r("a", "2026-10-03T13:00:00", "2026-10-03T17:00:00")];
    expect(totalMs(rows, true)).toBe(7 * 3600000);
    expect(totalMs(rows, false)).toBe(8 * 3600000);
  });
  it("does not deduct while still checked in", () => {
    expect(totalMs([r("a", "2026-10-03T08:00:00", null)], true, new Date("2026-10-03T12:00:00").getTime())).toBe(4 * 3600000);
  });
});
