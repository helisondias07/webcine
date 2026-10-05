import { loadEnvFile } from "node:process";
import fs from "node:fs";
import path from "node:path";

if (fs.existsSync(".env")) {
  loadEnvFile();
}

// Stamps a unique build id into the copied service worker so each deploy
// ships a byte-different /sw.min.js; browsers then install the new worker
// (skipWaiting + clients.claim) and drop the previous shell cache.
function serviceWorkerBuildId() {
  let outDir = "build";
  return {
    name: "webcine-sw-build-id",
    apply: "build" as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(outDir, "sw.min.js");
      if (!fs.existsSync(swPath)) {
        return;
      }
      const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const source = fs.readFileSync(swPath, "utf8");
      fs.writeFileSync(
        swPath,
        source.replace(/__WEBCINE_BUILD_ID__/g, buildId),
      );
    },
  };
}

export default {
  plugins: [serviceWorkerBuildId()],
  build: {
    outDir: "build",
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router-dom/")
          ) {
            return "react-vendor";
          }
          if (id.includes("/@mantine/") || id.includes("/@tabler/")) {
            return "ui-vendor";
          }
          if (
            id.includes("/socket.io-client/") ||
            id.includes("/socket.io-parser/")
          ) {
            return "socket-vendor";
          }
          if (id.includes("/hls.js/")) {
            return "hls-vendor";
          }
          if (id.includes("/dashjs/")) {
            return "dash-vendor";
          }
          if (id.includes("/mediasoup-client/")) {
            return "mediasoup-vendor";
          }
          return undefined;
        },
      },
    },
    // sourcemap: true,
  },
  server: {
    https:
      process.env.SSL_CRT_FILE && process.env.SSL_KEY_FILE
        ? {
            key: fs.readFileSync(process.env.SSL_KEY_FILE),
            cert: fs.readFileSync(process.env.SSL_CRT_FILE),
          }
        : null,
    allowedHosts: true,
  },
};
