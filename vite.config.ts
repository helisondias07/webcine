import { loadEnvFile } from "node:process";
import fs from "node:fs";

try {
  loadEnvFile();
} catch (e) {
  console.log(e);
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
          if (
            id.includes("/firebase/") ||
            id.includes("/@firebase/") ||
            id.includes("/@stripe/stripe-js/")
          ) {
            return "auth-billing-vendor";
          }
          if (
            id.includes("/hls.js/") ||
            id.includes("/dashjs/") ||
            id.includes("/mediasoup-client/")
          ) {
            return "media-vendor";
          }
          if (id.includes("/emoji-mart/")) {
            return "emoji-vendor";
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
