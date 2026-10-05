export interface TouchLayoutEnv {
  screenWidth: number;
  screenHeight: number;
  coarsePointer: boolean;
}

/** Shortest screen side (CSS px) still treated as a phone or tablet. */
export const TOUCH_LAYOUT_MAX_SHORT_SIDE = 1024;

/**
 * Phones (any input) and touch-first tablets get the touch layout: player
 * shell fullscreen with the floating chat, chat closed by default.
 * Touch laptops/desktops (fine primary pointer) and large touch screens keep
 * the desktop behavior.
 */
export function shouldUseTouchLayout({
  screenWidth,
  screenHeight,
  coarsePointer,
}: TouchLayoutEnv): boolean {
  if (screenWidth > 0 && screenWidth <= 600) {
    return true;
  }
  if (!coarsePointer) {
    return false;
  }
  const shortSide = Math.min(screenWidth, screenHeight || screenWidth);
  return shortSide > 0 && shortSide <= TOUCH_LAYOUT_MAX_SHORT_SIDE;
}

export function isTouchLayout(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const coarsePointer = Boolean(
    window.matchMedia?.("(pointer: coarse)")?.matches,
  );
  return shouldUseTouchLayout({
    screenWidth: window.screen?.width ?? window.innerWidth,
    screenHeight: window.screen?.height ?? window.innerHeight,
    coarsePointer,
  });
}
