import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoom } from "../TopBar/TopBar";
import { Loader } from "@mantine/core";
import { t } from "../../i18n";
import styles from "./Create.module.css";

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
  const [errorMessage, setErrorMessage] = useState("");
  const startedRef = useRef(false);

  const startCreate = useCallback(async () => {
    const username = normalizeDisplayName(
      window.localStorage.getItem("watchparty-username") ?? "",
    );
    const fallbackName = username || "Convidado";
    const params = new URLSearchParams(window.location.search);
    setErrorMessage("");
    try {
      await createRoom(false, {
        video: params.get("video") ?? undefined,
        roomTitle: params.get("roomTitle") ?? undefined,
        username: fallbackName,
        roomSlug: username
          ? `cinema-${slugify(username) || "sala"}`
          : "cinema-sala",
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível criar a sala. Tente novamente.";
      setErrorMessage(message);
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void startCreate();
  }, [startCreate]);

  return (
    <div className={styles.wrap}>
      {!errorMessage && <Loader />}
      <div className={styles.status} role="status" aria-live="polite">
        {errorMessage || t("createRoomLoading")}
      </div>
      {errorMessage && (
        <button type="button" className={styles.retry} onClick={startCreate}>
          Tentar novamente
        </button>
      )}
    </div>
  );
};
