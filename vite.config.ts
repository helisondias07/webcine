import { loadEnvFile } from "node:process";
import fs from "node:fs";

if (fs.existsSync(".env")) {
  loadEnvFile();
}

export default {
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
