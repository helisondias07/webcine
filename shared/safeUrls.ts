/** Shared URL checks for client and server. Keep both sides in lockstep. */

export const MAX_USER_PICTURE_URL_LENGTH = 2048;
export const MAX_CHAT_IMAGE_URL_LENGTH = 2048;
export const REDDIT_JSON_MAX_BYTES = 256 * 1024;
export const REDDIT_FETCH_TIMEOUT_MS = 4000;

const IMAGE_EXTENSIONS = new Set([
  "png",
  "gif",
  "webp",
  "jpeg",
  "jpg",
  "heic",
  "heif",
  "jfif",
]);

const REDDIT_POST_HOSTS = new Set([
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
]);

const REDDIT_VIDEO_HOSTS = new Set([
  "v.redd.it",
  "packaged-media.redd.it",
  "reddit.com",
  "www.reddit.com",
]);

function hostnameAllowed(
  hostname: string,
  exact: Set<string>,
  suffixParents: string[],
): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (exact.has(host)) {
    return true;
  }
  return suffixParents.some((parent) => host.endsWith(`.${parent}`));
}

export function parseHttpUrl(value: string): URL | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isAllowedUserPicture(value: string): boolean {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.length > MAX_USER_PICTURE_URL_LENGTH) {
    return false;
  }
  return parseHttpUrl(trimmed) !== null;
}

export function isAllowedChatImageUrl(value: string): boolean {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed.length > MAX_CHAT_IMAGE_URL_LENGTH) {
    return false;
  }
  const parsed = parseHttpUrl(trimmed);
  if (!parsed) {
    return false;
  }
  const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }
  const ext = last.slice(dot + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function resolvedPictureUrl(
  candidate: string | undefined,
  fallback: string,
): string {
  const trimmed = String(candidate ?? "").trim();
  if (trimmed && isAllowedUserPicture(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export function isRedditPostUrl(value: string): boolean {
  const parsed = parseHttpUrl(value);
  if (!parsed || parsed.protocol !== "https:") {
    return false;
  }
  return hostnameAllowed(parsed.hostname, REDDIT_POST_HOSTS, ["reddit.com"]);
}

export function redditJsonUrl(value: string): string | null {
  if (!isRedditPostUrl(value)) {
    return null;
  }
  const parsed = new URL(value.trim());
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  let path = parsed.pathname;
  if (path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (!path.endsWith(".json")) {
    path += ".json";
  }
  parsed.pathname = path;
  return parsed.toString();
}

export function isRedditVideoUrl(value: string): boolean {
  const parsed = parseHttpUrl(value);
  if (!parsed || parsed.protocol !== "https:") {
    return false;
  }
  return hostnameAllowed(parsed.hostname, REDDIT_VIDEO_HOSTS, [
    "redd.it",
    "reddit.com",
  ]);
}

export function isTwitchUrl(value: string): boolean {
  const parsed = parseHttpUrl(value);
  if (!parsed || parsed.protocol !== "https:") {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return host === "twitch.tv" || host.endsWith(".twitch.tv");
}
