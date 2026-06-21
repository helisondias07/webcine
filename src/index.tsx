import "@mantine/core/styles.css";
import "./index.css";

import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, useLocation } from "react-router-dom";

import { Home } from "./components/Home/Home";
import { Privacy, Terms, FAQ } from "./components/Pages/Pages";
import { TopBar } from "./components/TopBar/TopBar";
import { Footer } from "./components/Footer/Footer";
import { serverPath } from "./utils/serverPath";
import config from "./config";
import { DEFAULT_STATE, MetadataContext } from "./MetadataContext";
import { createTheme, MantineProvider } from "@mantine/core";
import { t } from "./i18n";
import { ThemeModeContext, type ThemeMode } from "./ThemeModeContext";
import { initAnalytics, runWhenIdle } from "./utils/analytics";

const theme = createTheme({
  white: "whitesmoke",
  fontFamily: '"Outfit", "Segoe UI", Tahoma, sans-serif',
  headings: {
    fontFamily: '"Sora", "Outfit", "Segoe UI", sans-serif',
    fontWeight: "700",
  },
  radius: {
    xs: "6px",
    sm: "10px",
    md: "12px",
    lg: "16px",
    xl: "20px",
  },
  defaultRadius: "md",
  colors: {
    webgreen: [
      "#f8f8f8",
      "#ebebeb",
      "#d6d6d6",
      "#c0c0c0",
      "#9f9f9f",
      "#7f7f7f",
      "#5e5e5e",
      "#3f3f3f",
      "#272727",
      "#171717",
    ],
    webgold: [
      "#fff8e8",
      "#f8e9bb",
      "#f0d581",
      "#e8c04f",
      "#e0a82e",
      "#c99014",
      "#b77a08",
      "#955f05",
      "#744a08",
      "#5f3d0a",
    ],
  },
  primaryColor: "webgold",
  primaryShade: 6,
  components: {
    Button: {
      defaultProps: {
        radius: "xl",
      },
      styles: {
        label: {
          fontWeight: 650,
          letterSpacing: "-0.01em",
        },
      },
    },
    ActionIcon: {
      defaultProps: {
        radius: "xl",
      },
    },
    Menu: {
      styles: {
        dropdown: {
          background: "var(--bg-panel)",
          border: "1px solid var(--border-soft)",
          backdropFilter: "blur(18px)",
          boxShadow: "var(--shadow-md)",
        },
      },
    },
    Modal: {
      styles: {
        content: {
          background: "var(--bg-panel)",
          border: "1px solid var(--border-soft)",
          backdropFilter: "blur(18px)",
          boxShadow: "var(--shadow-lg)",
        },
      },
    },
  },
});

const Debug = lazy(() => import("./components/Debug/Debug"));
const WatchApp = lazy(() =>
  import("./components/App/App").then((mod) => ({ default: mod.App })),
);
const CreatePage = lazy(() =>
  import("./components/Create/Create").then((mod) => ({ default: mod.Create })),
);

const SITE_URL = "https://webcinetv.com.br";
const SITE_NAME = "WebCineTV";
type SeoConfig = {
  description: string;
  noIndex?: boolean;
  path: string;
  title: string;
};

const DEFAULT_SEO: SeoConfig = {
  title: "WebCineTV - Sua sala de cinema online",
  description:
    "Crie uma sala de cinema online, convide seus amigos e assistam juntos em tempo real. Sem instalar nada, sem criar conta e gratis.",
  path: "/",
};

const routeSeo: Record<string, SeoConfig> = {
  "/": DEFAULT_SEO,
  "/terms": {
    title: "Termos de uso - WebCineTV",
    description:
      "Leia os termos de uso do WebCineTV para criar salas, assistir videos com amigos e usar os recursos da plataforma.",
    path: "/terms",
  },
  "/privacy": {
    title: "Politica de privacidade - WebCineTV",
    description:
      "Entenda como o WebCineTV lida com contas, salas, cookies, pagamentos e dados relacionados ao uso da plataforma.",
    path: "/privacy",
  },
  "/faq": {
    title: "Perguntas frequentes - WebCineTV",
    description:
      "Tire duvidas sobre audio no compartilhamento de tela, limite de pessoas nas salas e links para criar salas no WebCineTV.",
    path: "/faq",
  },
  "/create": {
    title: "Criando sala - WebCineTV",
    description:
      "Crie uma sala no WebCineTV para assistir videos com amigos em tempo real.",
    noIndex: true,
    path: "/create",
  },
  "/debug": {
    title: "Debug - WebCineTV",
    description: "Pagina tecnica interna do WebCineTV.",
    noIndex: true,
    path: "/debug",
  },
};

function getSeoForPath(pathname: string): SeoConfig {
  const exactSeo = routeSeo[pathname];
  if (exactSeo) {
    return exactSeo;
  }
  if (pathname.startsWith("/watch/") || pathname.startsWith("/r/")) {
    return {
      title: "Sala compartilhada - WebCineTV",
      description:
        "Sala compartilhada do WebCineTV para assistir videos com amigos em tempo real.",
      noIndex: true,
      path: pathname,
    };
  }
  return DEFAULT_SEO;
}

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
) {
  let meta = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function upsertCanonical(href: string) {
  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = href;
}

function upsertStructuredData(data: unknown) {
  const id = "webcinetv-structured-data";
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

const SeoManager = () => {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname.replace(/\/$/, "") || "/";
    const seo = getSeoForPath(pathname);
    const canonicalUrl = `${SITE_URL}${seo.path}`;
    const imageUrl = `${SITE_URL}/screenshot_full.png`;

    document.title = seo.title;
    upsertMeta("name", "description", seo.description);
    upsertMeta(
      "name",
      "robots",
      seo.noIndex ? "noindex, nofollow" : "index, follow",
    );
    upsertMeta("name", "company", SITE_NAME);
    upsertCanonical(canonicalUrl);
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", seo.title);
    upsertMeta("property", "og:description", seo.description);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:type", "website");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", seo.title);
    upsertMeta("name", "twitter:description", seo.description);
    upsertMeta("name", "twitter:image", imageUrl);

    upsertStructuredData({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${SITE_URL}/#website`,
          name: SITE_NAME,
          url: SITE_URL,
          inLanguage: "pt-BR",
          description: DEFAULT_SEO.description,
        },
        {
          "@type": "Organization",
          "@id": `${SITE_URL}/#organization`,
          name: SITE_NAME,
          url: SITE_URL,
          logo: `${SITE_URL}/logo192.png`,
          sameAs: [
            "https://github.com/helisondias07",
            "https://www.linkedin.com/in/helisondias/",
          ],
        },
      ],
    });
  }, [location.pathname]);

  return null;
};

document.title = DEFAULT_SEO.title;

// Redirect old-style URLs
if (window.location.hash && window.location.pathname === "/") {
  const hashRoomId = window.location.hash.substring(1);
  window.location.href = "/watch/" + hashRoomId;
}

const THEME_STORAGE_KEY = "webcinetv-theme-preference";

function getStoredThemeMode(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "light";
}

class WebCineTVApp extends React.Component {
  public state = DEFAULT_STATE;
  private _isMounted = false;

  componentWillUnmount() {
    this._isMounted = false;
  }

  async componentDidMount() {
    this._isMounted = true;
    runWhenIdle(() => {
      const measurementIds = String(config.VITE_GA_MEASUREMENT_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      void initAnalytics(measurementIds);
    });

    const metadataResponse = await window
      .fetch(serverPath + "/metadata")
      .catch(() => undefined);
    if (this._isMounted && metadataResponse?.ok) {
      const metadataData = await metadataResponse.json();
      this.setState({
        streamPath: metadataData.streamPath,
        convertPath: metadataData.convertPath,
        beta: metadataData.beta,
      });
    }
  }
  render() {
    return (
      <MetadataContext.Provider value={this.state}>
        <BrowserRouter>
          <SeoManager />
          <Route
            path="/"
            exact
            render={() => {
              return (
                <React.Fragment>
                  <TopBar hideNewRoom />
                  <Home />
                  <Footer />
                </React.Fragment>
              );
            }}
          />
          <Route
            path="/create"
            exact
            render={() => {
              return (
                <Suspense fallback={null}>
                  <CreatePage />
                </Suspense>
              );
            }}
          />
          <Route
            path="/watch/:roomId"
            exact
            render={(props) => {
              return (
                <Suspense fallback={null}>
                  <WatchApp urlRoomId={props.match.params.roomId} />
                </Suspense>
              );
            }}
          />
          <Route
            path="/r/:vanity"
            exact
            render={(props) => {
              return (
                <Suspense fallback={null}>
                  <WatchApp vanity={props.match.params.vanity} />
                </Suspense>
              );
            }}
          />
          <Route path="/terms">
            <TopBar />
            <Terms />
            <Footer />
          </Route>
          <Route path="/privacy">
            <TopBar />
            <Privacy />
            <Footer />
          </Route>
          <Route path="/faq">
            <TopBar />
            <FAQ />
            <Footer />
          </Route>
          <Route path="/debug">
            <TopBar />
            <Suspense fallback={null}>
              <Debug />
            </Suspense>
            <Footer />
          </Route>
        </BrowserRouter>
      </MetadataContext.Provider>
    );
  }
}

const RootApp = () => {
  const [mode, setMode] = useState<ThemeMode>(getStoredThemeMode());

  useEffect(() => {
    if (config.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    runWhenIdle(() => {
      navigator.serviceWorker
        .register("/sw.min.js")
        .catch((error) => console.warn("[serviceWorker]", error));
    }, 2500);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-mantine-color-scheme", mode);
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      toggleMode,
    }),
    [mode, toggleMode],
  );

  return (
    <MantineProvider theme={theme} forceColorScheme={mode}>
      <ThemeModeContext.Provider value={value}>
        <WebCineTVApp />
      </ThemeModeContext.Provider>
    </MantineProvider>
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<RootApp />);
