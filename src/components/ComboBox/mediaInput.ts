import { isAllowedRoomMedia } from "../../utils/roomMedia";
import { isHttp, isYouTube } from "../../utils/utils";

export function displayNameForMediaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    if (last) {
      return decodeURIComponent(last);
    }
    return parsed.hostname;
  } catch {
    return url;
  }
}

export function searchResultForMediaUrl(url: string): SearchResult {
  const youtube = isYouTube(url);
  return {
    name: youtube ? url : displayNameForMediaUrl(url),
    type: youtube ? "youtube" : "file",
    url,
    duration: 0,
  };
}

export function isPlayableMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  return isHttp(trimmed) && isAllowedRoomMedia(trimmed);
}

export function immediateSearchResultsForQuery(
  query: string,
): SearchResult[] | "youtube-search" {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  if (isHttp(trimmed)) {
    return [searchResultForMediaUrl(trimmed)];
  }
  return "youtube-search";
}
