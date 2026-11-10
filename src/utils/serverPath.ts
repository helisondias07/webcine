import config from "../config";

function defaultServerPath() {
  if (typeof window === "undefined") {
    return "";
  }
  return `${window.location.protocol}//${
    config.NODE_ENV === "development"
      ? `${window.location.hostname}:8080`
      : window.location.host
  }`;
}

export const serverPath = config.VITE_SERVER_HOST || defaultServerPath();
