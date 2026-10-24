export const FEATURE_VERSIONS = [
  { key: "device_security", version: "V1", audience: "everyone", name: "Device & IP checks", detail: "Security monitoring: records browser and network alerts without requiring device approval. Shared Wi-Fi is allowed. Fresh GPS and saved/blocked results now apply to everyone, even with this switch off." },
  { key: "meeting_location", version: "V2", audience: "everyone", name: "Office-only meetings", detail: "Requires staff to be within the office area when going out or returning. Fresh GPS is always requested for both actions, even with this switch off." },
  { key: "admin_notes", version: "V3", audience: "everyone", name: "Admin edit notes", detail: "Employee sees notes attached to edited time records" },
  { key: "device_approval", version: "V4", audience: "everyone", name: "Registered devices", detail: "One account per registered browser; admin approval and removal required" },
  { key: "biometric_check", version: "V5", audience: "everyone", name: "Face / fingerprint check-in", detail: "Phone's face or fingerprint unlock required before check-in/out" },
  { key: "arabic_language", version: "V6", audience: "everyone", name: "Arabic / English", detail: "Switch My time to Arabic (right-to-left)" },
  { key: "change_undo", version: "V7", audience: "admin", name: "Undo in change log", detail: "Undo edits and restore deleted time records" },
] as const;

export type FeatureKey = typeof FEATURE_VERSIONS[number]["key"];
export type FeatureAudience = "everyone" | "admin";
export type FeatureAccess = { feature_key: string; user_id: string; enabled: boolean };
export type FeatureRollout = { feature_key: string; enabled_all: boolean };

export function hasVersionAccess(key: string, userId: string, access: FeatureAccess[], rollouts: FeatureRollout[]): boolean {
  const override = access.find((a) => a.feature_key === key && a.user_id === userId);
  return override?.enabled ?? rollouts.find((r) => r.feature_key === key)?.enabled_all ?? false;
}

/** People who can be given a version: admin-only updates are offered to admins only. */
export function eligibleFor<T extends { id: string }>(audience: FeatureAudience, people: T[], adminIds: Set<string>): T[] {
  return audience === "admin" ? people.filter((p) => adminIds.has(p.id)) : people;
}
