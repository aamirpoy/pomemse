import { describe, expect, it } from "vitest";
import { summarize } from "./analytics";

const row = (user_id: string, inAt: string, outAt: string | null) => ({
  id: inAt, user_id, check_in_at: inAt, check_out_at: outAt, check_in_distance_m: 0, check_out_distance_m: 0,
});

describe("admin analytics", () => {
  it("counts each employee's present days once even with multiple shifts", () => {
    const s = summarize([
      row("a", "2026-10-03T08:00:00", "2026-10-03T12:00:00"),
      row("a", "2026-10-03T13:00:00", "2026-10-03T17:00:00"),
      row("a", "2026-10-04T09:00:00", "2026-10-04T10:00:00"),
    ], 7, new Date("2026-10-04T20:00:00"));
    expect(s.perUser.get("a")!.days).toBe(2);
    expect(s.totalMs).toBe(9 * 3600000);
    expect(s.perUser.get("a")!.avgIn).toBe("08:30");
  });
});
