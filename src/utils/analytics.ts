let initialized = false;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src=\"${src}\"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed_to_load:${src}`));
    document.head.append(script);
  });
}

export async function initAnalytics(measurementIds: string[]) {
  if (initialized || measurementIds.length === 0) {
    return;
  }
  initialized = true;

  const validIds = measurementIds.map((id) => id.trim()).filter(Boolean);
  if (validIds.length === 0) {
    return;
  }

  try {
    await loadScript(
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(validIds[0])}`,
    );
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag("js", new Date());
    for (const id of validIds) {
      window.gtag("config", id);
    }
  } catch (e) {
    console.warn("[analytics]", e);
  }
}

export function runWhenIdle(task: () => void, timeoutMs = 2500) {
  const idleCallback = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => void)
    | undefined;
  if (idleCallback) {
    idleCallback(task, { timeout: timeoutMs });
    return;
  }
  window.setTimeout(task, 1200);
}
