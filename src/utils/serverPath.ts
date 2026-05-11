import config from "../config";

export const serverPath =
  config.VITE_SERVER_HOST ||
  `${window.location.protocol}//${
    config.NODE_ENV === "development"
      ? `${window.location.hostname}:8080`
      : window.location.host
  }`;
