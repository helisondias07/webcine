import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "mobile-320",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 720 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: "node server/server.ts",
      url: "http://127.0.0.1:8080/ping",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "8080",
        SSL_KEY_FILE: "",
        SSL_CRT_FILE: "",
        FIREBASE_ADMIN_SDK_CONFIG: "",
        CORS_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      },
    },
    {
      command: "npm run ui -- --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        ...process.env,
        VITE_SERVER_HOST: "http://127.0.0.1:8080",
      },
    },
  ],
});
