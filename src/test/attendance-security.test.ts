import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0016_universal_fresh_attendance_and_admin_cleanup.sql", "utf8");
const clock = sql.split("CREATE OR REPLACE FUNCTION public.clock_action")[1]?.split("CREATE OR REPLACE FUNCTION public.outing_action")[0] ?? "";
const outing = sql.split("CREATE OR REPLACE FUNCTION public.outing_action")[1]?.split("CREATE OR REPLACE FUNCTION public.admin_cleanup_records")[0] ?? "";
describe("universal attendance rules", () => {
  it.each([clock, outing])("enforces capture time and accuracy without device/IP access", (fn) => {
    expect(fn).toContain("abs(extract(epoch FROM now())*1000-_captured_at)>30000");
    expect(fn).toContain("_acc IS NULL OR NOT (_acc>0 AND _acc<=150)");
    expect(fn).not.toContain("has_feature_access(uid,'device_security')");
    expect(fn).toContain("'record_id'");
  });
  it("shared-network matches are persisted as informational account IDs", () => {
    expect(sql).toContain("array_agg(DISTINCT pe.user_id)");
    expect(sql).toContain("interval '10 minutes'");
    expect(clock).not.toContain("'shared_ip'");
    expect(outing).not.toContain("'shared_ip'");
  });
  it("cleanup authorizes admins and protects open attendance and outings", () => {
    const cleanup = sql.split("CREATE OR REPLACE FUNCTION public.admin_cleanup_records")[1] ?? "";
    expect(cleanup).toContain("NOT public.has_role(uid,'admin')");
    expect(cleanup).toContain("DELETE FROM public.attendance WHERE id=ANY(eligible) AND check_out_at IS NOT NULL");
    expect(cleanup).toContain("DELETE FROM public.work_outings WHERE id=ANY(eligible) AND back_at IS NOT NULL");
    expect(cleanup).toContain("IF NOT _preview THEN");
  });
});