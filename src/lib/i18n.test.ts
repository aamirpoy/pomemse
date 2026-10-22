import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

describe("language", () => {
  it("English keeps the original wording", () => {
    expect(translate("en", "Check in")).toBe("Check in");
  });
  it("Arabic translates employee wording", () => {
    expect(translate("ar", "Check in")).toBe("تسجيل الدخول");
  });
  it("falls back to English for unknown text", () => {
    expect(translate("ar", "Some new text")).toBe("Some new text");
  });
});
