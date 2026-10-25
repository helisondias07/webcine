// Tab-audio Opus parameters, in the style of Jitsi and LiveKit's
// musicHighQualityStereo. Only the fmtp of an already negotiated
// opus/48000/2 payload is touched. The codec name stays opus/48000/2.
// Rewriting it to multiopus (or a 510 kbps cap) muted mobile Chromium.

export const OPUS_MAX_AVERAGE_BITRATE = "128000";

const OPUS_FMTP: Record<string, string> = {
  stereo: "1",
  useinbandfec: "1",
  usedtx: "0",
  maxaveragebitrate: OPUS_MAX_AVERAGE_BITRATE,
};

// Exactly "opus", not "multiopus" or any other *opus name.
const OPUS_RTPMAP = /^a=rtpmap:(\d+)\s+opus\/48000\/2(?:\s|$)/i;
const FMTP_LINE = /^a=fmtp:(\d+)\s*(.*)$/i;

function lineEnding(sdp: string): string {
  return sdp.includes("\r\n") ? "\r\n" : "\n";
}

function splitLines(sdp: string): string[] {
  if (!sdp) {
    return [];
  }
  return sdp.split(/\r\n|\n/);
}

export function mergeOpusFmtp(existing: string): string {
  const order: string[] = [];
  const values = new Map<string, string>();
  existing
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const eq = part.indexOf("=");
      const key = (eq === -1 ? part : part.slice(0, eq)).trim().toLowerCase();
      const value = eq === -1 ? "" : part.slice(eq + 1).trim();
      if (!values.has(key)) {
        order.push(key);
      }
      values.set(key, value);
    });
  Object.entries(OPUS_FMTP).forEach(([key, value]) => {
    if (!values.has(key)) {
      order.push(key);
    }
    values.set(key, value);
  });
  return order
    .map((key) => {
      const value = values.get(key) ?? "";
      return value === "" ? key : `${key}=${value}`;
    })
    .join(";");
}

/**
 * Tune Opus fmtp for tab audio. Returns the SDP unchanged when the only
 * audio codec is something other than opus/48000/2 (including multiopus).
 * rtpmap lines are never rewritten.
 */
export function tuneOpusFmtp(sdp: string): string {
  const lines = splitLines(sdp);
  const opusPts = new Set<string>();
  lines.forEach((line) => {
    const match = OPUS_RTPMAP.exec(line.trim());
    if (match) {
      opusPts.add(match[1]);
    }
  });
  if (!opusPts.size) {
    return sdp;
  }

  const tuned = new Set<string>();
  const rewritten = lines.map((line) => {
    const fmtp = FMTP_LINE.exec(line.trim());
    if (!fmtp || !opusPts.has(fmtp[1])) {
      return line;
    }
    tuned.add(fmtp[1]);
    return `a=fmtp:${fmtp[1]} ${mergeOpusFmtp(fmtp[2] ?? "")}`;
  });

  const withMissing: string[] = [];
  rewritten.forEach((line) => {
    withMissing.push(line);
    const match = OPUS_RTPMAP.exec(line.trim());
    if (match && opusPts.has(match[1]) && !tuned.has(match[1])) {
      withMissing.push(`a=fmtp:${match[1]} ${mergeOpusFmtp("")}`);
      tuned.add(match[1]);
    }
  });
  return withMissing.join(lineEnding(sdp));
}
