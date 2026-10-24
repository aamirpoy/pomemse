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
  const fix = (accuracy: number, timestamp = Date.now()) =>
    ({ coords: { latitude: 24.5333726, longitude: 54.5299175, accuracy }, timestamp }) as GeolocationPosition;
  const stubWatch = (fixes: (() => GeolocationPosition)[]) => {
    const watch = vi.fn((success: PositionCallback) => { fixes.forEach((f) => success(f())); return 1; });
    vi.stubGlobal("navigator", { geolocation: { watchPosition: watch, clearWatch: vi.fn() } });
    return watch;
  };
  it("uses fresh high-accuracy GPS with no cached location", async () => {
    const p = fix(12);
    const watch = stubWatch([() => p]);
    try {
      expect(await getPosition()).toBe(p);
      expect(watch).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    } finally { vi.unstubAllGlobals(); }
  });
  it("ignores an old cached fix and uses the fresh one", async () => {
    const p = fix(12);
    stubWatch([() => fix(10, Date.now() - 60000), () => p]);
    try { expect(await getPosition()).toBe(p); } finally { vi.unstubAllGlobals(); }
  });
  it("keeps the most accurate reading when GPS is weak", async () => {
    const better = fix(120);
    stubWatch([() => fix(400), () => better, () => fix(300)]);
    try { expect(await getPosition(50)).toBe(better); } finally { vi.unstubAllGlobals(); }
  });
  it("refuses to punch with a location the phone cannot refresh", async () => {
    stubWatch([() => fix(10, Date.now() - 60000)]);
    try { await expect(getPosition(50)).rejects.toThrow("fresh location"); } finally { vi.unstubAllGlobals(); }
  });
  it("the recorded office punch is inside while distant coordinates stay outside", () => {
    expect(distanceM(24.5333726, 54.5299175, 24.533389, 54.529917)).toBeLessThan(1750);
    expect(distanceM(25, 55, 24.533389, 54.529917)).toBeGreaterThan(1750);
  });
  it("rejects a recently cached fix from before this click", async () => {
    stubWatch([() => fix(10, Date.now() - 5000)]);
    try { await expect(getPosition(50)).rejects.toThrow("fresh location"); } finally { vi.unstubAllGlobals(); }
  });
  it.each([NaN, undefined, Date.now() + 60000])("rejects missing, invalid or future capture times: %s", async (timestamp) => {
    stubWatch([() => ({ ...fix(10), timestamp: timestamp as number })]);
    try { await expect(getPosition(50)).rejects.toThrow("fresh location"); } finally { vi.unstubAllGlobals(); }
  });
});
