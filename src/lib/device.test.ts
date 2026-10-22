import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceInfo } from "./device";

afterEach(() => { vi.unstubAllGlobals(); });

describe("registered browser identity", () => {
  it("keeps the same device ID across repeated punches and account switches", () => {
    const values = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => values.set(key, value));
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem });
    vi.stubGlobal("navigator", { userAgent: "Test browser", platform: "Test phone" });
    const initial = deviceInfo()._device;
    expect(initial.length).toBeGreaterThanOrEqual(8);
    expect(deviceInfo()._device).toBe(initial);
    expect(deviceInfo()._device).toBe(initial);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});