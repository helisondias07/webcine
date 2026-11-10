#!/usr/bin/env node
/**
 * First-navigation transfer against a local gzip static server of build/.
 * Isolated: no production, no analytics. Chromium only.
 * Usage: node scripts/measure-first-nav.mjs [buildDir] [outJson]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "@playwright/test";

const buildDir = path.resolve(process.argv[2] || "build");
const outJson = process.argv[3]
  ? path.resolve(process.argv[3])
  : null;
const repeats = Number(process.env.MEASURE_REPEATS || 3);
const routes = (process.env.MEASURE_ROUTES || "/,/watch/measure-room").split(
  ",",
);

const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".webmanifest", "application/manifest+json"],
  [".woff2", "font/woff2"],
]);

function resolveFile(urlPath) {
  const clean = decodeURIComponent((urlPath || "/").split("?")[0]);
  const rel = clean === "/" ? "/index.html" : clean;
  const candidate = path.resolve(buildDir, `.${rel}`);
  const inside = path.relative(buildDir, candidate);
  if (!inside || inside.startsWith("..")) {
    return path.join(buildDir, "index.html");
  }
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  return path.join(buildDir, "index.html");
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = resolveFile(req.url || "/");
      const body = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const headers = {
        "Content-Type": types.get(ext) || "application/octet-stream",
        "Cache-Control": "no-store",
      };
      const accept = String(req.headers["accept-encoding"] || "");
      if (accept.includes("gzip") && /\.(js|css|html|svg|json|webmanifest)$/.test(ext)) {
        const gz = zlib.gzipSync(body, { level: 6 });
        headers["Content-Encoding"] = "gzip";
        headers["Content-Length"] = String(gz.length);
        res.writeHead(200, headers);
        res.end(gz);
        return;
      }
      headers["Content-Length"] = String(body.length);
      res.writeHead(200, headers);
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function measureRoute(browser, origin, route) {
  const page = await browser.newPage();
  const byUrl = new Map();
  page.on("response", async (response) => {
    try {
      const url = response.url();
      if (!url.startsWith(origin)) {
        return;
      }
      const buf = await response.body();
      const headers = response.headers();
      byUrl.set(url, {
        url: url.replace(origin, ""),
        status: response.status(),
        encoded: Number(headers["content-length"] || buf.length),
        uncompressed: buf.length,
        encoding: headers["content-encoding"] || "",
        mime: headers["content-type"] || "",
      });
    } catch {
      // Navigation can cancel in-flight bodies.
    }
  });
  await page.goto(origin + route, { waitUntil: "networkidle", timeout: 30000 });
  // Room route lazy-loads WatchApp; wait a beat for the extra chunks.
  if (route.startsWith("/watch")) {
    await page.waitForTimeout(1500);
  }
  const resources = [...byUrl.values()];
  const js = resources.filter((r) => r.mime.includes("javascript"));
  const css = resources.filter((r) => r.mime.includes("css"));
  const sum = (list, key) => list.reduce((n, x) => n + x[key], 0);
  await page.close();
  return {
    route,
    resourceCount: resources.length,
    transferEncodedBytes: sum(resources, "encoded"),
    transferUncompressedBytes: sum(resources, "uncompressed"),
    jsEncodedBytes: sum(js, "encoded"),
    jsUncompressedBytes: sum(js, "uncompressed"),
    cssEncodedBytes: sum(css, "encoded"),
    cssUncompressedBytes: sum(css, "uncompressed"),
    resources: resources.sort((a, b) => b.encoded - a.encoded),
  };
}

const { server, port } = await startServer();
const origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});

const runs = [];
try {
  for (const route of routes) {
    const samples = [];
    for (let i = 0; i < repeats; i++) {
      samples.push(await measureRoute(browser, origin, route));
    }
    const last = samples[samples.length - 1];
    runs.push({
      route,
      repeats,
      medianTransferEncodedBytes: median(
        samples.map((s) => s.transferEncodedBytes),
      ),
      medianJsEncodedBytes: median(samples.map((s) => s.jsEncodedBytes)),
      medianCssEncodedBytes: median(samples.map((s) => s.cssEncodedBytes)),
      samples: samples.map((s) => ({
        transferEncodedBytes: s.transferEncodedBytes,
        jsEncodedBytes: s.jsEncodedBytes,
        cssEncodedBytes: s.cssEncodedBytes,
        resourceCount: s.resourceCount,
      })),
      lastResources: last.resources.slice(0, 20),
    });
  }
} finally {
  await browser.close();
  server.close();
}

const report = {
  measuredAt: new Date().toISOString(),
  git: process.env.MEASURE_GIT_SHA || "",
  label: process.env.MEASURE_LABEL || "",
  environment: {
    node: process.version,
    platform: process.platform,
    gzipLevel: 6,
    waitUntil: "networkidle",
    notes:
      "Local static gzip of build/. Room route has no Socket.IO backend here, so this is asset transfer only, not a full session. External CDNs (if any) are ignored. Not Core Web Vitals of real users.",
  },
  runs,
};

const json = JSON.stringify(report, null, 2);
if (outJson) {
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, json);
}
process.stdout.write(json + "\n");
