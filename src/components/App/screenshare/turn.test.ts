import { describe, expect, it } from "vitest";
import {
  TURN_REFRESH_MARGIN_MS,
  TURN_VISIBLE_REFRESH_WITHIN_MS,
  shouldRefreshTurnCredential,
  turnRefreshDelayMs,
} from "./turn";

describe("turn credential refresh", () => {
  it("renews a 6h credential 5 minutes before it expires", () => {
    expect(turnRefreshDelayMs(6 * 60 * 60)).toBe(
      6 * 60 * 60 * 1000 - TURN_REFRESH_MARGIN_MS,
    );
  });

  it("never schedules a refresh sooner than a minute", () => {
    expect(turnRefreshDelayMs(30)).toBe(60_000);
    expect(turnRefreshDelayMs(0)).toBe(60_000);
  });

  it("refreshes on focus when the credential is inside its last 10 minutes", () => {
    const now = 1_000_000;
    expect(shouldRefreshTurnCredential(0, now)).toBe(true);
    expect(
      shouldRefreshTurnCredential(now + TURN_VISIBLE_REFRESH_WITHIN_MS, now),
    ).toBe(true);
    expect(
      shouldRefreshTurnCredential(now + TURN_VISIBLE_REFRESH_WITHIN_MS + 1, now),
    ).toBe(false);
  });
});
