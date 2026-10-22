import { describe, expect, it } from "vitest";
import { distanceM, fmtDuration, workedMs, getPosition } from "./time";
import { vi } from "vitest";

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
  it("uses fresh high-accuracy GPS instead of a cached phone location", async () => {
    const position = { coords: { latitude: 24.5333726, longitude: 54.5299175, accuracy: 12 } } as GeolocationPosition;
    const acquire = vi.fn((success: PositionCallback) => success(position));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: acquire } });
    try {
      expect(await getPosition()).toBe(position);
      expect(acquire.mock.calls[0]?.length).toBe(3);
      expect(acquire).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    } finally { vi.unstubAllGlobals(); }
  });
  it("the recorded office punch is inside while distant coordinates stay outside", () => {
    expect(distanceM(24.5333726, 54.5299175, 24.533389, 54.529917)).toBeLessThan(1750);
    expect(distanceM(25, 55, 24.533389, 54.529917)).toBeGreaterThan(1750);
  });
});
