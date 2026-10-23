import { describe, expect, it } from "vitest";
import { CONNECTION_MESSAGE, isConnectionError, requestErrorMessage } from "./request-errors";

describe("connection errors", () => {
  it.each([new TypeError("Load failed"), new TypeError("Failed to fetch"), { message: "TypeError: Load failed", details: "" }, "NetworkError when attempting to fetch resource."])("recognizes interrupted browser requests: %s", (error) => {
    expect(isConnectionError(error)).toBe(true);
    expect(requestErrorMessage(error)).toBe(CONNECTION_MESSAGE);
  });
  it("preserves security refusals instead of treating them as connection failures", () => {
    const message = "This device is blocked. Please contact your admin.";
    expect(isConnectionError(new Error(message))).toBe(false);
    expect(requestErrorMessage(new Error(message))).toBe(message);
  });
  it("handles unknown thrown values", () => {
    expect(requestErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });
});