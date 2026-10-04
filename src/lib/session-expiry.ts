export const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const KEY = "pme-login-at";

export function markLogin() {
  localStorage.setItem(KEY, String(Date.now()));
}

export function isSessionExpired(now = Date.now(), loginAt: number | null = readLoginAt()) {
  if (loginAt == null) return false;
  return now - loginAt > SESSION_MAX_MS;
}

export function readLoginAt(): number | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(KEY);
  return v ? Number(v) : null;
}

export function clearLogin() {
  localStorage.removeItem(KEY);
}
