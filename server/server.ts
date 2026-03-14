import config from "./config.ts";
import fs from "node:fs";
import express, { type Request, type Response } from "express";
import bodyParser from "body-parser";
import compression from "compression";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import https from "node:https";
import http from "node:http";
import { Server } from "socket.io";
import { searchYoutube, youtubePlaylist } from "./utils/youtube.ts";
import { Room } from "./room.ts";
import { redis, redisCount } from "./utils/redis.ts";
import {
  getCustomerByEmail,
  createSelfServicePortal,
  getIsSubscriberByEmail,
} from "./utils/stripe.ts";
import {
  deleteUser,
  getUserBillingProfile,
  validateUserToken,
} from "./utils/firebase.ts";
import path from "node:path";
import { isIP } from "node:net";
import { getStartOfDay } from "./utils/time.ts";
import { getSessionLimitSeconds } from "./vm/utils.ts";
import { postgres, insertObject, upsertObject } from "./utils/postgres.ts";
import axios from "axios";
import { resolveShard } from "./utils/resolveShard.ts";
import { makeRoomName, makeUserName } from "./utils/moniker.ts";
import { getStats } from "./utils/getStats.ts";
import {
  billingEnabled,
  type CheckoutPlanId,
  createCheckoutSession,
  getFrontendUrl,
  handleStripeWebhook,
} from "./utils/billing.ts";
import {
  getDefaultBillingProfile,
  getEntitlementsForPlan,
  isSubscriberPlan,
  type UserBillingProfile,
  type UserPlan,
} from "./utils/entitlements.ts";

if (process.env.NODE_ENV === "development") {
  axios.interceptors.request.use(
    (config) => {
      // console.log(config);
      return config;
    },
    (error) => {
      console.error(error);
    },
  );
}

async function resolveBillingProfile(decoded: {
  uid?: string;
  email?: string;
}): Promise<UserBillingProfile> {
  if (decoded?.uid) {
    const profile = await getUserBillingProfile(decoded.uid);
    return profile;
  }
  if (decoded?.email) {
    const isSub = await getIsSubscriberByEmail(decoded.email);
    const plan: UserPlan = isSub ? "premium" : "free";
    return {
      ...getDefaultBillingProfile(),
      plan,
      subscriptionStatus: isSub ? "active" : "canceled",
      entitlements: getEntitlementsForPlan(plan),
    };
  }
  return getDefaultBillingProfile();
}

const releaseInterval = 5 * 60 * 1000;
const app = express();

function normalizeOrigin(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
}

function isLoopbackOrigin(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

const isDevelopmentEnv =
  String(process.env.NODE_ENV || config.NODE_ENV || "").toLowerCase() ===
  "development";
const corsAllowedOrigins = new Set(
  String(config.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean),
);
const frontendOrigin = normalizeOrigin(config.FRONTEND_URL);
if (frontendOrigin) {
  corsAllowedOrigins.add(frontendOrigin);
}
const trustedFrontendOrigins = new Set(corsAllowedOrigins);

function resolveTrustedOrigin(value: unknown) {
  const normalized = normalizeOrigin(value);
  if (!normalized) {
    return undefined;
  }
  return trustedFrontendOrigins.has(normalized) ? normalized : undefined;
}

function resolveTrustedReturnUrl(
  candidate: unknown,
  requestOrigin: unknown,
) {
  if (typeof candidate === "string" && candidate.trim()) {
    try {
      const parsed = new URL(candidate);
      if (resolveTrustedOrigin(parsed.origin)) {
        return parsed.toString();
      }
    } catch {
      // ignore and fallback
    }
  }
  const trustedRequestOrigin = resolveTrustedOrigin(requestOrigin);
  return getFrontendUrl(trustedRequestOrigin);
}

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Non-browser or same-origin requests (no Origin header)
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
      callback(null, false);
      return;
    }
    if (corsAllowedOrigins.size > 0) {
      callback(null, corsAllowedOrigins.has(normalizedOrigin));
      return;
    }
    // Development fallback keeps local split frontend/backend working.
    if (isDevelopmentEnv && isLoopbackOrigin(normalizedOrigin)) {
      callback(null, true);
      return;
    }
    callback(null, isDevelopmentEnv);
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};
const rateLimitWindowMs = Math.max(
  1000,
  Number(config.RATE_LIMIT_WINDOW_MS) || 60000,
);
const rateLimitMax = Math.max(1, Number(config.RATE_LIMIT_MAX) || 240);
const apiLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
  // Avoid throttling media segment fetch loops.
  skip: (req) => req.path.startsWith("/proxy/"),
});
let server = null as https.Server | http.Server | null;
if (config.SSL_KEY_FILE && config.SSL_CRT_FILE) {
  const key = fs.readFileSync(config.SSL_KEY_FILE);
  const cert = fs.readFileSync(config.SSL_CRT_FILE);
  server = https.createServer({ key: key, cert: cert }, app);
} else {
  server = new http.Server(app);
}
server?.listen(config.PORT, config.HOST);

const io = new Server(server, { cors: {}, transports: ["websocket"] });
io.engine.use(async (req: any, res: Response, next: () => void) => {
  const roomId = req._query.roomId;
  if (!roomId) {
    return next();
  }
  // Attempt to ensure the room being connected to is loaded in memory
  // If it doesn't exist, we may fail later with "invalid namespace"
  const shard = resolveShard(roomId);
  const key = "/" + roomId;
  // Check to make sure this shard should load this room
  const isCorrectShard = !config.SHARD || shard === Number(config.SHARD);
  // Get the room data from postgres
  const persistedRoom = (
    await postgres?.query<PersistentRoom>(
      `SELECT * from room where "roomId" = $1`,
      [key],
    )
  )?.rows?.[0];
  // Don't await after this because we may have a race condition where 2 rquests both try to load the room
  if (isCorrectShard && !rooms.has(key)) {
    const data = persistedRoom?.data
      ? JSON.stringify(persistedRoom.data)
      : undefined;
    if (data) {
      const room = new Room(io, key, data);
      rooms.set(key, room);
      console.log(
        "loading room %s into memory on shard %s",
        roomId,
        config.SHARD,
      );
    }
  }
  next();
});

const rooms = new Map<string, Room>();
const roomSlugPattern = /^[a-z0-9-]{3,80}$/;
const proxyAllowedHostSuffixes = [
  ".ttvnw.net",
  ".cloudfront.net",
  ".akamaized.net",
  ".akamaihd.net",
];

function normalizeDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function normalizeRoomTitle(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 70);
}

function normalizeSlug(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = slugify(value);
  if (!roomSlugPattern.test(normalized)) {
    return "";
  }
  return normalized;
}

function isPrivateHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local")
  ) {
    return true;
  }
  const ipType = isIP(lower);
  if (!ipType) {
    return false;
  }
  // Reject IPv6 literals and private/reserved IPv4 ranges.
  if (ipType === 6) {
    return true;
  }
  const [a, b] = lower.split(".").map((part) => Number(part));
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function normalizeProxyHost(value: string | null) {
  if (!value || typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (
    !trimmed ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("@") ||
    trimmed.includes("?") ||
    trimmed.includes("#")
  ) {
    return "";
  }
  let parsed: URL;
  try {
    parsed = new URL(`https://${trimmed}`);
  } catch {
    return "";
  }
  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port;
  if (!hostname || hostname.length > 253) {
    return "";
  }
  if (port && port !== "443") {
    return "";
  }
  if (isPrivateHostname(hostname)) {
    return "";
  }
  const allowed = proxyAllowedHostSuffixes.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
  if (!allowed) {
    return "";
  }
  return port ? `${hostname}:${port}` : hostname;
}

function getAuthCredentials(req: Request) {
  const uidHeader = req.header("x-user-uid");
  const authHeader = req.header("authorization");
  const bearerToken =
    authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const uid = typeof uidHeader === "string" ? uidHeader.trim() : "";
  const token = bearerToken;
  return {
    uid,
    token,
  };
}

async function roomIdExists(name: string) {
  if (rooms.has(name)) {
    return true;
  }
  if (!postgres) {
    return false;
  }
  try {
    const result = await postgres.query(
      'SELECT 1 FROM room WHERE "roomId" = $1 LIMIT 1',
      [name],
    );
    return Boolean(result.rows[0]);
  } catch (e: any) {
    console.warn("[roomIdExists db error]", e?.message ?? e);
    return false;
  }
}

async function getAvailableRoomName(baseSlug: string) {
  const safeBase = normalizeSlug(baseSlug) || makeRoomName(config.SHARD);
  for (let i = 0; i < 300; i++) {
    const suffix = i === 0 ? "" : `-${i + 1}`;
    const candidate = `/${safeBase}${suffix}`;
    if (!(await roomIdExists(candidate))) {
      return candidate;
    }
  }
  return "/" + makeRoomName(config.SHARD);
}

const YOUTUBE_SURPRISE_CATEGORIES = {
  "tente-nao-rir": {
    queries: [
      "tente não rir brasil",
      "try not to laugh challenge brasil",
      "não rir challenge brasileiro",
    ],
    label: "Tente nÃ£o rir",
  },
  gaming: {
    queries: [
      "alanzoka gameplay",
      "gaules melhores momentos",
      "cellbit gameplay",
      "jazzghost gameplay",
      "loud gameplay",
    ],
    label: "Gaming",
  },
  "clipe-de-musica": {
    queries: [
      "clipe oficial brasil",
      "música brasileira oficial",
      "top hits brasil clipe",
    ],
    label: "Clipe de mÃºsica",
  },
  "stand-up": {
    queries: [
      "whindersson nunes stand up completo",
      "thiago ventura stand up",
      "afonso padilha stand up",
      "bruna louise stand up",
      "rafinha bastos stand up",
    ],
    label: "Stand-up",
  },
  documentario: {
    queries: [
      "documentário completo brasil",
      "documentário nacional completo",
      "documentário história do brasil",
      "documentário investigação brasil",
      "documentário natureza brasil",
    ],
    label: "DocumentÃ¡rio",
  },
  culinaria: {
    queries: [
      "rita lobo receita",
      "panelinha receita",
      "ana maria braga receitas",
      "tastemade brasil receitas",
      "receita brasileira passo a passo",
    ],
    label: "CulinÃ¡ria",
  },
  "viral-trending": {
    queries: [
      "viral brasil trending",
      "vídeos virais brasileiros",
      "most viral videos 2024 compilation brasil",
    ],
    label: "Viral / Trending",
  },
} as const;

type SurpriseVideoCategory = keyof typeof YOUTUBE_SURPRISE_CATEGORIES;

type SurpriseVideoItem = {
  id: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  views: number;
};

function getYoutubeApiErrorInfo(error: any) {
  const status = Number(error?.response?.status ?? 0);
  const reason = String(
    error?.response?.data?.error?.details?.[0]?.reason ??
      error?.response?.data?.error?.errors?.[0]?.reason ??
      "",
  ).trim();
  const message = String(error?.response?.data?.error?.message ?? "").trim();
  return { status, reason, message };
}

type TmdbWatchProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

const TMDB_PLATFORM_CATALOG = [
  {
    key: "netflix",
    label: "Netflix",
    aliases: ["netflix"],
  },
  {
    key: "prime-video",
    label: "Prime Video",
    aliases: ["prime video", "amazon prime", "primevideo"],
  },
  {
    key: "disney-plus",
    label: "Disney+",
    aliases: ["disney+", "disney plus", "disneyplus"],
  },
  {
    key: "globoplay",
    label: "Globoplay",
    aliases: ["globoplay"],
  },
  {
    key: "hbo-max",
    label: "HBO Max",
    aliases: ["hbo max", "hbomax", "max"],
  },
  {
    key: "appletv",
    label: "Apple TV+",
    aliases: ["apple tv", "apple tv+", "appletv", "apple tv plus"],
  },
] as const;

type TmdbCatalogKey = (typeof TMDB_PLATFORM_CATALOG)[number]["key"];

function normalizeSurpriseCategory(input: unknown): SurpriseVideoCategory {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "gameplay") {
    return "gaming";
  }
  if (value === "musicas" || value === "música" || value === "musica") {
    return "clipe-de-musica";
  }
  if (value === "aleatorio" || value === "aleatÃ³rio" || value === "random") {
    const keys = Object.keys(
      YOUTUBE_SURPRISE_CATEGORIES,
    ) as SurpriseVideoCategory[];
    return keys[Math.floor(Math.random() * keys.length)];
  }
  if (value in YOUTUBE_SURPRISE_CATEGORIES) {
    return value as SurpriseVideoCategory;
  }
  return "tente-nao-rir";
}

async function fetchSurpriseVideos(
  rawCategory: unknown,
): Promise<{ category: SurpriseVideoCategory; items: SurpriseVideoItem[] }> {
  const category = normalizeSurpriseCategory(rawCategory);
  const categoryConfig = YOUTUBE_SURPRISE_CATEGORIES[category];
  const key = String(config.YOUTUBE_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("youtube_key_missing");
  }
  const searchResponses = await Promise.all(
    categoryConfig.queries.map((query) =>
      axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          key,
          part: "snippet",
          type: "video",
          maxResults: 12,
          q: query,
          order: "relevance",
          videoDuration: "any",
          regionCode: "BR",
          relevanceLanguage: "pt-BR",
          safeSearch: "moderate",
        },
        timeout: 12000,
      }),
    ),
  );
  const ids = Array.from(
    new Set(
      searchResponses
        .flatMap((response) =>
          Array.isArray(response.data?.items) ? response.data.items : [],
        )
        .map((item: any) => String(item?.id?.videoId ?? ""))
        .filter(Boolean),
    ),
  ).slice(0, 50);
  if (!ids.length) {
    return { category, items: [] };
  }
  const videosResponse = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
    params: {
      key,
      part: "snippet,statistics",
      id: ids.join(","),
      maxResults: 50,
    },
    timeout: 12000,
  });
  const videos = Array.isArray(videosResponse.data?.items)
    ? videosResponse.data.items
    : [];
  const result = videos
    .map((item: any) => {
      const id = String(item?.id ?? "");
      const views = Number(item?.statistics?.viewCount ?? 0);
      const thumb =
        String(item?.snippet?.thumbnails?.high?.url ?? "") ||
        String(item?.snippet?.thumbnails?.medium?.url ?? "") ||
        String(item?.snippet?.thumbnails?.default?.url ?? "");
      return {
        id,
        url: id ? `https://www.youtube.com/watch?v=${id}` : "",
        title: String(item?.snippet?.title ?? ""),
        channel: String(item?.snippet?.channelTitle ?? ""),
        thumbnail: thumb,
        views,
      } as SurpriseVideoItem;
    })
    .filter(
      (item: SurpriseVideoItem) => item.id && item.url && item.title,
    );
  return { category, items: result };
}

function getTmdbAuthConfig() {
  const token = String(config.TMDB_READ_TOKEN ?? "").trim();
  const apiKey = String(config.TMDB_API_KEY ?? "").trim();
  // Prefer API key when available, because an invalid bearer token can
  // otherwise force all requests to fail even with a valid API key configured.
  if (apiKey) {
    return {
      headers: {
        Accept: "application/json",
      } as Record<string, string>,
      params: {
        api_key: apiKey,
      } as Record<string, string>,
    };
  }
  if (token) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      } as Record<string, string>,
      params: {} as Record<string, string>,
    };
  }
  throw new Error("tmdb_token_missing");
}

function withTmdbAuthParams(input: Record<string, string | number>) {
  const auth = getTmdbAuthConfig();
  return {
    headers: auth.headers,
    params: {
      ...input,
      ...auth.params,
    },
  };
}

function getTmdbHeaders() {
  const token = String(config.TMDB_READ_TOKEN ?? "").trim();
  if (!token && !String(config.TMDB_API_KEY ?? "").trim()) {
    throw new Error("tmdb_token_missing");
  }
  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeCatalogKey(value: unknown): TmdbCatalogKey | null {
  const normalized = normalizeText(value).replace(/[_\s]+/g, "-");
  const byKey = TMDB_PLATFORM_CATALOG.find((item) => item.key === normalized);
  if (byKey) {
    return byKey.key;
  }
  const byAlias = TMDB_PLATFORM_CATALOG.find((item) =>
    item.aliases.some((alias) => normalizeText(alias).replace(/[_\s]+/g, "-") === normalized),
  );
  return byAlias?.key ?? null;
}

type WatchLinkType = "direct" | "tmdb_fallback";

type WatchmodeSource = {
  source_id?: number;
  name?: string;
  web_url?: string;
  region?: string;
};

type DirectWatchLinkResult = {
  url: string;
  providerName: string;
};

const WATCHMODE_DIRECT_TTL_MS = 30 * 60 * 1000;
const watchmodeDirectCache = new Map<
  string,
  { expiresAt: number; value: DirectWatchLinkResult | null }
>();

function getWatchmodeBaseUrl() {
  return String(config.WATCHMODE_BASE_URL || "https://api.watchmode.com").replace(/\/+$/, "");
}

function getWatchmodeApiKey() {
  return String(config.WATCHMODE_API_KEY || "").trim();
}

function normalizeProviderToken(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

const WATCHMODE_PROVIDER_ALIASES: Record<string, string[]> = {
  netflix: ["netflix", "netflixbr", "nfx"],
  "prime-video": ["primevideo", "amazonprime", "prime"],
  "disney-plus": ["disneyplus", "disney+"],
  globoplay: ["globoplay", "globo"],
  "hbo-max": ["hbomax", "max", "hbo"],
  appletv: ["appletv+", "appletvplus", "appletv", "appletv"],
};

function matchesWatchmodeProvider(
  catalogKey: TmdbCatalogKey | null,
  sourceName: string,
  tmdbProviderName: string,
) {
  const source = normalizeProviderToken(sourceName);
  const tmdb = normalizeProviderToken(tmdbProviderName);
  if (!source) {
    return false;
  }
  const aliases = catalogKey ? WATCHMODE_PROVIDER_ALIASES[catalogKey] ?? [] : [];
  return aliases.some((alias) => source.includes(normalizeProviderToken(alias))) || source.includes(tmdb);
}

async function resolveWatchmodeTitleId(
  movieId: number,
  imdbId: string,
): Promise<number | null> {
  const apiKey = getWatchmodeApiKey();
  if (!apiKey) {
    return null;
  }
  const baseUrl = getWatchmodeBaseUrl();
  const candidates = [
    { search_field: "tmdb_id", search_value: String(movieId) },
    ...(imdbId ? [{ search_field: "imdb_id", search_value: imdbId }] : []),
  ];
  for (const candidate of candidates) {
    try {
      const response = await axios.get(`${baseUrl}/v1/search/`, {
        params: {
          apiKey,
          search_field: candidate.search_field,
          search_value: candidate.search_value,
          types: "movie",
          limit: 5,
        },
        timeout: 10000,
      });
      const title = Array.isArray(response.data?.title_results)
        ? response.data.title_results[0]
        : Array.isArray(response.data)
          ? response.data[0]
          : null;
      const id = Number(title?.id);
      if (Number.isFinite(id) && id > 0) {
        return id;
      }
    } catch {
      // ignore and try next strategy
    }
  }
  return null;
}

async function resolveDirectWatchLink(params: {
  movieId: number;
  imdbId: string;
  catalogKey: TmdbCatalogKey | null;
  tmdbProviderName: string;
  region: string;
}): Promise<DirectWatchLinkResult | null> {
  const apiKey = getWatchmodeApiKey();
  if (!apiKey) {
    return null;
  }
  const region = (params.region || "BR").toUpperCase();
  const cacheKey = `${params.movieId}:${params.catalogKey || "unknown"}:${region}`;
  const cached = watchmodeDirectCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const baseUrl = getWatchmodeBaseUrl();
  const titleId = await resolveWatchmodeTitleId(params.movieId, params.imdbId);
  if (!titleId) {
    watchmodeDirectCache.set(cacheKey, {
      expiresAt: Date.now() + WATCHMODE_DIRECT_TTL_MS,
      value: null,
    });
    return null;
  }

  try {
    const response = await axios.get(`${baseUrl}/v1/title/${titleId}/sources/`, {
      params: {
        apiKey,
        regions: region,
      },
      timeout: 10000,
    });
    const rawSources = Array.isArray(response.data) ? response.data : [];
    const sources = rawSources as WatchmodeSource[];
    const selected =
      sources.find(
        (source) =>
          (!source.region || String(source.region).toUpperCase() === region) &&
          source.web_url &&
          matchesWatchmodeProvider(
            params.catalogKey,
            String(source.name || ""),
            params.tmdbProviderName,
          ),
      ) ?? null;
    const result = selected?.web_url
      ? {
          url: selected.web_url,
          providerName: String(selected.name || params.tmdbProviderName),
        }
      : null;
    watchmodeDirectCache.set(cacheKey, {
      expiresAt: Date.now() + WATCHMODE_DIRECT_TTL_MS,
      value: result,
    });
    return result;
  } catch {
    watchmodeDirectCache.set(cacheKey, {
      expiresAt: Date.now() + WATCHMODE_DIRECT_TTL_MS,
      value: null,
    });
    return null;
  }
}

async function fetchTmdbProviders(region = "BR") {
  const response = await axios.get("https://api.themoviedb.org/3/watch/providers/movie", {
    ...withTmdbAuthParams({
      language: "pt-BR",
      watch_region: region,
      page: 1,
    }),
    timeout: 12000,
  });
  const results = Array.isArray(response.data?.results)
    ? (response.data.results as TmdbWatchProvider[])
    : [];
  const providerMap = new Map<number, TmdbWatchProvider>();
  for (const provider of results) {
    if (provider?.provider_id) {
      providerMap.set(provider.provider_id, provider);
    }
  }
  const catalog = TMDB_PLATFORM_CATALOG.map((platform) => {
    const found = results.find((provider) => {
      const providerName = normalizeText(provider.provider_name);
      return platform.aliases.some((alias) => providerName.includes(normalizeText(alias)));
    });
    return {
      key: platform.key,
      label: platform.label,
      providerId: found?.provider_id ?? null,
      providerName: found?.provider_name ?? null,
      logoPath: found?.logo_path ?? null,
    };
  });
  return { catalog, providerMap };
}

function parseGenreId(value: unknown) {
  const text = normalizeText(value);
  if (!text || text === "qualquer" || text === "any") {
    return null;
  }
  if (/^\d+$/.test(text)) {
    return Number(text);
  }
  const genreByName: Record<string, number> = {
    acao: 28,
    "aÃ§Ã£o": 28,
    comedia: 35,
    "comÃ©dia": 35,
    terror: 27,
    romance: 10749,
    animacao: 16,
    "animaÃ§Ã£o": 16,
    suspense: 53,
  };
  return genreByName[text] ?? null;
}

function shouldKeepMovieForGenre(movie: any, genreId: number | null) {
  if (!genreId) {
    return true;
  }
  const ids = Array.isArray(movie?.genre_ids)
    ? movie.genre_ids
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isFinite(id))
    : [];
  if (!ids.length) {
    return true;
  }
  if (!ids.includes(genreId)) {
    return false;
  }
  // "Comédia" deve trazer humor, não comédia romântica.
  if (genreId === 35 && ids.includes(10749)) {
    return false;
  }
  return true;
}

type MovieHistoryPayload = {
  movieId: number;
  title: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  rating?: number | null;
  platform?: string | null;
  watchedAt?: string | null;
};

let movieHistoryTableReady = false;
async function ensureMovieHistoryTable() {
  if (!postgres || movieHistoryTableReady) {
    return;
  }
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS movie_history (
      uid text NOT NULL,
      movie_id bigint NOT NULL,
      title text NOT NULL,
      poster_path text,
      backdrop_path text,
      rating double precision,
      platform text,
      watched_at timestamp with time zone NOT NULL DEFAULT NOW(),
      PRIMARY KEY (uid, movie_id)
    );
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS movie_history_uid_watched_at_idx
    ON movie_history (uid, watched_at DESC);
  `);
  movieHistoryTableReady = true;
}
// Following functions iterate over in-memory rooms
setInterval(minuteMetrics, 60 * 1000);
setInterval(release, releaseInterval);
setInterval(saveRooms, 1000);
if (process.env.NODE_ENV === "development") {
  try {
    import("./vmWorker.ts");
    // import('./syncSubs.ts');
    // import('./timeSeries.ts');
  } catch (e) {
    console.error(e);
  }
}

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    if (!billingEnabled()) {
      res.status(503).json({ error: "billing_not_configured" });
      return;
    }
    const result = await handleStripeWebhook(
      req.body as Buffer,
      req.headers["stripe-signature"],
    );
    res.json({ received: true, ...result });
  } catch (e: any) {
    console.error("[billing webhook error]", e?.message ?? e);
    res.status(400).json({ error: "invalid_webhook" });
  }
});

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'self'"],
        "object-src": ["'none'"],
        "script-src": [
          "'self'",
          "https://www.googletagmanager.com",
          "https://www.youtube.com",
        ],
        "connect-src": [
          "'self'",
          "https://www.google-analytics.com",
          "https://region1.google-analytics.com",
          "ws:",
          "wss:",
        ],
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "font-src": ["'self'", "data:", "https:"],
        "media-src": ["'self'", "blob:", "https:"],
        "frame-src": [
          "'self'",
          "https://www.youtube.com",
          "https://www.youtube-nocookie.com",
        ],
        "worker-src": ["'self'", "blob:"],
      },
    },
  }),
);
app.use(cors(corsOptions));
app.use(apiLimiter);
app.use(bodyParser.json());
app.use(bodyParser.raw({ type: "text/plain", limit: 1000000 }));

app.get("/ping", (_req, res) => {
  res.json("pong");
});

app.use(compression());

app.get("/stats", async (req, res) => {
  if (req.query.key && req.query.key === config.STATS_KEY) {
    const stats = await getStats();
    res.json(stats);
  } else {
    res.status(403).json({ error: "Access Denied" });
  }
});

app.get("/health/:metric", async (req, res) => {
  const vmManagerStats = (
    await axios.get("http://localhost:" + config.VMWORKER_PORT + "/stats")
  ).data;
  const result = vmManagerStats[req.params.metric]?.availableVBrowsers?.length;
  res.status(result ? 200 : 500).json(result);
});

app.get("/timeSeries", async (req, res) => {
  if (req.query.key && req.query.key === config.STATS_KEY && redis) {
    const timeSeriesData = await redis.lrange("timeSeries", 0, -1);
    const timeSeries = timeSeriesData.map((entry) => JSON.parse(entry));
    res.json(timeSeries);
  } else {
    res.status(403).json({ error: "Access Denied" });
  }
});

app.get("/youtube", async (req, res) => {
  if (typeof req.query.q === "string") {
    try {
      redisCount("youtubeSearch");
      const items = await searchYoutube(req.query.q);
      res.json(items);
    } catch {
      res.status(500).json({ error: "youtube error" });
    }
  } else {
    res.status(500).json({ error: "query must be a string" });
  }
});

app.get("/youtubePlaylist/:playlistId", async (req, res) => {
  try {
    const items = await youtubePlaylist(req.params.playlistId);
    res.json(items);
  } catch {
    res.status(500).json({ error: "youtube error" });
  }
});

app.get("/surprise/video", async (req, res) => {
  try {
    redisCount("surpriseVideoSearch");
    const response = await fetchSurpriseVideos(req.query.category);
    res.json(response);
  } catch (error: any) {
    const info = getYoutubeApiErrorInfo(error);
    const code = String(error?.message ?? "");
    if (code === "youtube_key_missing") {
      res.status(503).json({
        error: "youtube_not_configured",
        message: "A busca de vÃ­deos estÃ¡ temporariamente indisponÃ­vel.",
      });
      return;
    }
    if (
      info.status === 403 &&
      (info.reason === "API_KEY_SERVICE_BLOCKED" ||
        info.reason === "forbidden" ||
        /blocked/i.test(info.message))
    ) {
      res.status(503).json({
        error: "youtube_api_blocked",
        message:
          "A chave do YouTube estÃ¡ bloqueada para busca. Ative YouTube Data API v3 e revise as restriÃ§Ãµes da API key.",
      });
      return;
    }
    console.warn("[surprise video error]", error?.message ?? error);
    res.status(500).json({
      error: "surprise_video_failed",
      message: "NÃ£o foi possÃ­vel buscar vÃ­deos agora. Tente novamente.",
    });
  }
});

app.get("/surprise/providers", async (req, res) => {
  try {
    const region = typeof req.query.region === "string" ? req.query.region : "BR";
    const providers = await fetchTmdbProviders(region);
    res.json({
      region,
      providers: providers.catalog,
    });
  } catch (error: any) {
    const code = String(error?.message ?? "");
    if (code === "tmdb_token_missing") {
      res.status(503).json({
        error: "tmdb_not_configured",
        message: "A busca de filmes estÃ¡ temporariamente indisponÃ­vel.",
      });
      return;
    }
    console.warn("[surprise providers error]", error?.message ?? error);
    res.status(500).json({
      error: "surprise_providers_failed",
      message: "NÃ£o foi possÃ­vel carregar as plataformas no momento.",
    });
  }
});

app.get("/surprise/movies", async (req, res) => {
  try {
    const genreId = parseGenreId(req.query.genre);
    const region = "BR";
    const providersPayload = await fetchTmdbProviders(region);
    const providerParts = String(req.query.providers ?? "")
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const providerIds = providerParts
      .map((part) => {
        if (/^\d+$/.test(part)) {
          return Number(part);
        }
        const key = normalizeCatalogKey(part);
        if (!key) {
          return NaN;
        }
        const found = providersPayload.catalog.find((entry) => entry.key === key);
        return Number(found?.providerId ?? NaN);
      })
      .filter((id) => Number.isFinite(id) && id > 0);

    const discoverParams: Record<string, string | number> = {
      language: "pt-BR",
      region,
      sort_by: "popularity.desc",
      "vote_average.gte": 7.0,
      "vote_count.gte": 200,
      watch_region: region,
      page: 1,
    };
    if (genreId) {
      discoverParams.with_genres = genreId;
    }
    if (providerIds.length > 0) {
      discoverParams.with_watch_providers = providerIds.join("|");
    }
    const firstPageResponse = await axios.get("https://api.themoviedb.org/3/discover/movie", {
      ...withTmdbAuthParams(discoverParams),
      timeout: 12000,
    });
    const totalPages = Math.max(
      1,
      Math.min(5, Number(firstPageResponse.data?.total_pages ?? 1)),
    );
    const page =
      totalPages <= 1 ? 1 : Math.floor(Math.random() * totalPages) + 1;
    let responseData = firstPageResponse.data;
    if (page > 1) {
      const randomPageResponse = await axios.get(
        "https://api.themoviedb.org/3/discover/movie",
        {
          ...withTmdbAuthParams({
            ...discoverParams,
            page,
          }),
          timeout: 12000,
        },
      );
      responseData = randomPageResponse.data;
    }
    const results = Array.isArray(responseData?.results)
      ? responseData.results.filter((movie: any) =>
          shouldKeepMovieForGenre(movie, genreId),
        )
      : [];
    res.json({
      page,
      totalPages,
      totalResults: Number(responseData?.total_results ?? results.length),
      results: results.map((movie: any) => ({
        id: Number(movie?.id),
        title: String(movie?.title ?? ""),
        release_date: String(movie?.release_date ?? ""),
        vote_average: Number(movie?.vote_average ?? 0),
        overview: String(movie?.overview ?? ""),
        poster_path: movie?.poster_path ? String(movie.poster_path) : null,
        backdrop_path: movie?.backdrop_path ? String(movie.backdrop_path) : null,
      })),
    });
  } catch (error: any) {
    const code = String(error?.message ?? "");
    if (code === "tmdb_token_missing") {
      res.status(503).json({
        error: "tmdb_not_configured",
        message: "A busca de filmes estÃ¡ temporariamente indisponÃ­vel.",
      });
      return;
    }
    console.warn("[surprise movies error]", error?.message ?? error);
    res.status(500).json({
      error: "surprise_movies_failed",
      message: "NÃ£o foi possÃ­vel buscar filmes agora. Tente novamente.",
    });
  }
});

app.get("/surprise/movie/:id", async (req, res) => {
  try {
    const movieId = Number(req.params.id);
    if (!Number.isFinite(movieId) || movieId <= 0) {
      res.status(400).json({ error: "invalid_movie_id" });
      return;
    }
    const region = typeof req.query.region === "string" ? req.query.region : "BR";
    const [detailsResponse, providersResponse] = await Promise.all([
      axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
        ...withTmdbAuthParams({ language: "pt-BR", append_to_response: "external_ids" }),
        timeout: 12000,
      }),
      axios.get(`https://api.themoviedb.org/3/movie/${movieId}/watch/providers`, {
        ...withTmdbAuthParams({}),
        timeout: 12000,
      }),
    ]);
    const providerIdsFilter = String(req.query.providerIds ?? "")
      .split(/[|,]/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item > 0);
    const providerKeys = String(req.query.providerKeys ?? "")
      .split(/[|,]/)
      .map((item) => normalizeCatalogKey(item))
      .filter((item): item is TmdbCatalogKey => Boolean(item));
    if (providerKeys.length > 0) {
      const providersPayload = await fetchTmdbProviders("BR");
      const mappedIds = providersPayload.catalog
        .filter(
          (provider) =>
            provider.providerId &&
            providerKeys.includes(provider.key as TmdbCatalogKey),
        )
        .map((provider) => Number(provider.providerId))
        .filter((id) => Number.isFinite(id) && id > 0);
      providerIdsFilter.push(...mappedIds);
    }
    const regionData = providersResponse.data?.results?.[region];
    const providers: TmdbWatchProvider[] = [
      ...(Array.isArray(regionData?.flatrate) ? regionData.flatrate : []),
      ...(Array.isArray(regionData?.rent) ? regionData.rent : []),
      ...(Array.isArray(regionData?.buy) ? regionData.buy : []),
    ];
    const uniqueProviders = providers.filter(
      (provider, index, arr) =>
        arr.findIndex((entry) => entry.provider_id === provider.provider_id) === index,
    );
    const selectedProvider =
      uniqueProviders.find((provider) =>
        providerIdsFilter.includes(provider.provider_id),
      ) ?? uniqueProviders[0] ?? null;
    const selectedCatalogKey = normalizeCatalogKey(selectedProvider?.provider_name ?? "");
    const imdbId = String(detailsResponse.data?.external_ids?.imdb_id ?? "").trim();
    const directWatchLink = selectedProvider
      ? await resolveDirectWatchLink({
          movieId,
          imdbId,
          catalogKey: selectedCatalogKey,
          tmdbProviderName: selectedProvider.provider_name,
          region,
        })
      : null;
    const fallbackWatchLink = typeof regionData?.link === "string" ? regionData.link : "";
    const watchLink = directWatchLink?.url || fallbackWatchLink;
    const watchLinkType: WatchLinkType = directWatchLink?.url ? "direct" : "tmdb_fallback";
    const watchLinkProvider =
      directWatchLink?.providerName ||
      selectedProvider?.provider_name ||
      "";
    res.json({
      movie: detailsResponse.data,
      watchLink,
      watchLinkType,
      watchLinkProvider,
      platform: selectedProvider
        ? {
            id: selectedProvider.provider_id,
            name: selectedProvider.provider_name,
            logoPath: selectedProvider.logo_path ?? null,
          }
        : null,
    });
  } catch (error: any) {
    const code = String(error?.message ?? "");
    if (code === "tmdb_token_missing") {
      res.status(503).json({
        error: "tmdb_not_configured",
        message: "A busca de filmes estÃ¡ temporariamente indisponÃ­vel.",
      });
      return;
    }
    console.warn("[surprise movie details error]", error?.message ?? error);
    res.status(500).json({
      error: "surprise_movie_details_failed",
      message: "NÃ£o foi possÃ­vel carregar os detalhes desse filme agora.",
    });
  }
});

app.post("/createRoom", async (req, res) => {
  try {
    const decoded = await validateUserToken(req.body?.uid, req.body?.token);
    const billingProfile = await resolveBillingProfile(decoded ?? {});
    const isSubscriberRoom = isSubscriberPlan(billingProfile.plan);

    const requestedSlug = normalizeSlug(req.body?.roomSlug);
    const displayName = normalizeDisplayName(req.body?.username);
    const roomTitle = normalizeRoomTitle(req.body?.roomTitle);
    const effectiveRoomTitle =
      roomTitle || (displayName ? `Sala de ${displayName}`.slice(0, 40) : "Sala compartilhada");
    const displaySlug = slugify(displayName);
    const baseRoomSlug =
      requestedSlug ||
      (displaySlug ? `cinema-${displaySlug}` : "cinema-sala");
    const name = await getAvailableRoomName(baseRoomSlug);

    console.log("createRoom: ", name);
    const newRoom = new Room(io, name);
    if (postgres) {
      const now = new Date();
      const roomObj = {
        roomId: newRoom.roomId,
        lastUpdateTime: now,
        creationTime: now,
        isSubRoom: isSubscriberRoom,
        roomTitle: effectiveRoomTitle,
        roomTitleColor: "#888888",
      };
      try {
        await insertObject(postgres, "room", roomObj);
      } catch (e: any) {
        redisCount("createRoomError");
        console.warn("[createRoom db error]", e?.message ?? e);
      }
    }
    newRoom.creator = decoded?.email;
    const preload = (req.body?.video || "").slice(0, 20000);
    if (preload) {
      redisCount("createRoomPreload");
      newRoom.video = preload;
      newRoom.paused = true;
      await newRoom.saveRoom();
    }
    const prePlaylist = Array.isArray(req.body?.playlist) && req.body?.playlist;
    if (prePlaylist) {
      for (let item of req.body.playlist) {
        newRoom.playlistAdd(null, item);
      }
    }
    rooms.set(name, newRoom);
    res.json({ name });
  } catch (e: any) {
    console.error("[createRoom error]", e?.message ?? e);
    res.status(500).json({ error: "create_room_failed" });
  }
});

app.post("/api/billing/create-checkout-session", async (req, res) => {
  if (!billingEnabled()) {
    res.status(503).json({ error: "billing_not_configured" });
    return;
  }
  const decoded = await validateUserToken(
    String(req.body?.uid),
    String(req.body?.token),
  );
  if (!decoded) {
    res.status(400).json({ error: "invalid_user_token" });
    return;
  }
  if (!decoded.email) {
    res.status(400).json({ error: "email_required" });
    return;
  }
  const planId = String(req.body?.planId ?? "");
  const allowedPlanIds: CheckoutPlanId[] = [
    "premium_monthly",
    "premium_annual",
    "family_monthly",
    "family_annual",
  ];
  if (!planId || !allowedPlanIds.includes(planId as CheckoutPlanId)) {
    res.status(400).json({ error: "plan_required" });
    return;
  }

  try {
    const frontendOrigin = resolveTrustedOrigin(req.headers.origin);
    const session = await createCheckoutSession({
      uid: decoded.uid,
      email: decoded.email,
      planId: planId as CheckoutPlanId,
      frontendUrl: getFrontendUrl(frontendOrigin),
    });
    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (e: any) {
    console.error("[create checkout session error]", e?.message ?? e);
    if (String(e?.message ?? "").startsWith("price_not_configured")) {
      res.status(400).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "checkout_session_failed" });
  }
});

app.get("/api/me/entitlements", async (req, res) => {
  const { uid, token } = getAuthCredentials(req);
  const decoded = await validateUserToken(uid, token);
  if (!decoded) {
    res.status(401).json({ error: "invalid_user_token" });
    return;
  }
  const profile = await resolveBillingProfile(decoded);
  res.json({
    plan: profile.plan,
    subscriptionStatus: profile.subscriptionStatus,
    stripeCustomerId: profile.stripeCustomerId,
    stripeSubscriptionId: profile.stripeSubscriptionId,
    entitlements: profile.entitlements,
    isSubscriber: isSubscriberPlan(profile.plan),
  });
});

app.post("/manageSub", async (req, res) => {
  const decoded = await validateUserToken(
    String(req.body?.uid),
    String(req.body?.token),
  );
  if (!decoded) {
    res.status(400).json({ error: "invalid user token" });
    return;
  }
  if (!decoded.email) {
    res.status(400).json({ error: "no email found" });
    return;
  }
  const customer = await getCustomerByEmail(decoded.email);
  if (!customer) {
    res.status(400).json({ error: "customer not found" });
    return;
  }
  const session = await createSelfServicePortal(
    customer.id,
    resolveTrustedReturnUrl(req.body?.return_url, req.headers.origin),
  );
  res.json(session);
});

app.delete("/deleteAccount", async (req, res) => {
  // TODO pass this in req.query instead
  const decoded = await validateUserToken(req.body?.uid, req.body?.token);
  if (!decoded) {
    res.status(400).json({ error: "invalid user token" });
    return;
  }
  if (postgres) {
    // Delete rooms
    await postgres.query("DELETE FROM room WHERE owner = $1", [decoded.uid]);
    // Delete linked accounts
    await postgres.query("DELETE FROM link_account WHERE uid = $1", [
      decoded.uid,
    ]);
  }
  await deleteUser(decoded.uid);
  redisCount("deleteAccount");
  res.json({});
});

app.get("/metadata", async (req, res) => {
  const { uid, token } = getAuthCredentials(req);
  const decoded = await validateUserToken(uid, token);
  const billingProfile = await resolveBillingProfile(decoded ?? {});
  const isSubscriber = isSubscriberPlan(billingProfile.plan);
  let isFreePoolFull = false;
  try {
    isFreePoolFull = (
      await axios.get(
        "http://localhost:" + config.VMWORKER_PORT + "/isFreePoolFull",
      )
    ).data.isFull;
  } catch (e: any) {
    // Optional vmWorker endpoint; default to "not full" when unavailable.
    isFreePoolFull = false;
  }
  const beta =
    decoded?.email != null &&
    Boolean(config.BETA_USER_EMAILS.split(",").includes(decoded?.email));
  const streamPath = beta ? config.STREAM_PATH : undefined;
  const convertPath = isSubscriber ? config.CONVERT_PATH : undefined;
  // log metrics but don't wait for it
  if (postgres && decoded?.uid) {
    upsertObject(
      postgres,
      "active_user",
      { uid: decoded?.uid, lastActiveTime: new Date() },
      { uid: true },
    );
  }
  res.json({
    isSubscriber,
    plan: billingProfile.plan,
    subscriptionStatus: billingProfile.subscriptionStatus,
    entitlements: billingProfile.entitlements,
    isFreePoolFull,
    beta,
    streamPath,
    convertPath,
  });
});

app.get("/resolveRoom/:vanity", async (req, res) => {
  const vanity = req.params.vanity;
  const result = await postgres?.query(
    `SELECT "roomId", vanity from room WHERE LOWER(vanity) = $1`,
    [vanity?.toLowerCase() ?? ""],
  );
  // console.log(vanity, result.rows);
  // We also use this for checking name availability, so just return null if it doesn't exist (http 200)
  res.json(result?.rows[0] ?? null);
});

app.get("/roomData/:roomId", async (req, res) => {
  // Returns the room data given a room ID
  // Only return data if the room doesn't have a password
  // If it does, we could accept it as a URL parameter but for now just don't support
  const result = await postgres?.query(
    `SELECT data from room WHERE "roomId" = $1 and password IS NULL`,
    ["/" + req.params.roomId],
  );
  res.json(result?.rows[0]?.data);
});

app.get("/resolveShard/:roomId", async (req, res) => {
  const shardNum = resolveShard(req.params.roomId);
  res.send(String(config.SHARD ? shardNum : ""));
});

app.get("/listRooms", async (req, res) => {
  const { uid, token } = getAuthCredentials(req);
  const decoded = await validateUserToken(uid, token);
  if (!decoded) {
    res.status(400).json({ error: "invalid user token" });
    return;
  }
  const result = await postgres?.query<{
    roomId: string;
    vanity: string | null;
    hasPassword: boolean;
  }>(
    `SELECT "roomId", vanity, (password IS NOT NULL) as "hasPassword" from room WHERE owner = $1`,
    [decoded.uid],
  );
  res.json(result?.rows ?? []);
});

app.delete("/deleteRoom", async (req, res) => {
  const { uid, token } = getAuthCredentials(req);
  const decoded = await validateUserToken(uid, token);
  if (!decoded) {
    res.status(400).json({ error: "invalid user token" });
    return;
  }
  const result = await postgres?.query(
    `DELETE from room WHERE owner = $1 and "roomId" = $2`,
    [decoded.uid, req.query.roomId],
  );
  res.json(result?.rows);
});

app.post("/history/movie", async (req, res) => {
  const { uid, token } = getAuthCredentials(req);
  const decoded = await validateUserToken(uid, token);
  if (!decoded?.uid) {
    res.status(401).json({ error: "invalid_user_token" });
    return;
  }
  if (!postgres) {
    res.status(503).json({ error: "history_unavailable" });
    return;
  }
  const payload = req.body as MovieHistoryPayload;
  const movieId = Number(payload?.movieId);
  const title = String(payload?.title ?? "").trim().slice(0, 250);
  if (!Number.isFinite(movieId) || movieId <= 0 || !title) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const watchedAt = payload?.watchedAt
    ? new Date(String(payload.watchedAt))
    : new Date();
  if (Number.isNaN(watchedAt.getTime())) {
    res.status(400).json({ error: "invalid_watched_at" });
    return;
  }
  try {
    await ensureMovieHistoryTable();
    await postgres.query(
      `
      INSERT INTO movie_history
        (uid, movie_id, title, poster_path, backdrop_path, rating, platform, watched_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (uid, movie_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        poster_path = EXCLUDED.poster_path,
        backdrop_path = EXCLUDED.backdrop_path,
        rating = EXCLUDED.rating,
        platform = EXCLUDED.platform,
        watched_at = EXCLUDED.watched_at
      `,
      [
        decoded.uid,
        movieId,
        title,
        payload?.poster_path ? String(payload.poster_path).slice(0, 300) : null,
        payload?.backdrop_path
          ? String(payload.backdrop_path).slice(0, 300)
          : null,
        Number.isFinite(Number(payload?.rating)) ? Number(payload?.rating) : null,
        payload?.platform ? String(payload.platform).slice(0, 120) : null,
        watchedAt.toISOString(),
      ],
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[history movie save error]", e?.message ?? e);
    res.status(500).json({ error: "history_save_failed" });
  }
});

app.get("/history/movies", async (req, res) => {
  const { uid, token } = getAuthCredentials(req);
  const decoded = await validateUserToken(uid, token);
  if (!decoded?.uid) {
    res.status(401).json({ error: "invalid_user_token" });
    return;
  }
  if (!postgres) {
    res.status(503).json({ error: "history_unavailable" });
    return;
  }
  try {
    await ensureMovieHistoryTable();
    const result = await postgres.query<{
      movie_id: number;
      title: string;
      poster_path: string | null;
      backdrop_path: string | null;
      rating: number | null;
      platform: string | null;
      watched_at: Date;
    }>(
      `
      SELECT movie_id, title, poster_path, backdrop_path, rating, platform, watched_at
      FROM movie_history
      WHERE uid = $1
      ORDER BY watched_at DESC
      LIMIT 20
      `,
      [decoded.uid],
    );
    res.json({
      items: result.rows.map((row) => ({
        movieId: Number(row.movie_id),
        title: row.title,
        poster_path: row.poster_path,
        backdrop_path: row.backdrop_path,
        rating: row.rating,
        platform: row.platform,
        watchedAt:
          row.watched_at instanceof Date
            ? row.watched_at.toISOString()
            : new Date(row.watched_at).toISOString(),
      })),
    });
  } catch (e: any) {
    console.error("[history movie list error]", e?.message ?? e);
    res.status(500).json({ error: "history_list_failed" });
  }
});

app.delete("/history/movie/:movieId", async (req, res) => {
  const { uid, token } = getAuthCredentials(req);
  const decoded = await validateUserToken(uid, token);
  if (!decoded?.uid) {
    res.status(401).json({ error: "invalid_user_token" });
    return;
  }
  if (!postgres) {
    res.status(503).json({ error: "history_unavailable" });
    return;
  }
  const movieId = Number(req.params.movieId);
  if (!Number.isFinite(movieId) || movieId <= 0) {
    res.status(400).json({ error: "invalid_movie_id" });
    return;
  }
  try {
    await ensureMovieHistoryTable();
    await postgres.query(
      `DELETE FROM movie_history WHERE uid = $1 AND movie_id = $2`,
      [decoded.uid, movieId],
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[history movie delete error]", e?.message ?? e);
    res.status(500).json({ error: "history_delete_failed" });
  }
});

app.get("/generateName", async (req, res) => {
  res.send(makeUserName());
});

// Proxy video segments
app.get("/proxy/*splat", async (req, res) => {
  redisCount("proxyReqs");
  try {
    const parsed = new URL("http://localhost" + req.url);
    const pathname = parsed.pathname.slice("/proxy".length);
    const host = normalizeProxyHost(parsed.searchParams.get("host"));
    if (!host) {
      res.status(400).json({ error: "invalid proxy host" });
      return;
    }
    if (!pathname.startsWith("/")) {
      res.status(400).json({ error: "invalid proxy path" });
      return;
    }
    if (pathname.endsWith("index-dvr.m3u8")) {
      // VOD
      // https://d2vjef5jvl6bfs.cloudfront.net/3012391a6c3e84c79ef6_gamesdonequick_41198403369_1681059003/chunked/index-dvr.m3u8
      const resp = await axios.get("https://" + host + pathname, {
        timeout: 10000,
      });
      const re2 = /(.*.ts)/g;
      let repl = resp.data.replaceAll(re2, `$1?host=${host}`);
      // Mark this as a VOD
      repl += "#EXT-X-ENDLIST";
      res.send(repl);
    } else if (pathname.endsWith(".m3u8")) {
      // Stream
      // https://video-weaver.sea02.hls.ttvnw.net/v1/playlist/CrQEgv7Mz6nnsfJH3XtVQxeYXk8mViy1zNGWglcybvxZsI1rv3iLnjAnnqwCiVXCJ-DdD27J6RuFrLy7YUYwHUCKazIKICIupUCn9UXtaBYhBM5JIYqg9dz6NWYrCWU9HZJj2TGROv9mAOKuTR51YS82hdYL4PFZa3xxWXhgDsxXQHNDB03kY6S0aG0-EVva1xYrn5Ge6IAXRwug9QDGlb-ydtF3BtYppoTklVI7CVLySPPwbbt5Ow1JXdnKhLSwQEs4bh3BLwMnRBwUFI5nmE18BLYbkMOUivgYP5SSMgnGGlSkJO-iJNPWvepunEgyBUzB_7L-b1keTcV-Qak9IcWIITIWbRvmg6qB3ZSuWdcJgWKmdXdIn4qoRM4o16G1_0N_WRqPtMQFo0hmTlAVmHrzRArJQmaSgqAxZxRbFMd9RFeX6qjP9NtwguPbSeStdVbQxMNC34iavYUIxo8Ug812BHsG7J_kIlof2zkIqkEbP3oV3UkSByIo7xh9EEVargjaGDuQRt8zPQ6-fNBWJJe9F6IFu7lXBPIJ016lopyfcvTWjbLbBHsVkg6vG-3UISh0nud7KB5g5ipQePhtcFSI5hvjlfX1DAVHEpTWXkvlnL4wNqEqpBYL2btSXYeE1Cb-RAvrAT0s61usERcL2eI-S5aTcSO8_hxQ2afC7c9vlypOWgP6p6XNpViZHXmdXv4t-d68Z-MpLtSU7VbB3pRWnSswFFyA3W39ITic4lb97Djp3wHhGgz0Sy8aDb9r0tnphIYgASoJdXMtZWFzdC0yMKQG.m3u8
      // Extract the edge URL host and add it to URL so proxy can fetch
      const resp = await axios.get("https://" + host + pathname, {
        timeout: 10000,
      });
      // const re = /https:\/\/(.*)\/v1\/segment\/(.*)/g;
      // const match = re.exec(resp.data);
      // const edgehost = match?.[1];
      // const repl = resp.data.replaceAll(
      //   re,
      //   `/proxy/v1/segment/$2?host=${edgehost}`,
      // );
      const repl = resp.data;
      res.send(repl);
    } else if (pathname.endsWith(".ts")) {
      // Segment
      const resp = await axios.get("https://" + host + pathname, {
        responseType: "arraybuffer",
        timeout: 10000,
      });
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Content-Length": resp.data.length,
        "Transfer-Encoding": "chunked",
      });
      res.write(resp.data);
      res.end();
    } else {
      res.status(404);
      res.end();
    }
  } catch (e) {
    console.log("proxy failed: %s", req.url);
    res.status(502).json({ error: "proxy_failed" });
  }
});

app.use(express.static(config.BUILD_DIRECTORY));
// Send index.html for all other requests (SPA)
app.use("/*splat", (_req, res) => {
  res.sendFile(
    path.resolve(
      import.meta.dirname + `/../${config.BUILD_DIRECTORY}/index.html`,
    ),
  );
});

async function saveRooms() {
  // Unload rooms that are empty and idle
  // Frees up some JS memory space when process is long-running
  // On reconnect, we'll attempt to reload the room
  let saveCount = 0;
  let skipCount = 0;
  const start = Date.now();
  await Promise.all(
    Array.from(rooms.entries()).map(async ([key, room]) => {
      if (
        room.roster.length === 0 &&
        !room.vBrowser &&
        Number(room.lastUpdateTime) < Date.now() - 8 * 60 * 60 * 1000
      ) {
        console.log(
          "freeing room %s from memory on shard %s",
          key,
          config.SHARD,
        );
        await room.saveRoom();
        room.destroy();
        rooms.delete(key);
        saveCount += 1;
        // Unregister the namespace to avoid dupes on reload
        io._nsps.delete(key);
      } else if (room.roster.length) {
        room.lastUpdateTime = new Date();
        await room.saveRoom();
        saveCount += 1;
      } else {
        skipCount += 1;
      }
    }),
  );
  const end = Date.now();
  console.log(
    "[SAVEROOMS] %s saved in %sms, %s skipped",
    saveCount,
    end - start,
    skipCount,
  );
}

async function release() {
  // Reset VMs in rooms that are:
  // older than the session limit
  // assigned to a room with no users
  const roomArr = Array.from(rooms.values());
  console.log("[RELEASE] %s rooms in batch", roomArr.length);
  for (let room of roomArr) {
    if (room.vBrowser && room.vBrowser.assignTime) {
      const maxTime = getSessionLimitSeconds(room.vBrowser.large) * 1000;
      const elapsed = Date.now() - room.vBrowser.assignTime;
      const ttl = maxTime - elapsed;
      const isTimedOut = ttl && ttl < releaseInterval;
      const isAlmostTimedOut = ttl && ttl < releaseInterval * 2;
      const isRoomEmpty = room.roster.length === 0;
      const isRoomIdle =
        Date.now() - Number(room.lastUpdateTime) > 5 * 60 * 1000;
      if (isTimedOut || (isRoomEmpty && isRoomIdle)) {
        console.log("[RELEASE] VM in room:", room.roomId);
        room.stopVBrowserInternal();
        if (isTimedOut) {
          redisCount("vBrowserTerminateTimeout");
        } else if (isRoomEmpty) {
          redisCount("vBrowserTerminateEmpty");
        }
      }
    }
    // We want to spread out the jobs over about half the release interval
    // This gives other jobs some CPU time
    const waitTime = releaseInterval / 2 / roomArr.length;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}

async function minuteMetrics() {
  const roomArr = Array.from(rooms.values());
  let vbWaiting = 0;
  for (let room of roomArr) {
    if (room.vBrowser && room.vBrowser.id) {
      // Update the heartbeat
      await postgres?.query(
        `UPDATE vbrowser SET "heartbeatTime" = NOW() WHERE "roomId" = $1 and vmid = $2`,
        [room.roomId, room.vBrowser.id],
      );

      const expireTime = getStartOfDay() / 1000 + 86400;
      if (room.vBrowser?.creatorClientID) {
        await redis?.zincrby(
          "vBrowserClientIDMinutes",
          1,
          room.vBrowser.creatorClientID,
        );
        await redis?.expireat("vBrowserClientIDMinutes", expireTime);
      }
      if (room.vBrowser?.creatorUID) {
        await redis?.zincrby(
          "vBrowserUIDMinutes",
          1,
          room.vBrowser?.creatorUID,
        );
        await redis?.expireat("vBrowserUIDMinutes", expireTime);
      }
    }
    const users = room.roster.length;
    if (users) {
      await redis?.setex(`roomCounts:${room.roomId}`, 120, users);
      await redis?.setex(
        `roomRosters:${room.roomId}`,
        120,
        JSON.stringify(room.getRosterForStats()),
      );
    }
    vbWaiting += room.vBrowserQueue ? 1 : 0;
  }
  // Report shard metrics
  const obj: ShardMetric = {
    uptime: process.uptime(),
    mem: process.memoryUsage().rss,
    roomCount: rooms.size,
    users: io.engine.clientsCount,
    vbWaiting,
  };
  await redis?.setex(
    `shardMetrics:${config.SHARD ?? 0}`,
    120,
    JSON.stringify(obj),
  );
}
