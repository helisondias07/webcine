import { describe, expect, it } from "vitest";
import { isAllowedRoomMedia } from "./roomMedia";

describe("isAllowedRoomMedia", () => {
  it("allows empty (stop), http(s), share schemes and magnet", () => {
    expect(isAllowedRoomMedia("")).toBe(true);
    expect(isAllowedRoomMedia("https://example.com/video.mp4")).toBe(true);
    expect(isAllowedRoomMedia("http://cdn.example.com/live.m3u8")).toBe(true);
    expect(isAllowedRoomMedia("screenshare://abc")).toBe(true);
    expect(isAllowedRoomMedia("fileshare://abc")).toBe(true);
    expect(isAllowedRoomMedia("magnet:?xt=urn:btih:abc")).toBe(true);
  });

  it("rejects javascript, data, file and non-URLs", () => {
    expect(isAllowedRoomMedia("javascript:alert(1)")).toBe(false);
    expect(isAllowedRoomMedia("data:text/html,<h1>x</h1>")).toBe(false);
    expect(isAllowedRoomMedia("file:///etc/passwd")).toBe(false);
    expect(isAllowedRoomMedia("httpfoo")).toBe(false);
    expect(isAllowedRoomMedia("not a url")).toBe(false);
  });
});

