import { describe, expect, it } from "vitest";
import {
  getDisplayMediaRequest,
  getScreenShareMode,
  isHandheldShareDevice,
  limitShareProfileForDevice,
  screenShareUnsupportedMessage,
  type ShareCaptureEnv,
} from "./capture";

function env(overrides: Partial<ShareCaptureEnv> = {}): ShareCaptureEnv {
  return {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0",
    maxTouchPoints: 0,
    isSecureContext: true,
    hasGetDisplayMedia: true,
    ...overrides,
  };
}

describe("isHandheldShareDevice", () => {
  it("treats Android phones and tablets as handheld", () => {
    expect(
      isHandheldShareDevice(
        env({
          userAgent:
            "Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        }),
      ),
    ).toBe(true);
    expect(
      isHandheldShareDevice(
        env({
          userAgent:
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
        }),
      ),
    ).toBe(true);
  });

  it("treats iPhone and iPadOS as handheld", () => {
    expect(
      isHandheldShareDevice(
        env({
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        }),
      ),
    ).toBe(true);
    expect(
      isHandheldShareDevice(
        env({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
          maxTouchPoints: 5,
        }),
      ),
    ).toBe(true);
  });

  it("keeps desktop browsers on the desktop path", () => {
    expect(isHandheldShareDevice(env())).toBe(false);
    expect(
      isHandheldShareDevice(
        env({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
          maxTouchPoints: 0,
        }),
      ),
    ).toBe(false);
  });
});

describe("getDisplayMediaRequest", () => {
  it("asks handheld browsers only for video, without mandatory constraints", () => {
    expect(getDisplayMediaRequest("handheld")).toEqual({ video: true });
  });

  it("keeps the desktop tab-and-audio request", () => {
    const request = getDisplayMediaRequest("desktop");
    expect(request.audio).toMatchObject({
      channelCount: 2,
      echoCancellation: false,
    });
    expect(request.video).toMatchObject({ logicalSurface: true });
  });
});

describe("getScreenShareMode", () => {
  it("is unsupported without the API or a secure context", () => {
    expect(getScreenShareMode(env({ hasGetDisplayMedia: false }))).toBe(
      "unsupported",
    );
    expect(getScreenShareMode(env({ isSecureContext: false }))).toBe(
      "unsupported",
    );
  });

  it("selects handheld when the device can capture", () => {
    expect(
      getScreenShareMode(
        env({
          userAgent:
            "Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/131.0.0.0",
        }),
      ),
    ).toBe("handheld");
  });
});

describe("limitShareProfileForDevice", () => {
  it("caps a handheld encode at 720p24 and 2.5 Mbps", () => {
    expect(
      limitShareProfileForDevice(
        {
          captureWidth: 1920,
          captureHeight: 1080,
          maxFramerate: 30,
          maxBitratePerPeer: 5_000_000,
        },
        true,
      ),
    ).toEqual({
      captureWidth: 1280,
      captureHeight: 720,
      maxFramerate: 24,
      maxBitratePerPeer: 2_500_000,
    });
  });

  it("leaves the desktop profile unchanged", () => {
    const profile = {
      captureWidth: 1920,
      captureHeight: 1080,
      maxFramerate: 30,
      maxBitratePerPeer: 5_000_000,
    };
    expect(limitShareProfileForDevice(profile, false)).toEqual(profile);
  });
});

describe("screenShareUnsupportedMessage", () => {
  it("explains an insecure page separately from a browser limitation", () => {
    expect(
      screenShareUnsupportedMessage(env({ isSecureContext: false })),
    ).toMatch(/HTTPS/);
    expect(
      screenShareUnsupportedMessage(
        env({
          hasGetDisplayMedia: false,
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        }),
      ),
    ).toMatch(/celular ou tablet/);
  });
});
