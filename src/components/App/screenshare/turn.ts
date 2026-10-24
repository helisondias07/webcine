// Renew a 6h TURN credential 5 minutes before coturn stops accepting it,
// and again when the tab comes back if it is already inside the last 10
// minutes. A 2h movie plus a late F5 stays inside the relay window.
export const TURN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
export const TURN_VISIBLE_REFRESH_WITHIN_MS = 10 * 60 * 1000;
const MIN_REFRESH_DELAY_MS = 60_000;

export function turnRefreshDelayMs(ttlSeconds: number): number {
  const ttlMs = (Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 0) * 1000;
  return Math.max(MIN_REFRESH_DELAY_MS, ttlMs - TURN_REFRESH_MARGIN_MS);
}

export function shouldRefreshTurnCredential(
  expiresAt: number,
  now: number,
): boolean {
  if (!expiresAt) {
    return true;
  }
  return expiresAt - now <= TURN_VISIBLE_REFRESH_WITHIN_MS;
}
