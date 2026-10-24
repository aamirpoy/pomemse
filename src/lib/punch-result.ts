export type PunchAction = "check_in" | "check_out" | "out" | "back";

/** A transport success alone is never attendance confirmation. */
export function confirmedPunch(value: unknown, expected: PunchAction) {
  if (!value || typeof value !== "object") throw new Error("Result not confirmed. Refresh to check your status before trying again.");
  const result = value as { error?: unknown; action?: unknown; record_id?: unknown; saved_at?: unknown };
  if (typeof result.error === "string" && result.error) throw new Error(result.error);
  if (result.action !== expected || typeof result.record_id !== "string" || typeof result.saved_at !== "string") {
    throw new Error("Result not confirmed. Refresh to check your status before trying again.");
  }
  return { action: expected, recordId: result.record_id, savedAt: result.saved_at };
}