import config from "../config.ts";
import axios from "axios";
import {
  PT_HOURS_REGEX,
  PT_MINUTES_REGEX,
  PT_SECONDS_REGEX,
  YOUTUBE_VIDEO_ID_REGEX,
} from "./regex.ts";
import { youtube, youtube_v3 } from "@googleapis/youtube";

let Youtube = config.YOUTUBE_API_KEY
  ? youtube({
      version: "v3",
      auth: config.YOUTUBE_API_KEY,
    })
  : null;

function upgradeYoutubeThumbnail(url: string) {
  if (!url) {
    return "";
  }
  return url
    .replace("/default.jpg", "/hqdefault.jpg")
    .replace("/mqdefault.jpg", "/hqdefault.jpg");
}

function pickBestThumbnail(input: any): string {
  if (!input) {
    return "";
  }
  if (Array.isArray(input)) {
    const sorted = [...input].sort((a: any, b: any) => {
      const aw = Number(a?.width ?? 0) * Number(a?.height ?? 0);
      const bw = Number(b?.width ?? 0) * Number(b?.height ?? 0);
      return bw - aw;
    });
    return upgradeYoutubeThumbnail(String(sorted[0]?.url ?? ""));
  }
  const candidates = [
    input.maxres,
    input.standard,
    input.high,
    input.medium,
    input.default,
  ];
  for (const candidate of candidates) {
    const url = String(candidate?.url ?? "");
    if (url) {
      return upgradeYoutubeThumbnail(url);
    }
  }
  return "";
}

function extractJsonObjectAfter(source: string, token: string) {
  const tokenIndex = source.indexOf(token);
  if (tokenIndex === -1) {
    return "";
  }
  const start = source.indexOf("{", tokenIndex);
  if (start === -1) {
    return "";
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  return "";
}

function getTextFromRuns(input: any): string {
  if (!input) {
    return "";
  }
  if (typeof input.simpleText === "string") {
    return input.simpleText;
  }
  if (Array.isArray(input.runs)) {
    return input.runs.map((run: any) => String(run?.text ?? "")).join("");
  }
  return "";
}

function mapInitialDataVideoRenderer(renderer: any): PlaylistVideo | null {
  const videoId = String(renderer?.videoId ?? "");
  if (!videoId) {
    return null;
  }
  const title = getTextFromRuns(renderer?.title);
  const channel = getTextFromRuns(renderer?.ownerText);
  const thumb = pickBestThumbnail(renderer?.thumbnail?.thumbnails);
  return {
    url: "https://www.youtube.com/watch?v=" + videoId,
    name: title || "Video do YouTube",
    img: thumb,
    channel,
    duration: 0,
    type: "youtube",
  };
}

async function searchYoutubeFallback(query: string): Promise<PlaylistVideo[]> {
  const response = await axios.get("https://www.youtube.com/results", {
    params: { search_query: query },
    timeout: 10000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });
  const html = String(response.data ?? "");
  const jsonString =
    extractJsonObjectAfter(html, "var ytInitialData =") ||
    extractJsonObjectAfter(html, "window[\"ytInitialData\"] =");
  if (!jsonString) {
    return [];
  }
  const data = JSON.parse(jsonString);
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents ?? [];
  const results: PlaylistVideo[] = [];
  for (const section of sections) {
    const contents = section?.itemSectionRenderer?.contents ?? [];
    for (const item of contents) {
      const mapped = mapInitialDataVideoRenderer(item?.videoRenderer);
      if (mapped) {
        results.push(mapped);
      }
    }
  }
  return results.slice(0, 25);
}

export const mapYoutubeSearchResult = (
  video: youtube_v3.Schema$SearchResult,
): PlaylistVideo => {
  return {
    channel: video.snippet?.channelTitle ?? "",
    url: "https://www.youtube.com/watch?v=" + video?.id?.videoId,
    name: video.snippet?.title ?? "",
    img: pickBestThumbnail(video.snippet?.thumbnails),
    duration: 0,
    type: "youtube",
  };
};

export const mapYoutubeListResult = (
  video: youtube_v3.Schema$Video,
): PlaylistVideo => {
  const videoId = video.id;
  return {
    url: "https://www.youtube.com/watch?v=" + videoId,
    name: video.snippet?.title ?? "",
    img: pickBestThumbnail(video.snippet?.thumbnails),
    channel: video.snippet?.channelTitle ?? "",
    duration: getVideoDuration(video.contentDetails?.duration ?? ""),
    type: "youtube",
  };
};

export const mapYoutubePlaylistResult = (
  item: youtube_v3.Schema$PlaylistItem,
): PlaylistVideo => {
  return {
    url: "https://www.youtube.com/watch?v=" + item.snippet?.resourceId?.videoId,
    name: item.snippet?.title ?? "",
    img: pickBestThumbnail(item.snippet?.thumbnails),
    channel: item.snippet?.channelTitle ?? "",
    duration: 0,
    // duration: getVideoDuration(video.contentDetails?.duration ?? ''),
    type: "youtube",
  };
};

export const searchYoutube = async (
  query: string,
): Promise<PlaylistVideo[]> => {
  if (!query.trim()) {
    return [];
  }
  if (Youtube) {
    try {
      const response = await Youtube.search.list({
        part: ["snippet"],
        type: ["video"],
        maxResults: 25,
        q: query,
      });
      const items = response?.data?.items?.map(mapYoutubeSearchResult) ?? [];
      if (items.length > 0) {
        return items;
      }
    } catch (e) {
      console.warn("[youtube api search failed]", e);
    }
  }
  try {
    return await searchYoutubeFallback(query);
  } catch (e) {
    console.warn("[youtube fallback search failed]", e);
    return [];
  }
};

export const youtubePlaylist = async (
  playlistId: string,
): Promise<PlaylistVideo[]> => {
  const response = await Youtube?.playlistItems.list({
    part: ["snippet"],
    playlistId,
    maxResults: 100,
  });
  return response?.data?.items?.map(mapYoutubePlaylistResult) ?? [];
};

export const getYoutubeVideoID = (url: string) => {
  const idParts = YOUTUBE_VIDEO_ID_REGEX.exec(url);
  if (!idParts) {
    return;
  }

  const id = idParts[1];
  if (!id) {
    return;
  }

  return id;
};

export const fetchYoutubeVideo = async (
  id: string,
): Promise<PlaylistVideo | null> => {
  if (Youtube) {
    try {
      const response = await Youtube.videos.list({
        part: ["snippet", "contentDetails"],
        id: [id],
      });
      const top = response?.data?.items?.[0];
      if (top) {
        return mapYoutubeListResult(top);
      }
    } catch (e) {
      console.warn("[youtube api video failed]", e);
    }
  }
  try {
    const watchUrl = "https://www.youtube.com/watch?v=" + id;
    const { data } = await axios.get("https://www.youtube.com/oembed", {
      params: { url: watchUrl, format: "json" },
      timeout: 7000,
    });
    return {
      url: watchUrl,
      name: String(data?.title ?? "Video do YouTube"),
      img: pickBestThumbnail([{ url: String(data?.thumbnail_url ?? "") }]),
      channel: String(data?.author_name ?? "Canal do YouTube"),
      duration: 0,
      type: "youtube",
    };
  } catch (e) {
    console.warn("[youtube oembed fallback failed]", e);
    return null;
  }
};

export const getVideoDuration = (string: string): number => {
  if (!string) {
    return 0;
  }
  const hoursParts = PT_HOURS_REGEX.exec(string);
  const minutesParts = PT_MINUTES_REGEX.exec(string);
  const secondsParts = PT_SECONDS_REGEX.exec(string);

  const hours = hoursParts ? parseInt(hoursParts[1]) : 0;
  const minutes = minutesParts ? parseInt(minutesParts[1]) : 0;
  const seconds = secondsParts ? parseInt(secondsParts[1]) : 0;

  const totalSeconds = seconds + minutes * 60 + hours * 60 * 60;
  return totalSeconds;
};

export const isYouTube = (input: string) => {
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "youtu.be" ||
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com"
    );
  } catch {
    return false;
  }
};
