import React, { useLayoutEffect, useRef } from "react";

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
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          margin: 0,
          borderTop: "1px solid var(--border-soft)",
          height: "42px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "11px",
          color: "var(--text-muted)",
          background: "color-mix(in srgb, var(--bg-panel) 92%, transparent)",
          letterSpacing: "0.02em",
          textAlign: "center",
          padding: "0 12px",
          zIndex: 80,
        }}
      >
        Criado por Helison Dias, baseado no site de Howard Chung.
      </footer>
    </>
  );
};
