import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0018_private_admin_timesheet_notes.sql", "utf8");
describe("admin note privacy", () => {
  it("allows only admins to read private notes", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'))");
    expect(sql).not.toContain("GRANT SELECT ON public.attendance_admin_notes TO anon");
  });
  it("removes private text from employee-readable attendance", () => {
    expect(sql).toContain("UPDATE public.attendance SET admin_note=NULL,admin_note_by=NULL,admin_note_at=NULL WHERE id=NEW.id");
    expect(sql).toContain("FROM public.attendance WHERE nullif(trim(admin_note),'') IS NOT NULL");
  });
});