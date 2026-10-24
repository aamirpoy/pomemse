export type AttendanceRow = {
  id: string;
  user_id: string;
  admin_note?: string | null;
  admin_note_by?: string | null;
  admin_note_at?: string | null;
  check_in_at: string;
  check_out_at: string | null;
  check_in_distance_m: number | null;
  check_out_distance_m: number | null;
  check_in_note?: string | null;
  check_out_note?: string | null;
};

/** Worked milliseconds for a record; open records count until `now`. */
export function workedMs(r: Pick<AttendanceRow, "check_in_at" | "check_out_at">, now = Date.now()) {
  const end = r.check_out_at ? new Date(r.check_out_at).getTime() : now;
  return Math.max(0, end - new Date(r.check_in_at).getTime());
}

export function fmtDuration(ms: number) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

/** A GPS fix older than this is treated as stale and re-read. */
export const LOCATION_FRESH_MS = 15000;

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is not supported on this device"));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.message)), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

const isStale = (p: GeolocationPosition, requestedAt: number) =>
  !Number.isFinite(p.timestamp) || p.timestamp < requestedAt - 1000 ||
  p.timestamp > Date.now() + 1000 || Date.now() - p.timestamp > LOCATION_FRESH_MS;

/** Fresh, high-accuracy GPS read. Retries once if the phone hands back a cached fix; rejects if still stale. */
export async function getPosition(): Promise<GeolocationPosition> {
  const requestedAt = Date.now();
  let pos = await readPosition();
  if (isStale(pos, requestedAt)) pos = await readPosition();
  if (isStale(pos, requestedAt)) throw new Error("Could not get a fresh location. Please check your GPS and try again.");
  return pos;
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toR(lat2 - lat1) / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(toR(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const BREAK_MS = 3600000;
/** Employee-facing hours never apply the admin-only break deduction. */
export function employeeTotalMs(rows: Pick<AttendanceRow, "user_id" | "check_in_at" | "check_out_at">[], now = Date.now()) {
  return totalMs(rows, false, now);
}
const dayOf = (iso: string) => new Date(iso).toDateString();

/** Total worked ms; with `withBreak`, each employee-day whose records are all checked out loses 1h (never below 0). */
export function totalMs(rows: Pick<AttendanceRow, "user_id" | "check_in_at" | "check_out_at">[], withBreak: boolean, now = Date.now()) {
  const days = new Map<string, { ms: number; open: boolean }>();
  for (const r of rows) {
    const k = r.user_id + "|" + dayOf(r.check_in_at);
    const d = days.get(k) ?? { ms: 0, open: false };
    d.ms += workedMs(r, now);
    d.open ||= !r.check_out_at;
    days.set(k, d);
  }
  let t = 0;
  for (const d of days.values()) t += withBreak && !d.open ? Math.max(0, d.ms - BREAK_MS) : d.ms;
  return t;
}
