import { describe, expect, it } from "vitest";
import { noteForRecord } from "./admin-notes";

describe("private timesheet notes", () => {
  it("associates an admin note only with its own attendance record", () => {
    const note = { attendance_id: "record-a", note: "Corrected checkout", author_name: "Admin", updated_at: "2026-10-24T12:00:00Z" };
    expect(noteForRecord([note], "record-a")).toEqual(note);
    expect(noteForRecord([note], "record-b")).toBeUndefined();
  });
});