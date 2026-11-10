type HlsLike = {
  stopLoad?: () => void;
  detachMedia?: () => void;
};

type DashLike = {
  reset?: () => void;
};

/**
 * Detach HLS/DASH from the video element before loading another source so
 * leftover buffers/listeners do not fight YouTube or a new file.
 */
export function releaseAdaptivePlayers(players: {
  hls?: HlsLike | null;
  dash?: DashLike | null;
}) {
  try {
    players.hls?.stopLoad?.();
    players.hls?.detachMedia?.();
  } catch {
    // Player may already be torn down.
  }
  try {
    players.dash?.reset?.();
  } catch {
    // Player may already be torn down.
  }
}
