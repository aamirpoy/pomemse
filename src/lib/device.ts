const KEY = "pome-device-id";

/** Stable per-browser device ID used for punch checks. Call only in event handlers. */
export function deviceInfo() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return { _device: id, _ua: `${navigator.userAgent} | ${navigator.platform}` };
}
