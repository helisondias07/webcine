/** Media the room player may load. Rejects javascript:/data:/file: and junk. */
export function isAllowedRoomMedia(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (
    trimmed.startsWith("screenshare://") ||
    trimmed.startsWith("fileshare://") ||
    trimmed.startsWith("magnet:")
  ) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
