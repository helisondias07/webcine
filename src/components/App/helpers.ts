export const DEFAULT_CHAT_NAME = "Convidado";
export const DEFAULT_NAME_COLOR = "#FFFFFF";

export function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function normalizeNameColor(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return /^#([0-9A-F]{6})$/.test(normalized) ? normalized : DEFAULT_NAME_COLOR;
}

/**
 * Returns a name color that stays readable on both themes, or `undefined`
 * when the theme's default text color should be used instead (default white,
 * invalid values, or near-white / near-black picks that would vanish on the
 * light or dark chat background).
 */
export function getReadableNameColor(
  value: string | null | undefined,
): string | undefined {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!/^#([0-9A-F]{6})$/.test(normalized)) {
    return undefined;
  }
  if (normalized === DEFAULT_NAME_COLOR) {
    return undefined;
  }
  const luminance = getRelativeLuminance(normalized);
  if (luminance > 0.8 || luminance < 0.03) {
    return undefined;
  }
  return normalized;
}

/**
 * True when playback jumped instead of advancing with the clock.
 * Used to publish a room seek when the YouTube player moves on its own.
 */
export function isPlaybackJump(
  previousTime: number,
  nextTime: number,
  elapsedSeconds: number,
  playbackRate: number,
): boolean {
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) {
    return false;
  }
  if (elapsedSeconds <= 0 || elapsedSeconds > 8) {
    return false;
  }
  const expected = previousTime + elapsedSeconds * (playbackRate || 1);
  return Math.abs(nextTime - expected) > 2.5;
}

export function getRelativeLuminance(hex: string) {
  const normalized = normalizeNameColor(hex).replace("#", "");
  const channel = (offset: number) => {
    const c = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function getDisplayInitials(value: string) {
  const parts = normalizeDisplayName(value).split(" ").filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function toRgba(hex: string, alpha: number) {
  const normalized = normalizeNameColor(hex).replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type YouTubeQualityMode = "auto" | YT.SuggestedVideoQuality;

export function normalizeYouTubeQuality(value: unknown): YouTubeQualityMode {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  switch (normalized) {
    case "auto":
      return "auto";
    case "default":
      return "default";
    case "small":
      return "small";
    case "medium":
      return "medium";
    case "large":
      return "large";
    case "hd720":
      return "hd720";
    case "hd1080":
      return "hd1080";
    case "highres":
      return "highres";
    default:
      return "hd1080";
  }
}
