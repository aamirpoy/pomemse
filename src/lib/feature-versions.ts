export const FEATURE_VERSIONS = [
  { key: "device_security", version: "V1", name: "Device & IP checks", detail: "Phone, network and suspicious attendance alerts" },
  { key: "meeting_location", version: "V2", name: "Office-only meetings", detail: "Office location required when going out and returning" },
  { key: "admin_notes", version: "V3", name: "Admin edit notes", detail: "Employee can see notes attached to edited time records" },
  { key: "device_approval", version: "V4", name: "Registered devices", detail: "Check-in only from devices an admin has approved" },
  { key: "biometric_check", version: "V5", name: "Face / fingerprint check-in", detail: "Phone's face or fingerprint unlock required before check-in/out" },
  { key: "arabic_language", version: "V6", name: "Arabic / English", detail: "Employee can switch My time to Arabic (right-to-left)" },
  { key: "change_undo", version: "V7", name: "Undo in change log", detail: "Admin can undo edits and restore deleted time records (tick for admins)" },
] as const;

export type FeatureKey = typeof FEATURE_VERSIONS[number]["key"];
export type FeatureAccess = { feature_key: string; user_id: string; enabled: boolean };
export type FeatureRollout = { feature_key: string; enabled_all: boolean };

export function hasVersionAccess(key: string, userId: string, access: FeatureAccess[], rollouts: FeatureRollout[]): boolean {
  const override = access.find((a) => a.feature_key === key && a.user_id === userId);
  return override?.enabled ?? rollouts.find((r) => r.feature_key === key)?.enabled_all ?? false;
}
