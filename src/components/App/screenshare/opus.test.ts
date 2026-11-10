import { describe, expect, it } from "vitest";
import { mergeOpusFmtp, tuneOpusFmtp } from "./opus";

const OFFER = [
  "v=0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111 63",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "a=rtpmap:63 red/48000/2",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
  "a=rtpmap:96 VP8/90000",
  "",
].join("\n");

describe("tuneOpusFmtp", () => {
  it("sets stereo, FEC, DTX off and 128 kbps on opus/48000/2 only", () => {
    const tuned = tuneOpusFmtp(OFFER);
    expect(tuned).toContain("a=rtpmap:111 opus/48000/2");
    expect(tuned).not.toContain("multiopus");
    expect(tuned).toContain(
      "a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;usedtx=0;maxaveragebitrate=128000",
    );
    expect(tuned).toContain("a=rtpmap:63 red/48000/2");
    expect(tuned).toContain("a=rtpmap:96 VP8/90000");
  });

  it("does not rename the codec or touch multiopus", () => {
    const sdp = [
      "a=rtpmap:111 multiopus/48000/6",
      "a=fmtp:111 useinbandfec=1;channel_mapping=0,4,1,2,3,5;num_streams=4;coupled_streams=2",
      "a=rtpmap:112 multiopus/48000/2",
      "a=fmtp:112 minptime=10",
    ].join("\n");
    expect(tuneOpusFmtp(sdp)).toBe(sdp);
  });

  it("inserts an fmtp line when opus has none", () => {
    const sdp = "a=rtpmap:111 opus/48000/2\na=rtpmap:96 VP8/90000\n";
    expect(tuneOpusFmtp(sdp)).toBe(
      "a=rtpmap:111 opus/48000/2\na=fmtp:111 stereo=1;useinbandfec=1;usedtx=0;maxaveragebitrate=128000\na=rtpmap:96 VP8/90000\n",
    );
  });

  it("keeps CRLF and overwrites a low bitrate or DTX already in the fmtp", () => {
    const sdp =
      "a=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;stereo=0;usedtx=1;maxaveragebitrate=32000\r\n";
    const tuned = tuneOpusFmtp(sdp);
    expect(tuned).toContain("\r\n");
    expect(tuned).toContain(
      "a=fmtp:111 minptime=10;stereo=1;usedtx=0;maxaveragebitrate=128000;useinbandfec=1\r\n",
    );
    expect(tuned).not.toContain("32000");
    expect(tuned).not.toContain("usedtx=1");
  });

  it("leaves an SDP without opus untouched", () => {
    const sdp = "v=0\nm=video 9 UDP/TLS/RTP/SAVPF 96\n";
    expect(tuneOpusFmtp(sdp)).toBe(sdp);
    expect(tuneOpusFmtp("")).toBe("");
  });
});

describe("mergeOpusFmtp", () => {
  it("appends the music parameters after the browser's own keys", () => {
    expect(mergeOpusFmtp("minptime=10;useinbandfec=1")).toBe(
      "minptime=10;useinbandfec=1;stereo=1;usedtx=0;maxaveragebitrate=128000",
    );
  });
});
