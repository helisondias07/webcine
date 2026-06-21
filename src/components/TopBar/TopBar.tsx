import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { serverPath } from "../../utils/serverPath";
import { Button } from "@mantine/core";
import { IconCirclePlusFilled, IconMoonStars, IconSun } from "@tabler/icons-react";
import styles from "./TopBar.module.css";
import { t } from "../../i18n";
import { ThemeModeContext } from "../../ThemeModeContext";

const roomSlugPattern = /^[a-z0-9-]{3,80}$/;

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

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

export async function createRoom(
  openNewTab: boolean | undefined,
  options?: {
    video?: string;
    username?: string;
    roomSlug?: string;
    roomTitle?: string;
  },
) {
  const roomSlug =
    options?.roomSlug && roomSlugPattern.test(options.roomSlug)
      ? options.roomSlug
      : "";
  const roomTitle = normalizeDisplayName(options?.roomTitle ?? "").slice(0, 40);
  let response: Response;
  try {
    response = await fetch(serverPath + "/createRoom", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video: options?.video ?? "",
        username: options?.username ?? "",
        roomSlug,
        roomTitle,
      }),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique se o backend está online.",
    );
  }
  let data: any = undefined;
  try {
    data = await response.json();
  } catch {
    throw new Error("Resposta inválida do servidor.");
  }
  if (!response.ok || !data?.name) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Não foi possível criar a sala.",
    );
  }
  const { name } = data;
  if (openNewTab) {
    window.open("/watch" + name);
  } else {
    window.location.assign("/watch" + name);
  }
}

export const NewRoomButton = (props: {
  size?: string;
  openNewTab?: boolean;
  roomTitle?: string;
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const errorTimeoutRef = useRef<number>();

  useEffect(() => {
    return () => {
      window.clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  const submitCreateRoom = async () => {
    const storedName = window.localStorage.getItem("watchparty-username") ?? "";
    const cleanName = normalizeDisplayName(storedName) || "convidado";
    const slugBase = slugify(cleanName) || "sala";
    const roomSlug = `cinema-${slugBase}`;
    window.localStorage.setItem("watchparty-username", cleanName);
    setIsCreating(true);
    setErrorMessage("");
    try {
      await createRoom(props.openNewTab, {
        username: cleanName,
        roomSlug,
        roomTitle: props.roomTitle,
      });
    } catch (e: any) {
      const message =
        typeof e?.message === "string" && e.message
          ? e.message
          : "Não foi possível criar a sala. Tente novamente.";
      console.warn("[createRoom]", message);
      setErrorMessage(message);
      window.clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = window.setTimeout(() => {
        setErrorMessage("");
      }, 5000);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Button
        className={styles.newRoomButton}
        size={props.size}
        onClick={() => void submitCreateRoom()}
        leftSection={<IconCirclePlusFilled />}
        disabled={isCreating}
      >
        {t("newRoom")}
      </Button>
      {errorMessage && (
        <div className={styles.createRoomToast} role="alert">
          {errorMessage}
        </div>
      )}
    </>
  );
};
const ThemeToggle = () => {
  const { mode, toggleMode } = useContext(ThemeModeContext);
  const isLight = mode === "light";

  return (
    <button
      type="button"
      aria-label={isLight ? "Ativar modo escuro" : "Ativar modo claro"}
      title={isLight ? "Modo claro" : "Modo escuro"}
      onClick={toggleMode}
      className={styles.themeSwitch}
      data-mode={mode}
    >
      <span className={styles.themeIconSun}>
        <IconSun size={14} />
      </span>
      <span className={styles.themeIconMoon}>
        <IconMoonStars size={14} />
      </span>
      <span className={styles.themeThumb} />
    </button>
  );
};

export const TopBar = (props: {
  hideNewRoom?: boolean;
  hideSignin?: boolean;
  hideMyRooms?: boolean;
  roomTitle?: string;
  roomDescription?: string;
  roomTitleColor?: string;
  roomTitleEditable?: boolean;
  onRoomTitleCommit?: (nextTitle: string) => void;
}) => {
  const titleText = useMemo(
    () => normalizeDisplayName(props.roomTitle ?? "").slice(0, 40),
    [props.roomTitle],
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(titleText);

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(titleText);
    }
  }, [isEditingTitle, titleText]);

  const commitRoomTitle = () => {
    const next = normalizeDisplayName(titleDraft).slice(0, 40);
    setIsEditingTitle(false);
    if (next !== titleText) {
      props.onRoomTitleCommit?.(next);
    }
  };

  return (
    <div
      className={styles.topbar}
      data-testid="topbar"
      data-has-room-title={titleText ? "true" : "false"}
    >
      <div className={styles.topbarInner}>
        <div className={styles.leftControls}>
          <ThemeToggle />
        </div>
        <a href="/" className={styles.brandLink} aria-label="WebCineTV">
          <div className={styles.brandText}>
            <span className={styles.brandWord}>WEBCINE</span>
            <span className={styles.brandTv}>tv</span>
          </div>
        </a>
        <div className={styles.actionsWrap}>
          <div className={styles.actions}>
            {!props.hideNewRoom && <NewRoomButton openNewTab />}
          </div>
        </div>
        {titleText && (
          <div className={styles.roomTitleWrap}>
            {isEditingTitle ? (
              <input
                className={styles.roomTitleInput}
                value={titleDraft}
                maxLength={40}
                autoFocus
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitRoomTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRoomTitle();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setTitleDraft(titleText);
                    setIsEditingTitle(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className={`${styles.roomTitleText} ${
                  props.roomTitleEditable ? styles.roomTitleEditable : ""
                }`}
                style={{ color: props.roomTitleColor || undefined }}
                title={
                  props.roomTitleEditable
                    ? "Clique para editar o nome da sala"
                    : titleText
                }
                onClick={() => {
                  if (!props.roomTitleEditable) {
                    return;
                  }
                  setTitleDraft(titleText);
                  setIsEditingTitle(true);
                }}
              >
                {titleText}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

