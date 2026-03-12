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

app.post("/createRoom", async (req, res) => {
  try {
    const decoded = await validateUserToken(req.body?.uid, req.body?.token);
    const billingProfile = await resolveBillingProfile(decoded ?? {});
    const isSubscriberRoom = isSubscriberPlan(billingProfile.plan);

    const requestedSlug = normalizeSlug(req.body?.roomSlug);
    const displayName = normalizeDisplayName(req.body?.username);
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
    console.warn("[WARNING]: free pool check failed: %s", e.code);
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
