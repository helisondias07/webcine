import { describe, expect, it } from "vitest";
import {
  isAllowedChatImageUrl,
  isAllowedUserPicture,
  isRedditPostUrl,
  isRedditVideoUrl,
  isTwitchUrl,
  redditJsonUrl,
  resolvedPictureUrl,
} from "../../shared/safeUrls";

describe("user picture URLs", () => {
  it("allows empty, http(s), and ui-avatars; rejects javascript/data/overflow", () => {
    expect(isAllowedUserPicture("")).toBe(true);
    expect(
      isAllowedUserPicture("https://ui-avatars.com/api/?name=Ana&size=256"),
    ).toBe(true);
    expect(isAllowedUserPicture("http://localhost:5173/me.png")).toBe(true);
    expect(isAllowedUserPicture("javascript:alert(1)")).toBe(false);
    expect(isAllowedUserPicture("data:image/png;base64,aaa")).toBe(false);
    expect(isAllowedUserPicture("https://user:pass@evil.test/x.png")).toBe(
      false,
    );
    expect(isAllowedUserPicture(`https://example.com/${"a".repeat(3000)}`)).toBe(
      false,
    );
  });

  it("falls back when the stored picture is unsafe", () => {
    expect(
      resolvedPictureUrl("javascript:alert(1)", "https://fallback.test/a.png"),
    ).toBe("https://fallback.test/a.png");
  });
});

describe("chat image URLs", () => {
  it("requires an image extension on an http(s) URL", () => {
    expect(isAllowedChatImageUrl("https://cdn.example.com/pic.PNG?x=1")).toBe(
      true,
    );
    expect(isAllowedChatImageUrl("https://cdn.example.com/pic.webp")).toBe(true);
    expect(isAllowedChatImageUrl("https://cdn.example.com/noext")).toBe(false);
    expect(isAllowedChatImageUrl("javascript:alert(1)")).toBe(false);
    expect(
      isAllowedChatImageUrl("https://example.com/foo.png/not-an-image"),
    ).toBe(false);
  });
});

describe("reddit and twitch hosts", () => {
  it("rejects prefix spoofing like reddit.com.attacker.test", () => {
    expect(isRedditPostUrl("https://www.reddit.com/r/foo/comments/abc")).toBe(
      true,
    );
    expect(isRedditPostUrl("https://reddit.com/r/foo/comments/abc")).toBe(true);
    expect(isRedditPostUrl("https://reddit.com.attacker.test/r/foo")).toBe(
      false,
    );
    expect(isRedditPostUrl("http://www.reddit.com/r/foo")).toBe(false);
    expect(
      redditJsonUrl("https://www.reddit.com/r/foo/comments/abc/"),
    ).toBe("https://www.reddit.com/r/foo/comments/abc.json");
  });

  it("only accepts reddit video hosts over https", () => {
    expect(isRedditVideoUrl("https://v.redd.it/abc.m3u8")).toBe(true);
    expect(isRedditVideoUrl("https://v.redd.it.attacker.test/abc")).toBe(false);
  });

  it("rejects twitch prefix spoofing", () => {
    expect(isTwitchUrl("https://www.twitch.tv/someone")).toBe(true);
    expect(isTwitchUrl("https://twitch.tv.attacker.test/someone")).toBe(false);
  });
});
