export interface PublishedShareTrack {
  track: MediaStreamTrack;
  // True when this is a clone. Stopping it must not end the capture the
  // sharer is still sending to other viewers.
  stopOnClose: boolean;
}

/**
 * One video track and one audio track for a new peer connection.
 *
 * Each connection gets its own clone. Chrome stops sending audio when the
 * same getDisplayMedia audio track is added to a second RTCPeerConnection
 * while an older one (the previous viewer after F5, or the sharer's
 * self-view) is closed or ICE-restarted. Video often keeps flowing, which
 * is the "picture stays, sound only returns after sharing again" failure.
 * Clones share the capture but have independent senders.
 */
export function tracksToPublish(
  tracks: readonly MediaStreamTrack[],
): PublishedShareTrack[] {
  const live = tracks.filter((track) => track.readyState === "live");
  const video = live.find((track) => track.kind === "video");
  const audio = live.find((track) => track.kind === "audio");
  return [video, audio]
    .filter((track): track is MediaStreamTrack => Boolean(track))
    .map((track) => {
      try {
        const clone = track.clone();
        if (track.contentHint) {
          clone.contentHint = track.contentHint;
        }
        return { track: clone, stopOnClose: true };
      } catch {
        return { track, stopOnClose: false };
      }
    });
}
