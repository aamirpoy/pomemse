import { describe, expect, it } from "vitest";
import { confirmedPunch } from "./punch-result";

describe("attendance confirmation", () => {
  it("never confirms a refusal", () => {
    expect(() => confirmedPunch({ error: "Outside office", action: "check_in" }, "check_in")).toThrow("Outside office");
  });
  it("never treats an empty response as success", () => {
    expect(() => confirmedPunch(null, "check_out")).toThrow("not confirmed");
    expect(() => confirmedPunch({}, "check_out")).toThrow("not confirmed");
  });
  it("requires the requested action and a saved record", () => {
    const result = { action: "check_in", record_id: "saved-record", saved_at: "2026-10-24T12:00:00Z" };
    expect(confirmedPunch(result, "check_in").recordId).toBe("saved-record");
    expect(() => confirmedPunch(result, "check_out")).toThrow("not confirmed");
  });
});