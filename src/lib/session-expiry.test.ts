import { describe, it, expect } from "vitest";
import { isSessionExpired } from "./session-expiry";

describe("1-day sign-in", () => {
  it("stays signed in within 24 hours", () => {
    expect(isSessionExpired(23 * 3600_000, 0)).toBe(false);
  });
  it("expires after 24 hours", () => {
    expect(isSessionExpired(25 * 3600_000, 0)).toBe(true);
  });
});
