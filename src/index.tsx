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
import { BrowserRouter, Route } from "react-router-dom";

import { Home } from "./components/Home/Home";
import { Privacy, Terms, FAQ } from "./components/Pages/Pages";
import { TopBar } from "./components/TopBar/TopBar";
import { Footer } from "./components/Footer/Footer";
import firebase from "firebase/compat/app";
import { serverPath, softWhite } from "./utils/utils";
import config from "./config";
import { DEFAULT_STATE, MetadataContext } from "./MetadataContext";
import { createTheme, MantineProvider } from "@mantine/core";
import { t } from "./i18n";
import {
  ThemeModeContext,
  type ThemeMode,
} from "./ThemeModeContext";
import { initAnalytics, runWhenIdle } from "./utils/analytics";

const theme = createTheme({
  white: softWhite,
  fontFamily: '"Outfit", "Segoe UI", Tahoma, sans-serif',
  headings: {
    fontFamily: '"Sora", "Outfit", "Segoe UI", sans-serif',
    fontWeight: "800",
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
      "#fff6e3",
      "#fbe6be",
      "#f5d28e",
      "#efbf63",
      "#e6ad3f",
      "#da9f2f",
      "#c88f22",
      "#a87318",
      "#865a13",
      "#67450f",
    ],
  },
  primaryColor: "webgold",
  primaryShade: 6,
  components: {
    Button: {
      defaultProps: {
        radius: "xl",
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
          background: "var(--card-bg)",
          border: "1px solid var(--border-soft)",
          backdropFilter: "blur(12px)",
        },
      },
    },
    Modal: {
      styles: {
        content: {
          background: "var(--card-bg)",
          border: "1px solid var(--border-soft)",
          backdropFilter: "blur(12px)",
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

const SEO_TITLE = "WebCineTV — Sua sala de cinema online";

const firebaseConfig = config.VITE_FIREBASE_CONFIG;
if (firebaseConfig) {
  firebase.initializeApp(JSON.parse(firebaseConfig));
}
document.title = SEO_TITLE;

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
  return "dark";
}

class WebCineTVApp extends React.Component {
  public state = DEFAULT_STATE;
  private authUnsubscribe: firebase.Unsubscribe | undefined = undefined;

  componentWillUnmount() {
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
    }
  }

  async componentDidMount() {
    runWhenIdle(() => {
      const measurementIds = String(config.VITE_GA_MEASUREMENT_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      void initAnalytics(measurementIds);
    });

    if (firebaseConfig) {
      const bootstrapAuth = async () => {
        await import("firebase/auth");
        this.authUnsubscribe = firebase.auth().onAuthStateChanged(async (user: firebase.User | null) => {
        if (user) {
          // console.log(user);
          this.setState({ user });
          const token = await user.getIdToken();
          const authHeaders = {
            Authorization: `Bearer ${token}`,
            "X-User-Uid": user.uid,
          };
          const [metadataResponse, entitlementsResponse] = await Promise.all([
            window.fetch(serverPath + "/metadata", {
              headers: authHeaders,
            }),
            window.fetch(
              serverPath + "/api/me/entitlements",
              {
                headers: authHeaders,
              },
            ),
          ]);
          const metadataData = await metadataResponse.json();
          const entitlementsData = entitlementsResponse.ok
            ? await entitlementsResponse.json()
            : undefined;
          this.setState({
            isSubscriber: Boolean(
              entitlementsData?.isSubscriber ?? metadataData?.isSubscriber,
            ),
            plan: entitlementsData?.plan ?? metadataData?.plan ?? "free",
            subscriptionStatus:
              entitlementsData?.subscriptionStatus ??
              metadataData?.subscriptionStatus ??
              "canceled",
            entitlements:
              entitlementsData?.entitlements ?? metadataData?.entitlements ??
              DEFAULT_STATE.entitlements,
            streamPath: metadataData.streamPath,
            convertPath: metadataData.convertPath,
            beta: metadataData.beta,
          });
        }
        });
      };
      const path = window.location.pathname;
      const shouldEagerInitAuth =
        path.startsWith("/watch/") || path.startsWith("/r/") || path === "/create";
      if (shouldEagerInitAuth) {
        void bootstrapAuth();
      } else {
        runWhenIdle(() => {
          void bootstrapAuth();
        }, 4000);
      }
    } else {
      // Firebase isn't set up so enable subscriber features
      this.setState({
        isSubscriber: true,
        plan: "premium",
        subscriptionStatus: "active",
        entitlements: {
          virtualBrowser: true,
          maxParticipants: 50,
        },
      });
    }
  }
  render() {
    return (
      <MetadataContext.Provider value={this.state}>
        <BrowserRouter>
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
    document.title = SEO_TITLE;
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
