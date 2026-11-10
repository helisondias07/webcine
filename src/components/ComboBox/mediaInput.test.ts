import { describe, expect, it } from "vitest";
import {
  displayNameForMediaUrl,
  immediateSearchResultsForQuery,
  isPlayableMediaUrl,
  searchResultForMediaUrl,
} from "./mediaInput";

describe("mediaInput", () => {
  it("treats any http(s) URL as playable, including files and HLS", () => {
    expect(isPlayableMediaUrl("https://example.com/video.mp4")).toBe(true);
    expect(isPlayableMediaUrl("http://cdn.example.com/live.m3u8")).toBe(true);
    expect(isPlayableMediaUrl("  https://youtu.be/dQw4w9wgGcQ  ")).toBe(true);
    expect(isPlayableMediaUrl("filme da semana")).toBe(false);
    expect(isPlayableMediaUrl("javascript:alert(1)")).toBe(false);
  });

  it("builds a YouTube search result for YouTube hosts", () => {
    const result = searchResultForMediaUrl(
      "https://www.youtube.com/watch?v=dQw4w9wgGcQ",
    );
    expect(result.type).toBe("youtube");
    expect(result.url).toContain("youtube.com");
  });

  it("builds a file search result for direct media URLs", () => {
    const result = searchResultForMediaUrl(
      "https://files.example.com/cinema/noite.mp4",
    );
    expect(result.type).toBe("file");
    expect(result.name).toBe("noite.mp4");
    expect(displayNameForMediaUrl(result.url)).toBe("noite.mp4");
  });

  it("returns an immediate result for pasted URLs and search for text", () => {
    expect(immediateSearchResultsForQuery("")).toEqual([]);
    const http = immediateSearchResultsForQuery(
      "https://cdn.example.com/stream.m3u8",
    );
    expect(http).not.toBe("youtube-search");
    expect(Array.isArray(http) && http[0]?.type).toBe("file");
    expect(immediateSearchResultsForQuery("ghibli")).toBe("youtube-search");
  });
});
