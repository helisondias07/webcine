import React, { useLayoutEffect, useRef } from "react";
import styles from "./Footer.module.css";

export const Footer = () => {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const setHeight = () => {
      const height = ref.current?.offsetHeight ?? 42;
      root.style.setProperty("--app-footer-height", `${height}px`);
    };

    setHeight();
    const observer = new ResizeObserver(setHeight);
    if (ref.current) {
      observer.observe(ref.current);
    }
    window.addEventListener("resize", setHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", setHeight);
      root.style.setProperty("--app-footer-height", "0px");
    };
  }, []);

  return (
    <>
      <div aria-hidden style={{ height: "var(--app-footer-height, 0px)" }} />
      <footer
        ref={ref}
        className={styles.footer}
      >
        <span>Criado por Helison Dias</span>
        <a
          href="https://github.com/helisondias07"
          target="_blank"
          rel="noreferrer"
          className={styles.link}
          aria-label="GitHub Helison Dias"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.41-4.04-1.41-.55-1.38-1.33-1.75-1.33-1.75-1.08-.74.08-.73.08-.73 1.19.09 1.82 1.22 1.82 1.22 1.07 1.81 2.8 1.29 3.48.98.11-.77.41-1.29.75-1.59-2.67-.3-5.47-1.33-5.47-5.91 0-1.3.47-2.35 1.22-3.18-.12-.3-.53-1.5.12-3.12 0 0 1-.32 3.28 1.21a11.45 11.45 0 0 1 5.97 0c2.28-1.53 3.28-1.21 3.28-1.21.65 1.62.24 2.82.12 3.12.76.83 1.22 1.88 1.22 3.18 0 4.59-2.8 5.61-5.48 5.91.43.37.82 1.11.82 2.24v3.32c0 .32.21.7.83.58A12 12 0 0 0 12 .5Z"
            />
          </svg>
          <span>GitHub</span>
        </a>
        <a
          href="https://www.linkedin.com/in/helisondias07/"
          target="_blank"
          rel="noreferrer"
          className={styles.link}
          aria-label="LinkedIn Helison Dias"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6A2.5 2.5 0 0 1 0 3.5C0 2.12 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V24h-4V8zM8 8h3.84v2.19h.06c.53-1.01 1.84-2.19 3.78-2.19C19.7 8 24 10.64 24 16.25V24h-4v-6.8c0-1.63-.03-3.73-2.27-3.73-2.27 0-2.62 1.77-2.62 3.61V24H11V8z"
            />
          </svg>
          <span>LinkedIn</span>
        </a>
      </footer>
    </>
  );
};
