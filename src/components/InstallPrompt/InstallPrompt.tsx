import React, { useEffect, useState } from "react";
import styles from "./InstallPrompt.module.css";

// Chrome/Edge/Samsung Internet (Android, desktop) fire beforeinstallprompt;
// Safari (iPad/iPhone) never does, so iOS gets a short manual hint instead.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "webcinetv-install-dismissed";

// Captured at module load: the event can fire before the Home page mounts.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    listeners.forEach((notify) => notify());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((notify) => notify());
  });
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support tells them apart.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export const InstallPrompt = () => {
  const [canPrompt, setCanPrompt] = useState(Boolean(deferredPrompt));
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const update = () => setCanPrompt(Boolean(deferredPrompt));
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (dismissed || isStandalone()) {
    return null;
  }
  const ios = isIOS();
  if (!canPrompt && !ios) {
    return null;
  }

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode: just hide for this visit.
    }
    setDismissed(true);
  };

  const install = async () => {
    if (ios) {
      setShowIosHint((value) => !value);
      return;
    }
    const prompt = deferredPrompt;
    if (!prompt) {
      return;
    }
    deferredPrompt = null;
    setCanPrompt(false);
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
  };

  return (
    <div className={styles.wrap} role="region" aria-label="Instalar app">
      {showIosHint && (
        <p className={styles.hint}>
          No Safari, toque em <strong>Compartilhar</strong> (quadrado com
          seta) e depois em <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}
      <div className={styles.row}>
        <button type="button" className={styles.install} onClick={install}>
          Instalar app
        </button>
        <button
          type="button"
          className={styles.close}
          onClick={dismiss}
          aria-label="Não mostrar novamente"
          title="Não mostrar novamente"
        >
          ×
        </button>
      </div>
    </div>
  );
};
