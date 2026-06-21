import fs from "node:fs";
import { loadEnvFile } from "node:process";

try {
  if (fs.existsSync(".env")) {
    loadEnvFile();
  }
} catch (e) {
  console.error("Failed to load .env file:", e);
}

const defaults = {
  REDIS_URL: "", // Optional, for metrics
  DATABASE_URL: "", // Optional, for permanent rooms and VBrowser management
  PG_SSL_REJECT_UNAUTHORIZED: "true", // Set to false only for local/self-signed Postgres during development
  YOUTUBE_API_KEY: "", // Optional, provide one to enable searching YouTube
  TMDB_READ_TOKEN: "", // Optional, provide one to enable surprise movie recommendations
  TMDB_API_KEY: "", // Optional fallback for TMDB requests when read token is not configured
  WATCHMODE_API_KEY: "", // Optional, provide one to resolve direct streaming links
  WATCHMODE_BASE_URL: "https://api.watchmode.com", // Optional base URL override for Watchmode API
  NODE_ENV: "", // Usually, you should let process.env.NODE_ENV override this
  FRONTEND_URL: "", // Optional canonical frontend URL
  VBROWSER_SESSION_SECONDS: 10800, // Number of seconds to allow vbrowsers to run for
  VBROWSER_SESSION_SECONDS_LARGE: 86400, // Number of seconds to allow large vbrowsers to run for
  VM_POOL_RAMP_DOWN_HOURS: "", // Comma separated start/end UTC hours of the ramp down period
  VM_POOL_RAMP_UP_HOURS: "", // Comma separated start/end UTC hours of the ramp up period
  VBROWSER_TAG: "", // Optional, tag to put on VBrowser VM instances
  DO_TOKEN: "", // Optional, for DigitalOcean VMs
  DO_GATEWAY: "", // Gateway handling SSL termination
  DO_IMAGE: "", // ID of DigitalOcean snapshot image to use for vbrowser
  DO_SSH_KEYS: "", // IDs of DigitalOcean SSH keys to access vbrowsers
  HETZNER_TOKEN: "", // Optional, for Hetzner VMs
  HETZNER_GATEWAY: "", // Gateway handling SSL termination
  HETZNER_SSH_KEYS: "", // IDs of Hetzner SSH keys to access vbrowsers
  HETZNER_IMAGE: "", // ID of Hetzner snapshot image to use for vbrowser
  VM_MANAGER_CONFIG: "", // Comma-separated list of the pools of VMs to run (provider:size:region:minSize:limitSize:hostname), e.g. Docker:large:US:0:1:localhost,Docker:standard:US:0:1:localhost
  SCW_SECRET_KEY: "", // Optional, for Scaleway VMs
  SCW_ORGANIZATION_ID: "", // Optional, for Scaleway VMs
  SCW_GATEWAY: "", // Gateway handling SSL termination
  SCW_IMAGE: "", // ID of Scaleway snapshot image to use for vbrowser
  DOCKER_VM_HOST: "localhost", // Optional, for Docker VMs
  DOCKER_VM_HOST_SSH_USER: "root", // Optional, username for Docker host
  DOCKER_VM_HOST_SSH_KEY_BASE64: "", // Optional, private SSH key for Docker host, or default to ~/.ssh/id_rsa content
  SSL_KEY_FILE: "", // Optional, Filename of SSL key (to use https)
  SSL_CRT_FILE: "", // Optional, Filename of SSL cert (to use https)
  PORT: 8080, // Port to use for server
  HOST: "0.0.0.0", // Host interface to bind server to
  CORS_ALLOWED_ORIGINS: "", // Optional, comma-delimited list of allowed CORS origins
  RATE_LIMIT_WINDOW_MS: 60000, // Window size for API rate-limiting
  RATE_LIMIT_MAX: 240, // Max requests per window per IP
  STATS_KEY: "", // Secret string to validate viewing stats
  BETA_USER_EMAILS: "", // Comma-delimited list of user emails to include in the beta
  CUSTOM_SETTINGS_HOSTNAME: "", // Hostname to send different config settings to client
  STREAM_PATH: "", // Path of server that supports additional video streams
  CONVERT_PATH: "", // Path of server that supports video conversion
  ROOM_CAPACITY: 0, // Maximum capacity of a standard room. Set to 0 for unlimited.
  ROOM_CAPACITY_SUB: 0, // Deprecated compatibility setting.
  BUILD_DIRECTORY: "build", // Name of the directory where the built React UI is served from
  VM_MIN_UPTIME_MINUTES: 0, // Number of minutes of the hour VMs must exist for before being eligible for termination
  SHARD: undefined, // Shard ID of the web server (configure in ecosystem.config.js)
  VMWORKER_PORT: 3100, // Port to use for the vmWorker HTTP server
  VM_ASSIGNMENT_TIMEOUT: 75, // Number of seconds to wait for a VM before failing
  MEDIASOUP_SERVER: "", // Optional, URL of the MediaSoup server to broadcast to for larger screen/file shares
  TWITCH_PROXY_PATH: "", // Optional, URL of the server that can proxy twitch HLS stream playlists and segments
  VBROWSER_ADMIN_KEY: "", // Optional, the key to hit admin endpoints on the vbrowser
  VBROWSER_DISABLED: "false", // Set to "true" to temporarily disable the virtual browser feature
  VBROWSER_BASE_HOST: "", // Optional, fixed host for a single shared vbrowser (e.g. localhost:5100 or gateway.example.com/?ip=10.0.0.5)
  VBROWSER_BASE_PASS: "", // Optional, password for VBROWSER_BASE_HOST
};

export default {
  ...defaults,
  ...process.env,
};
