// SQL safety regression: PostgreSQL treats an untyped scalar on the right of
// array || as an array literal, rolling back the entire failed-punch attempt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0014_fix_security_flag_array_append.sql", "utf8");

describe("security event flag persistence", () => {
  it("adds outside-office flags as single array elements without invalid array casts", () => {
    expect(sql).toContain("f:=array_append(f,'outside_office')");
    expect(sql).not.toMatch(/f\s*:=\s*f\s*\|\|\s*'/);
  });
});