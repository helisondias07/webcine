#!/usr/bin/env node
/**
 * Measure production build asset sizes (raw + gzip).
 * "initial" includes <script> and <link rel="modulepreload|stylesheet">
 * from index.html (first navigation), not merely the entry script.
 * Usage: node scripts/measure-bundle.mjs [buildDir] [outJson]
 */
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const buildDir = path.resolve(process.argv[2] || "build");
const outJson = process.argv[3] ? path.resolve(process.argv[3]) : null;

function gzipSize(buf) {
  return gzipSync(buf, { level: 9 }).length;
}

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

const htmlPath = path.join(buildDir, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const htmlBuf = fs.readFileSync(htmlPath);

const hrefs = [
  ...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/gi),
].map((m) => m[1]);

function isListed(url, filePath) {
  const base = path.basename(filePath);
  return hrefs.some(
    (h) =>
      h === url ||
      h.endsWith("/" + base) ||
      h.endsWith(base) ||
      h === "./" + url.replace(/^\//, ""),
  );
}

const files = walk(path.join(buildDir, "assets")).filter((f) =>
  /\.(js|css)$/.test(f),
);

const assets = files.map((full) => {
  const buf = fs.readFileSync(full);
  const rel = path.relative(buildDir, full).replaceAll("\\", "/");
  const url = "/" + rel;
  const kind = rel.endsWith(".css") ? "css" : "js";
  const initial = isListed(url, full);
  return {
    file: rel,
    kind,
    bytes: buf.length,
    gzipBytes: gzipSize(buf),
    initial,
  };
});

assets.sort((a, b) => b.bytes - a.bytes);

const sum = (list, key) => list.reduce((n, x) => n + x[key], 0);
const initialAssets = assets.filter((a) => a.initial);
const lazyJs = assets.filter((a) => a.kind === "js" && !a.initial);
const over500 = assets.filter((a) => a.bytes > 500 * 1024);

const report = {
  measuredAt: new Date().toISOString(),
  buildDir,
  git: process.env.MEASURE_GIT_SHA || "",
  label: process.env.MEASURE_LABEL || "",
  note: "gzip is zlib level 9 of the file on disk, not a CDN encoding. initial = referenced from index.html (script, stylesheet, modulepreload).",
  initialHtmlBytes: htmlBuf.length,
  initialHtmlGzipBytes: gzipSize(htmlBuf),
  hrefs,
  assets,
  chunksOver500kB: over500.map((a) => ({
    file: a.file,
    bytes: a.bytes,
    gzipBytes: a.gzipBytes,
    initial: a.initial,
  })),
  totals: {
    allJsBytes: sum(
      assets.filter((a) => a.kind === "js"),
      "bytes",
    ),
    allJsGzipBytes: sum(
      assets.filter((a) => a.kind === "js"),
      "gzipBytes",
    ),
    initialJsBytes: sum(
      initialAssets.filter((a) => a.kind === "js"),
      "bytes",
    ),
    initialJsGzipBytes: sum(
      initialAssets.filter((a) => a.kind === "js"),
      "gzipBytes",
    ),
    initialCssBytes: sum(
      initialAssets.filter((a) => a.kind === "css"),
      "bytes",
    ),
    initialCssGzipBytes: sum(
      initialAssets.filter((a) => a.kind === "css"),
      "gzipBytes",
    ),
    lazyJsBytes: sum(lazyJs, "bytes"),
    lazyJsGzipBytes: sum(lazyJs, "gzipBytes"),
    firstNavJsCssHtmlBytes:
      htmlBuf.length +
      sum(initialAssets, "bytes"),
    firstNavJsCssHtmlGzipBytes:
      gzipSize(htmlBuf) + sum(initialAssets, "gzipBytes"),
  },
};

const json = JSON.stringify(report, null, 2);
if (outJson) {
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, json);
  const csvPath = outJson.replace(/\.json$/i, ".csv");
  const csv = [
    "file,kind,initial,bytes,gzipBytes",
    ...assets.map(
      (a) => `${a.file},${a.kind},${a.initial},${a.bytes},${a.gzipBytes}`,
    ),
  ].join("\n");
  fs.writeFileSync(csvPath, csv + "\n");
}
process.stdout.write(json + "\n");
