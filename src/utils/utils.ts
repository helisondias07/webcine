//@ts-expect-error
import canAutoplay from "can-autoplay";
import { MD5 } from "./md5";
import type { FirebaseUser } from "./firebaseClient";
import config from "../config";
import { cyrb53 } from "./hash";
import React from "react";
import { serverPath } from "./serverPath";

export function formatTimestamp(input: any, zeroTime?: number): string {
  if (
    input === null ||
    input === undefined ||
    input === false ||
    Number.isNaN(input) ||
    input === Infinity
  ) {
    return "";
  }
  if (zeroTime) {
    return new Date((zeroTime + input) * 1000).toLocaleTimeString();
  }
  let hours = Math.abs(Math.trunc(Number(input) / 3600));
  let minutes = Math.abs(Math.trunc(Number(input) / 60) % 60)
    .toString()
    .padStart(2, "0");
  let seconds = Math.abs(Math.trunc(Number(input) % 60))
    .toString()
    .padStart(2, "0");
  return `${Number(input) < 0 ? "-" : ""}${hours ? `${hours}:` : ""}${minutes}:${seconds}`;
}

export function formatSpeed(input: number) {
  if (input >= 1000000) {
    return (input / 1000000).toFixed(2) + " MB/s";
  }
  if (input >= 1000) {
    return (input / 1000).toFixed(0) + " KB/s";
  }
  return input + " B/s";
}

export function formatSize(input: number) {
  if (input >= 1000000000) {
    return (input / 1000000000).toFixed(2) + " GB";
  }
  if (input >= 1000000) {
    return (input / 1000000).toFixed(2) + " MB";
  }
  if (input >= 1000) {
    return (input / 1000).toFixed(0) + " KB";
  }
  return input + " B";
}

export const colorMappings: StringDict = {
  red: "B03060",
  orange: "FE9A76",
  yellow: "FFD700",
  olive: "32CD32",
  green: "016936",
  teal: "008080",
  blue: "0E6EB8",
  violet: "EE82EE",
  purple: "B413EC",
  pink: "FF1493",
  brown: "A52A2A",
  grey: "A0A0A0",
};

export const softWhite = "whitesmoke";

let colorCache: NumberDict = {};
export function getColorForString(id: string) {
  let colors = Object.keys(colorMappings);
  if (colorCache[id]) {
    return colors[colorCache[id]];
  }
  colorCache[id] = Math.abs(cyrb53(id)) % colors.length;
  return colors[colorCache[id]];
}

export function getColorForStringHex(id: string) {
  return colorMappings[getColorForString(id)];
}

export const getFbPhoto = (fbId: string) =>
  `https://graph.facebook.com/${fbId}/picture?type=normal`;

export const isYouTube = (input: string) => {
  if (!isHttp(input)) {
    return false;
  }
  try {
    const hostname = new URL(input).hostname.toLowerCase();
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

export const isTwitchLive = (input: string) => {
  if (!isHttp(input)) {
    return false;
  }
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname !== "twitch.tv" &&
      hostname !== "www.twitch.tv" &&
      hostname !== "m.twitch.tv"
    ) {
      return false;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) {
      return false;
    }
    const channel = parts[0]?.toLowerCase();
    if (!channel) {
      return false;
    }
    const reserved = new Set([
      "directory",
      "downloads",
      "jobs",
      "login",
      "p",
      "products",
      "settings",
      "signup",
      "subscriptions",
      "turbo",
      "videos",
      "wallet",
    ]);
    if (reserved.has(channel)) {
      return false;
    }
    return /^[a-z0-9_]{3,25}$/.test(channel);
  } catch {
    return false;
  }
};

export const isHttp = (input: string) => {
  return input.startsWith("http");
};

export const isMagnet = (input: string) => {
  return input.startsWith("magnet:");
};

export const isHls = (input: string) => {
  return input.includes(".m3u8");
};

export const isDash = (input: string) => {
  return input.includes(".mpd");
};

export const isMpegTs = (input: string) => {
  return input.includes(".mpegts");
};

export const isScreenShare = (input: string) => {
  return input.startsWith("screenshare://");
};

export const isFileShare = (input: string) => {
  return input.startsWith("fileshare://");
};

export const STREAMING_DOMAINS = [
  "netflix.com",
  "primevideo.com",
  "globoplay.globo.com",
  "play.hbomax.com",
  "hbomax.com",
  "max.com",
  "disneyplus.com",
  "tv.apple.com",
];

export const isStreamingPlatformUrl = (input: string) => {
  if (!isHttp(input)) {
    return false;
  }
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase();
    return STREAMING_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain),
    );
  } catch {
    return false;
  }
};

export async function testAutoplay() {
  const result = await canAutoplay.video();
  return result.result;
}

export function decodeEntities(input: string) {
  const doc = new DOMParser().parseFromString(input, "text/html");
  return doc.documentElement.textContent;
}

export const debounce = (callback: Function, wait = 500) => {
  let timeoutId: any = null;
  return (...args: any[]) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, wait);
  };
};

export const getDefaultPicture = (name: string, background = "a0a0a0") => {
  return `https://ui-avatars.com/api/?name=${name}&background=${background}&size=256&color=ffffff`;
};

export const isMobile = () => {
  return window.screen.width <= 600;
};

export function shuffle(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i);
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

export const iceServers = (): RTCIceServer[] => {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const configuredTurnUrls = String(config.VITE_TURN_URLS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const turnUsername = String(config.VITE_TURN_USERNAME ?? "").trim();
  const turnCredential = String(config.VITE_TURN_CREDENTIAL ?? "").trim();
  for (const url of configuredTurnUrls) {
    const turnServer: RTCIceServer = { urls: url };
    if (turnUsername && turnCredential) {
      turnServer.username = turnUsername;
      turnServer.credential = turnCredential;
    }
    servers.push(turnServer);
  }
  return servers;
};

export { serverPath };

export async function getMediaPathResults(
  mediaPath: string,
  query: string,
): Promise<SearchResult[]> {
  let results: SearchResult[] = [];
  // if (mediaPath.includes('s3.')) {
  //   const response = await fetch(mediaPath);
  //   // S3-style buckets return data in XML
  //   const xml = await response.text();
  //   const parser = new XMLParser();
  //   const data = parser.parse(xml);
  //   let filtered = data.ListBucketResult.Contents.filter(
  //     // Exclude subdirectories
  //     (file: any) => !file.Key.includes('/'),
  //   );
  //   results = filtered.map((file: any) => ({
  //     url: mediaPath + '/' + file.Key,
  //     name: mediaPath + '/' + file.Key,
  //   }));
  // } else
  if (mediaPath.startsWith("https://www.youtube.com/playlist?list=")) {
    // https://www.youtube.com/playlist?list=<playlist ID>
    const playlistID = mediaPath.split(
      "https://www.youtube.com/playlist?list=",
    )[1];
    const response = await fetch(serverPath + "/youtubePlaylist/" + playlistID);
    results = await response.json();
  } else {
    // Assume it's a text list of URLs
    const response = await fetch(mediaPath);
    const text = await response.text();
    results = text
      .split("\n")
      .map((line) => ({ url: line, name: line, duration: 0, type: "file" }));
  }
  const q = query.trim().toLowerCase();
  return results.filter((res) => {
    if (!res.url) {
      return false;
    }
    if (!q) {
      return true;
    }
    return String(res.name || res.url).toLowerCase().includes(q);
  });
}

export async function getStreamPathResults(
  streamPath: string,
  query: string,
): Promise<SearchResult[]> {
  const response = await fetch(
    streamPath + `/${query ? "search" : "top"}?q=` + encodeURIComponent(query),
  );
  const data = await response.json();
  return data.map((d: any, i: number) => ({
    ...d,
    url: d.magnet ?? String(i),
  }));
}

export async function getYouTubeResults(
  query: string,
): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      serverPath + "/youtube?q=" + encodeURIComponent(query),
    );
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map((d: any) => ({ ...d, type: "youtube" }));
  } catch {
    return [];
  }
}

export async function openFileSelector(accept?: string) {
  return new Promise<FileList | null>((resolve) => {
    const inputElement = document.createElement("input");
    inputElement.type = "file";
    inputElement.style.display = "none";
    if (accept) {
      inputElement.accept = accept;
    }
    let settled = false;
    let timeoutId = 0;
    const finish = (files: FileList | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(files);
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      inputElement.removeEventListener("change", onChange);
      inputElement.removeEventListener("cancel", onCancel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      inputElement.remove();
    };
    timeoutId = window.setTimeout(() => {
      finish(null);
    }, 120000);
    const onChange = () => {
      const files = inputElement.files;
      finish(files && files.length > 0 ? files : null);
    };
    const onCancel = () => {
      finish(null);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        window.setTimeout(() => {
          if (settled) {
            return;
          }
          const files = inputElement.files;
          finish(files && files.length > 0 ? files : null);
        }, 200);
      }
    };
    const hasNativePicker = (window as Window & { showOpenFilePicker?: unknown })
      .showOpenFilePicker;
    if (!hasNativePicker) {
      // Older browsers may not fire "cancel", so we complete when the tab
      // returns to visible and no file was selected.
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    inputElement.addEventListener("change", onChange);
    inputElement.addEventListener("cancel", onCancel);
    document.body.appendChild(inputElement);
    window.setTimeout(() => {
        const files = inputElement.files;
        if (!files || files.length === 0) {
          inputElement.click();
        }
      }, 0);
  });
}

export function getOrCreateClientId() {
  let clientId = window.localStorage.getItem("watchparty-clientid");
  if (!clientId) {
    // Generate a new clientID and save it
    // This requires https, so fallback to JS implementation if needed
    clientId = createUuid();
    window.localStorage.setItem("watchparty-clientid", clientId);
  }
  return clientId;
}

export function getOrCreateSessionId() {
  let sessionId = window.localStorage.getItem("watchparty-sessionid");
  if (!sessionId) {
    // Generate a new sessionID and save it
    // This requires https, so fallback to JS implementation if needed
    sessionId = createUuid();
    window.localStorage.setItem("watchparty-sessionid", sessionId);
  }
  return sessionId;
}

export function addAndSavePassword(roomId: string, password: string) {
  const newPasswords = { ...getSavedPasswords() };
  if (password) {
    newPasswords[roomId] = password;
  } else {
    delete newPasswords[roomId];
  }
  window.sessionStorage.setItem("watchparty-passwords", JSON.stringify(newPasswords));
}

export function getSavedPasswords(): Record<string, string> {
  const parsePasswords = (raw: string | null) => {
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  };
  try {
    const sessionPasswords = parsePasswords(
      window.sessionStorage.getItem("watchparty-passwords"),
    );
    if (Object.keys(sessionPasswords).length > 0) {
      return sessionPasswords;
    }
    // Migrate legacy localStorage passwords to sessionStorage and clear the old key.
    const legacyPasswords = parsePasswords(
      window.localStorage.getItem("watchparty-passwords"),
    );
    if (Object.keys(legacyPasswords).length > 0) {
      window.sessionStorage.setItem(
        "watchparty-passwords",
        JSON.stringify(legacyPasswords),
      );
      window.localStorage.removeItem("watchparty-passwords");
    }
    return legacyPasswords;
  } catch (e) {
    console.warn("[ALERT] Could not parse saved passwords");
  }
  return {};
}

export function createUuid() {
  return crypto.randomUUID ? crypto.randomUUID() : uuidv4();
}

export function calculateMedian(array: number[]): number {
  // Check If Data Exists
  if (array.length >= 1) {
    // Sort Array
    array = array.sort((a: number, b: number) => {
      return a - b;
    });

    // Array Length: Even
    if (array.length % 2 === 0) {
      // Average Of Two Middle Numbers
      return (array[array.length / 2 - 1] + array[array.length / 2]) / 2;
    }
    // Array Length: Odd
    else {
      // Middle Number
      return array[(array.length - 1) / 2];
    }
  }
  return 0;
}

export async function getUserImage(
  user: FirebaseUser,
): Promise<string | null> {
  if (user.photoURL) {
    return user.photoURL + "?height=256&width=256";
  }
  const hash = user.email ? MD5.hash(user.email) : "";
  return `https://www.gravatar.com/avatar/${hash}?d=identicon`;
}

export const getFileName = (input: string) => {
  return input.split("/").slice(-1)[0];
};

export const isEmojiString = (input?: string): boolean => {
  return /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])+$/g.test(
    input ?? "",
  );
};

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16),
  );
}

// Subtract header, URL row, button row, 3 gaps, controls
export const VIDEO_MAX_HEIGHT_CSS =
  "calc(100vh - 64px - 36px - 36px - 4px - 4px - 4px - 32px)";
