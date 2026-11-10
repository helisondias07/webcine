export const MAX_RECREATE_ATTEMPTS = 6;
export const DISCONNECTED_VIEWER_GRACE_MS = 12_000;
export const ICE_RESTART_RETRY_MS = 6_000;

// Delay before the sharer restarts ICE on a "disconnected" connection:
// 4s, 8s, then 15s (capped).
export function iceRestartDelay(attempts: number): number {
  return Math.min(15_000, 4_000 * 2 ** Math.min(attempts, 2));
}

// Delay before recreating a failed connection: 1.5s doubling, capped at 15s.
export function recreateDelay(attempt: number): number {
  return Math.min(15_000, 1_500 * 2 ** attempt);
}

/**
 * The same clientId comes back after F5. When the roster epoch changes, the
 * sharer must open a new peer connection. Reusing the old one (or only
 * restarting ICE) renegotiates an m-line that Chrome often answers with
 * video and an inactive audio section.
 */
export function viewerConnectionReplaced(
  previousEpoch: number | undefined,
  nextEpoch: number | undefined,
): boolean {
  return (
    typeof previousEpoch === "number" &&
    typeof nextEpoch === "number" &&
    nextEpoch !== previousEpoch
  );
}

// iOS/Safari cannot handle this attribute, so it is removed from offers.
export function sanitizeOfferSdp(sdp: string): string {
  return sdp
    .split("\n")
    .filter((line) => line.trim() !== "a=extmap-allow-mixed")
    .join("\n");
}
