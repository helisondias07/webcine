const firebaseFromSplitVars = (() => {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    return "";
  }
  return JSON.stringify({
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
})();

const sanitizedServerHost = (() => {
  const raw = String(import.meta.env.VITE_SERVER_HOST ?? "").trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    const hostname = parsed.hostname.toLowerCase();
    const isLoopback =
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    // Prevent production builds from accidentally calling localhost on user devices.
    if (!import.meta.env.DEV && isLoopback) {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
})();

export default {
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME ?? "WebCineTV",
  VITE_SERVER_HOST: sanitizedServerHost,
  VITE_OAUTH_REDIRECT_HOSTNAME:
    import.meta.env.VITE_OAUTH_REDIRECT_HOSTNAME ?? window.location.origin,
  VITE_FIREBASE_CONFIG:
    import.meta.env.VITE_FIREBASE_CONFIG ||
    firebaseFromSplitVars,
  VITE_STRIPE_PUBLIC_KEY:
    import.meta.env.VITE_STRIPE_PUBLIC_KEY ?? "",
  VITE_GA_MEASUREMENT_IDS:
    import.meta.env.VITE_GA_MEASUREMENT_IDS ?? "",
  VITE_TURN_URLS:
    import.meta.env.VITE_TURN_URLS ?? "",
  VITE_TURN_USERNAME:
    import.meta.env.VITE_TURN_USERNAME ?? "",
  VITE_TURN_CREDENTIAL:
    import.meta.env.VITE_TURN_CREDENTIAL ?? "",
  VITE_ENABLE_WEBTORRENT:
    (import.meta.env.VITE_ENABLE_WEBTORRENT ??
      (import.meta.env.DEV ? "true" : "false")) === "true",
  VITE_FIREBASE_SIGNIN_METHODS:
    import.meta.env.VITE_FIREBASE_SIGNIN_METHODS ?? "google,email",
  NODE_ENV: import.meta.env.DEV ? "development" : "production",
};
