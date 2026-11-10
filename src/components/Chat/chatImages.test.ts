import { describe, expect, it } from "vitest";
import { isAllowedChatImageUrl } from "../../../shared/safeUrls";

describe("chat photo URLs", () => {
  it("accepts http(s) image files and rejects javascript and extension-less URLs", () => {
    expect(isAllowedChatImageUrl("https://cdn.example.com/pic.gif")).toBe(true);
    expect(isAllowedChatImageUrl("https://cdn.example.com/pic.PNG?x=1")).toBe(
      true,
    );
    expect(isAllowedChatImageUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedChatImageUrl("https://cdn.example.com/noext")).toBe(false);
  });
});
