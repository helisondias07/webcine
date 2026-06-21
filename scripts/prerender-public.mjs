import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const buildDir = path.resolve("build");
const routes = ["/", "/terms", "/privacy", "/faq"];
const chromiumExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && fsSyncExists(candidate));

function fsSyncExists(candidate) {
  return existsSync(candidate);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function isInsideBuild(filePath) {
  const relative = path.relative(buildDir, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveAsset(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0] || "/");
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = path.resolve(buildDir, `.${cleanPath}`);
  if (!isInsideBuild(candidate)) {
    return path.join(buildDir, "index.html");
  }
  try {
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) {
      return path.join(candidate, "index.html");
    }
    return candidate;
  } catch {
    return path.join(buildDir, "index.html");
  }
}

async function serveBuild(req, res) {
  try {
    const filePath = await resolveAsset(req.url || "/");
    const ext = path.extname(filePath);
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes.get(ext) || "application/octet-stream",
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(String(error?.message || error));
  }
}

async function writeSnapshot(route, html) {
  const outputPath =
    route === "/"
      ? path.join(buildDir, "index.html")
      : path.join(buildDir, route.slice(1), "index.html");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html);
}

const server = http.createServer((req, res) => {
  void serveBuild(req, res);
});

await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Could not start prerender server");
}

const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath: chromiumExecutable || undefined,
});

try {
  for (const route of routes) {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.waitForSelector("#root");
    await page.waitForTimeout(100);
    const html = await page.content();
    await writeSnapshot(route, html);
    await page.close();
    console.log(`[prerender] ${route}`);
  }
} finally {
  await browser.close();
  server.close();
}
