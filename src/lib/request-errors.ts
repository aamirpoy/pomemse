/** Browsers use different messages for the same interrupted fetch. */
export function isConnectionError(error: unknown): boolean {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return /(?:TypeError:\s*)?(?:Load failed|Failed to fetch|NetworkError|Network request failed|fetch failed|Failed to load module script|Failed to fetch dynamically imported module|Importing a module script failed)/i.test(message);
}

export const CONNECTION_MESSAGE = "Connection interrupted. Check your internet, then refresh to confirm the latest status before trying again.";

export function requestErrorMessage(error: unknown): string {
  if (isConnectionError(error)) return CONNECTION_MESSAGE;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) return error.message;
  return "Something went wrong. Please try again.";
}