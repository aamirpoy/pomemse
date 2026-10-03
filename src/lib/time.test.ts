import { describe, expect, it } from "vitest";
import { distanceM, fmtDuration, workedMs } from "./time";

describe("timesheet rules", () => {
  it("counts hours between check-in and check-out", () => {
    expect(
      workedMs({ check_in_at: "2026-10-03T08:00:00Z", check_out_at: "2026-10-03T17:30:00Z" }),
    ).toBe(9.5 * 3600000);
    expect(fmtDuration(9.5 * 3600000)).toBe("9h 30m");
  });

  it("measures distance from the office pin", () => {
    // ~111 m north of the office
    const d = distanceM(24.5388351, 54.5245462, 24.5398351, 54.5245462);
    expect(Math.round(d)).toBe(111);
  });
});
