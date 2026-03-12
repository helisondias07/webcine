import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = Number(process.env.CORS_TEST_PORT || 18080);
const HOST = "127.0.0.1";
const baseUrl = `http://${HOST}:${PORT}`;
const allowedOrigins =
  process.env.CORS_TEST_ALLOWED_ORIGINS ||
  "https://webcinetv.app,https://www.webcinetv.app";
const [allowedOrigin] = allowedOrigins.split(",").map((x) => x.trim());
const blockedOrigin = "https://attacker.example";

const server = spawn("node", ["server/server.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOST,
    CORS_ALLOWED_ORIGINS: allowedOrigins,
    FIREBASE_ADMIN_SDK_CONFIG: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
server.stdout.on("data", (chunk) => {
  logs += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  logs += chunk.toString();
});

async function waitForServer(timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/ping`);
      if (res.ok) {
        return;
      }
    } catch {
      // keep retrying
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not become ready in time.");
}

async function requestPing(origin) {
  const headers = origin ? { Origin: origin } : {};
  const res = await fetch(`${baseUrl}/ping`, { headers });
  return {
    status: res.status,
    allowOrigin: res.headers.get("access-control-allow-origin"),
  };
}

try {
  await waitForServer();

  const allowed = await requestPing(allowedOrigin);
  assert.equal(allowed.status, 200, "Allowed origin should receive HTTP 200");
  assert.equal(
    allowed.allowOrigin,
    allowedOrigin,
    "Allowed origin should receive Access-Control-Allow-Origin",
  );

  const blocked = await requestPing(blockedOrigin);
  assert.equal(blocked.status, 200, "Blocked origin should still receive HTTP 200");
  assert.equal(
    blocked.allowOrigin,
    null,
    "Blocked origin must not receive Access-Control-Allow-Origin",
  );

  const sameOriginOrServer = await requestPing(undefined);
  assert.equal(
    sameOriginOrServer.allowOrigin,
    null,
    "Requests without Origin header must not receive Access-Control-Allow-Origin",
  );

  console.log("CORS check passed.");
} catch (error) {
  console.error("CORS check failed.");
  console.error(error);
  if (logs.trim()) {
    console.error("\n--- Server Logs ---\n" + logs);
  }
  process.exitCode = 1;
} finally {
  if (!server.killed) {
    server.kill("SIGTERM");
  }
}
