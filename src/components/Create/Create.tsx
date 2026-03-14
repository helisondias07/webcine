import React, { useContext, useEffect, useRef } from "react";
import { createRoom } from "../TopBar/TopBar";
import { Loader } from "@mantine/core";
import { MetadataContext } from "../../MetadataContext";
import { t } from "../../i18n";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 70);
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export const Create = () => {
  const { user } = useContext(MetadataContext);
  const buttonEl = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      buttonEl?.current?.click();
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: "100vw",
        height: "100vh",
      }}
    >
      <Loader></Loader>
      <div>{t("createRoomLoading")}</div>
      <button
        style={{ display: "none" }}
        ref={buttonEl}
        onClick={() => {
          const username = normalizeDisplayName(
            window.localStorage.getItem("watchparty-username") ?? "",
          );
          const fallbackName = username || "Convidado";
          createRoom(
            user,
            false,
            {
              video:
                new URLSearchParams(window.location.search).get("video") ??
                undefined,
              roomTitle:
                new URLSearchParams(window.location.search).get("roomTitle") ??
                undefined,
              username: fallbackName,
              roomSlug: username
                ? `cinema-${slugify(username) || "sala"}`
                : "cinema-sala",
            },
          );
        }}
      />
    </div>
  );
};
