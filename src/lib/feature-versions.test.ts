import { describe, expect, it } from "vitest";
import { FEATURE_VERSIONS, eligibleFor, hasVersionAccess } from "./feature-versions";

describe("named update access", () => {
  it("does not enable an unassigned version", () => {
    expect(hasVersionAccess("admin_notes", "employee-a", [], [])).toBe(false);
  });
  it("assigns versions independently for each employee", () => {
    const access = [{ feature_key: "device_security", user_id: "employee-a", enabled: true }];
    expect(hasVersionAccess("device_security", "employee-a", access, [])).toBe(true);
    expect(hasVersionAccess("admin_notes", "employee-a", access, [])).toBe(false);
    expect(hasVersionAccess("device_security", "employee-b", access, [])).toBe(false);
  });
  it("everyone includes existing and future employees", () => {
    const rollouts = [{ feature_key: "admin_notes", enabled_all: true }];
    expect(hasVersionAccess("admin_notes", "employee-a", [], rollouts)).toBe(true);
    expect(hasVersionAccess("admin_notes", "future-employee", [], rollouts)).toBe(true);
  });
  it("can exclude a person while everyone else has access", () => {
    expect(hasVersionAccess("admin_notes", "employee-a", [{ feature_key: "admin_notes", user_id: "employee-a", enabled: false }], [{ feature_key: "admin_notes", enabled_all: true }])).toBe(false);
  });
  it("admin-only updates are offered only to admins", () => {
    const people = [{ id: "admin-a" }, { id: "worker-b" }];
    expect(eligibleFor("admin", people, new Set(["admin-a"])).map((p) => p.id)).toEqual(["admin-a"]);
    expect(eligibleFor("everyone", people, new Set(["admin-a"])).length).toBe(2);
  });
  it("undo in change log is admin-only", () => {
    expect(FEATURE_VERSIONS.find((v) => v.key === "change_undo")?.audience).toBe("admin");
  });
});