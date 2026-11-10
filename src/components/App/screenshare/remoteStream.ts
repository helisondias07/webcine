// Helpers for attaching a remote screen-share to the <video> element.
//
// Chrome (notably Chrome for Android) does not reliably start rendering a
// track that is added to a MediaStream which is already the element's
// srcObject (w3c/mediacapture-main#453). Video usually arrives first, so a late
// audio track could be "present" on the stream but never played. Instead of
// mutating the attached stream we always attach a fresh MediaStream that
// contains every live track.

type TrackLike = Pick<MediaStreamTrack, "id" | "kind" | "readyState">;
type StreamLike<T extends TrackLike> = { getTracks(): T[] };

/**
 * Merge the tracks currently attached, the streams reported by ontrack and the
 * incoming track into one de-duplicated list of live tracks (video first).
 */
export function collectRemoteShareTracks<T extends TrackLike>(
  current: readonly T[] | undefined,
  streams: readonly StreamLike<T>[] | undefined,
  incoming?: T,
): T[] {
  const byId = new Map<string, T>();
  const add = (track: T | undefined) => {
    if (track && track.readyState !== "ended" && !byId.has(track.id)) {
      byId.set(track.id, track);
    }
  };
  (current ?? []).forEach(add);
  (streams ?? []).forEach((stream) => stream.getTracks().forEach(add));
  add(incoming);
  const tracks = Array.from(byId.values());
  return [
    ...tracks.filter((track) => track.kind === "video"),
    ...tracks.filter((track) => track.kind !== "video"),
  ];
}

/** True when the element must get a new srcObject to see every track. */
export function needsRemoteShareReattach(
  attachedIds: ReadonlySet<string>,
  tracks: readonly TrackLike[],
): boolean {
  if (tracks.length !== attachedIds.size) {
    return true;
  }
  return tracks.some((track) => !attachedIds.has(track.id));
}

/**
 * After the user unmutes, decide whether remote audio looks stalled. Inputs
 * are inbound-rtp audio counters sampled before/after a short wait; undefined
 * means stats were unavailable.
 */
export function remoteAudioLooksStalled(
  paused: boolean,
  samplesBefore: number | undefined,
  samplesAfter: number | undefined,
): boolean {
  if (paused) {
    return true;
  }
  if (samplesBefore === undefined || samplesAfter === undefined) {
    return false;
  }
  return samplesAfter <= samplesBefore;
}

export type ShareAudioCheck = "ok" | "wait" | "resync";

/**
 * Decide whether the viewer should ask the sharer to resend.
 * A live video track with no audio, or audio counters that stop while the
 * element is actually playing, is a broken sender — not an autoplay block.
 * A paused element is left alone so the "Ativar som" gesture can run.
 */
export function shareAudioNeedsResync(input: {
  hasLiveVideo: boolean;
  hasLiveAudio: boolean;
  paused: boolean;
  samplesBefore: number | undefined;
  samplesAfter: number | undefined;
}): ShareAudioCheck {
  if (!input.hasLiveVideo) {
    return "wait";
  }
  if (!input.hasLiveAudio) {
    return "resync";
  }
  if (input.paused) {
    return "wait";
  }
  if (
    remoteAudioLooksStalled(false, input.samplesBefore, input.samplesAfter)
  ) {
    return "resync";
  }
  return "ok";
}

/**
 * Decide whether a playing video track has stopped producing frames.
 * Missing stats or a paused element are "wait": a disconnected peer and an
 * autoplay block must not be treated as a frozen sender.
 */
export function shareVideoNeedsResync(input: {
  hasLiveVideo: boolean;
  paused: boolean;
  framesBefore: number | undefined;
  framesAfter: number | undefined;
}): ShareAudioCheck {
  if (!input.hasLiveVideo || input.paused) {
    return "wait";
  }
  if (input.framesBefore === undefined || input.framesAfter === undefined) {
    return "wait";
  }
  if (input.framesAfter <= input.framesBefore) {
    return "resync";
  }
  return "ok";
}
