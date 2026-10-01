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
