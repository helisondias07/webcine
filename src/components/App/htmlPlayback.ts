type SeekableVideo = {
  src: string;
  currentTime: number;
  readyState: number;
  duration: number;
  addEventListener: (
    type: "loadedmetadata",
    listener: () => void,
    options?: { once?: boolean },
  ) => void;
};

/**
 * Setting currentTime before src is ignored: the element resets to 0 when src
 * changes. Seek after metadata so late joiners land on the room timestamp.
 */
export function applyHtmlSrcAndTime(
  video: SeekableVideo,
  src: string,
  time: number,
) {
  if (video.src !== src) {
    video.src = src;
  }
  if (!Number.isFinite(time) || time < 0) {
    return;
  }
  const seek = () => {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(time, video.duration);
      return;
    }
    video.currentTime = time;
  };
  if (video.readyState >= 1) {
    seek();
    return;
  }
  video.addEventListener("loadedmetadata", seek, { once: true });
}

/** Host videoTS on first canplay; undefined means "use the leader map". */
export function initialSeekTime(
  hostTime: number,
  isLiveStream: boolean,
): number | undefined {
  if (isLiveStream) {
    return hostTime;
  }
  if (Number.isFinite(hostTime)) {
    return hostTime;
  }
  return undefined;
}
