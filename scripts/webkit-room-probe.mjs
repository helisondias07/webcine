#!/usr/bin/env node
/**
 * Isolated WebKit probe: distinguish Playwright/Linux WebKit crash from app logic.
 * Not a CI gate. Writes JSON to docs/performance when given an output path.
 */
import { webkit } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
const result = {
  measuredAt: new Date().toISOString(),
  browser: "webkit",
  viewport: { width: 810, height: 1080 },
  steps: [],
  crash: null,
  pageerror: [],
  conclusion: "",
};

async function main() {
  let browser;
  try {
    browser = await webkit.launch();
    result.steps.push({ ok: true, step: "launch" });
  } catch (e) {
    result.crash = String(e?.message || e);
    result.conclusion =
      "WebKit executable/launch failed in this environment (missing browser or OS libs), not an app runtime crash.";
    write();
    process.exit(0);
  }
  const context = await browser.newContext({
    viewport: { width: 810, height: 1080 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on("crash", () => {
    result.crash = "page.crash";
  });
  page.on("pageerror", (err) => {
    result.pageerror.push(String(err));
  });
  try {
    await page.goto("http://127.0.0.1:5174/", { waitUntil: "domcontentloaded", timeout: 20000 });
    result.steps.push({ ok: true, step: "home" });
    await page.getByRole("button", { name: "Nova sala" }).first().click();
    result.steps.push({ ok: true, step: "clicked nova sala" });
    await page.waitForURL(/\/watch\//, { timeout: 15000 });
    result.steps.push({ ok: true, step: "reached /watch/" });
    await page.getByPlaceholder("Seu nome").fill("WebKit Probe");
    result.steps.push({ ok: true, step: "filled name" });
    await page.locator("#watchPlayerShell").waitFor({ timeout: 10000 });
    result.steps.push({ ok: true, step: "player shell visible" });
    result.conclusion =
      "No crash in this run. Previous tablet-webkit failures should be re-checked; do not assume the app is fixed on real iPad Safari.";
  } catch (e) {
    result.crash = result.crash || String(e?.message || e);
    result.conclusion =
      "Failed during room entry. If the error is page crash / Target crashed, treat as Playwright WebKit-on-Linux (GPU/gstreamer) unless the same path fails in Chromium.";
    result.steps.push({ ok: false, step: "exception", detail: String(e?.message || e).slice(0, 500) });
  }
  await browser.close().catch(() => {});
  write();
}

function write() {
  const json = JSON.stringify(result, null, 2);
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, json);
  }
  process.stdout.write(json + "\n");
}

await main();
