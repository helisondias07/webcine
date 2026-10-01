import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const localChromiumExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
        launchOptions: { executablePath: localChromiumExecutable },
      },
    },
    {
      name: "mobile-320",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 720 },
        launchOptions: { executablePath: localChromiumExecutable },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        launchOptions: { executablePath: localChromiumExecutable },
      },
    },
    {
      name: "tablet-webkit",
      use: {
        browserName: "webkit",
        viewport: { width: 810, height: 1080 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "node server/server.ts",
      url: "http://127.0.0.1:8091/ping",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "8091",
        SSL_KEY_FILE: "",
        SSL_CRT_FILE: "",
        FIREBASE_ADMIN_SDK_CONFIG: "",
        CORS_ALLOWED_ORIGINS: "http://127.0.0.1:5174",
      },
    },
    {
      command: "npm run ui -- --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        VITE_SERVER_HOST: "http://127.0.0.1:8091",
      },
    },
  ],
});
