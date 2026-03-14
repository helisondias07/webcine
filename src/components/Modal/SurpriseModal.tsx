import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Group, Modal, Text } from "@mantine/core";
import {
  IconArrowLeft,
  IconMovie,
  IconPlayerPlayFilled,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { serverPath } from "../../utils/utils";
import { MetadataContext } from "../../MetadataContext";
import styles from "./SurpriseModal.module.css";

type SurpriseType = "video" | "movie";
type FlowState = "setup" | "loading" | "result" | "empty";

type VideoCategoryKey =
  | "tente-nao-rir"
  | "gaming"
  | "clipe-de-musica"
  | "stand-up"
  | "documentario"
  | "culinaria"
  | "viral-trending"
  | "aleatorio";

type VideoResult = {
  id: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  views: number;
};

type MovieListItem = {
  id: number;
  title: string;
  release_date: string;
  vote_average: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
};

type MovieDetailsResponse = {
  movie: {
    id: number;
    title: string;
    release_date: string;
    runtime: number;
    vote_average: number;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    genres?: { id: number; name: string }[];
  };
  watchLink: string;
  watchLinkType?: "direct" | "tmdb_fallback";
  watchLinkProvider?: string;
  platform: {
    id: number;
    name: string;
    logoPath: string | null;
  } | null;
};

type ErrorKind = "none" | "no_results" | "api" | "network";

type HistoryItem = {
  movieId: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  rating: number | null;
  platform: string | null;
  watchedAt: string;
};

const VIDEO_CATEGORIES: { key: VideoCategoryKey; label: string }[] = [
  { key: "tente-nao-rir", label: "😂 Tente não rir" },
  { key: "gaming", label: "🎮 Gameplay" },
  { key: "clipe-de-musica", label: "🎵 Clipe de música" },
  { key: "stand-up", label: "🎤 Stand-up" },
  { key: "documentario", label: "🌍 Documentário" },
  { key: "culinaria", label: "🍳 Culinária" },
  { key: "viral-trending", label: "🔥 Viral / Trending" },
  { key: "aleatorio", label: "🎲 Aleatório" },
];

const MOVIE_GENRES = [
  { key: "28", label: "⚔️ Ação" },
  { key: "35", label: "😂 Comédia" },
  { key: "27", label: "👻 Terror" },
  { key: "10749", label: "💕 Romance" },
  { key: "any", label: "🎲 Qualquer" },
  { key: "16", label: "🎭 Animação" },
  { key: "53", label: "🔪 Suspense" },
] as const;

const MOVIE_PLATFORMS = [
  { key: "netflix", label: "Netflix" },
  { key: "prime-video", label: "Prime Video" },
  { key: "disney-plus", label: "Disney+" },
  { key: "globoplay", label: "Globoplay" },
  { key: "hbo-max", label: "HBO Max" },
  { key: "appletv", label: "Apple TV+" },
] as const;

const LOADING_MESSAGES = [
  "Procurando algo incrível para você...",
  "Garimpando as melhores opções...",
  "Quase lá, selecionando o melhor...",
];

const PLATFORMS_STORAGE_KEY = "wc_platforms";
const GENRE_STORAGE_KEY = "wc_surprise_genre";
const LOCAL_HISTORY_STORAGE_KEY = "wc_movie_history";

function shuffle<T>(list: T[]) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function truncate(input: string, max = 120) {
  if (input.length <= max) {
    return input;
  }
  return `${input.slice(0, max).trimEnd()}...`;
}

function formatViews(views: number) {
  return new Intl.NumberFormat("pt-BR").format(views);
}

function formatStars(voteAverage: number) {
  const rating5 = Math.max(0, Math.min(5, voteAverage / 2));
  const full = Math.floor(rating5);
  const half = rating5 - full >= 0.5 ? 1 : 0;
  const empty = Math.max(0, 5 - full - half);
  return `${"\u2605".repeat(full)}${half ? "½" : ""}${"\u2606".repeat(empty)}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${serverPath}${url}`, init);
  } catch {
    throw new Error("network_error");
  }
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error("api_error");
  }
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("api_error");
  }
  if (!response.ok) {
    throw new Error(String(data?.message ?? data?.error ?? "api_error"));
  }
  return data as T;
}

function formatRelativeDate(input: string) {
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) {
    return "Data indisponível";
  }
  const now = new Date();
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startValue = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  );
  const diffDays = Math.round(
    (startNow.getTime() - startValue.getTime()) / (24 * 60 * 60 * 1000),
  );
  const timeText = value.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffDays <= 0) {
    return `Hoje às ${timeText}`;
  }
  if (diffDays === 1) {
    return `Ontem às ${timeText}`;
  }
  return `${diffDays} dias atrás`;
}

export const SurpriseModal = ({
  opened,
  onClose,
  onPlayTogether,
}: {
  opened: boolean;
  onClose: () => void;
  onPlayTogether: (url: string) => void;
}) => {
  const metadata = useContext(MetadataContext);
  const user = metadata.user;
  const [surpriseType, setSurpriseType] = useState<SurpriseType>("video");
  const [flowState, setFlowState] = useState<FlowState>("setup");
  const [errorKind, setErrorKind] = useState<ErrorKind>("none");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [validationShake, setValidationShake] = useState(false);

  const [videoCategory, setVideoCategory] = useState<VideoCategoryKey>("aleatorio");
  const [videoResult, setVideoResult] = useState<VideoResult | null>(null);
  const [videoCounter, setVideoCounter] = useState({ current: 0, total: 0 });

  const [movieGenre, setMovieGenre] = useState<string>("any");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [movieResult, setMovieResult] = useState<MovieDetailsResponse | null>(null);
  const [movieCounter, setMovieCounter] = useState({ current: 0, total: 0 });

  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionClosing, setSelectionClosing] = useState(false);
  const [movieModalOpen, setMovieModalOpen] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const lastClickRef = useRef(0);
  const runningRef = useRef(false);
  const videoCacheRef = useRef<Record<string, VideoResult[]>>({});
  const videoUsedRef = useRef<Record<string, Set<string>>>({});
  const moviePoolCacheRef = useRef<Record<string, MovieListItem[]>>({});
  const movieTotalRef = useRef<Record<string, number>>({});
  const movieUsedRef = useRef<Record<string, Set<number>>>({});
  const movieDetailsCacheRef = useRef<Record<number, MovieDetailsResponse>>({});

  useEffect(() => {
    if (!opened) {
      setSelectionOpen(false);
      setMovieModalOpen(false);
      setHistoryOpen(false);
      setFlowState("setup");
      setErrorKind("none");
      setErrorMessage("");
      setValidationShake(false);
      setSelectionClosing(false);
      runningRef.current = false;
      return;
    }
    setSelectionOpen(true);
    try {
      const saved = JSON.parse(window.localStorage.getItem(PLATFORMS_STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) {
        const allowed = new Set<string>(MOVIE_PLATFORMS.map((item) => item.key));
        const next = saved.filter((item) => allowed.has(String(item)));
        setSelectedPlatforms(next);
      }
    } catch {
      setSelectedPlatforms([]);
    }
    const savedGenre = window.localStorage.getItem(GENRE_STORAGE_KEY) || "any";
    setMovieGenre(savedGenre);
  }, [opened]);

  const closeAllSurprise = () => {
    setSelectionClosing(false);
    setSelectionOpen(false);
    setMovieModalOpen(false);
    setHistoryOpen(false);
    setHistoryLoading(false);
    setFlowState("setup");
    setErrorKind("none");
    setErrorMessage("");
    setValidationShake(false);
    runningRef.current = false;
    onClose();
  };

  const setLoadingState = () => {
    setFlowState("loading");
    setErrorKind("none");
    setErrorMessage("");
    setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
  };

  const mapError = (error: any) => {
    if (!window.navigator.onLine || String(error?.message ?? "") === "network_error") {
      return {
        kind: "network" as ErrorKind,
        message: "Verifique sua conexão e tente novamente.",
      };
    }
    return {
      kind: "api" as ErrorKind,
      message: "Serviço temporariamente indisponível. Tente novamente em instantes.",
    };
  };

  const getMovieCacheKey = () => {
    const providers = [...selectedPlatforms].sort().join("|");
    return `${movieGenre}|${providers}`;
  };

  const pickVideoResult = async () => {
    const category = videoCategory;
    if (category === "aleatorio") {
      const payload = await fetchJson<{ category: string; items: VideoResult[] }>(
        `/surprise/video?category=${encodeURIComponent(category)}`,
      );
      const pool = shuffle(payload.items || []);
      if (!pool.length) {
        return null;
      }
      const picked = pool[Math.floor(Math.random() * pool.length)];
      setVideoCounter({
        current: 1,
        total: pool.length,
      });
      return picked;
    }
    if (!videoCacheRef.current[category]) {
      const payload = await fetchJson<{ category: string; items: VideoResult[] }>(
        `/surprise/video?category=${encodeURIComponent(category)}`,
      );
      const key = category;
      videoCacheRef.current[key] = shuffle(payload.items || []);
      videoUsedRef.current[key] = new Set<string>();
    }
    const usedSet = videoUsedRef.current[category] ?? new Set<string>();
    const pool = videoCacheRef.current[category] ?? [];
    const available = pool.filter((item) => !usedSet.has(item.id));
    if (!available.length) {
      const payload = await fetchJson<{ category: string; items: VideoResult[] }>(
        `/surprise/video?category=${encodeURIComponent(category)}`,
      );
      videoCacheRef.current[category] = shuffle(payload.items || []);
      videoUsedRef.current[category] = new Set<string>();
      const refreshed = videoCacheRef.current[category] ?? [];
      if (!refreshed.length) {
        return null;
      }
      const picked = refreshed[Math.floor(Math.random() * refreshed.length)];
      videoUsedRef.current[category].add(picked.id);
      setVideoCounter({
        current: videoUsedRef.current[category].size,
        total: refreshed.length,
      });
      return picked;
    }
    const picked = available[Math.floor(Math.random() * available.length)];
    usedSet.add(picked.id);
    videoUsedRef.current[category] = usedSet;
    setVideoCounter({ current: usedSet.size, total: pool.length });
    return picked;
  };

  const fetchMoviePool = async () => {
    const providers = selectedPlatforms.join("|");
    const genre = movieGenre === "any" ? "any" : movieGenre;
    const payload = await fetchJson<{ results: MovieListItem[]; totalResults?: number }>(
      `/surprise/movies?genre=${encodeURIComponent(genre)}&providers=${encodeURIComponent(providers)}`,
    );
    const key = getMovieCacheKey();
    moviePoolCacheRef.current[key] = shuffle(payload.results || []);
    movieTotalRef.current[key] = Number(payload.totalResults ?? payload.results?.length ?? 0);
    movieUsedRef.current[key] = movieUsedRef.current[key] || new Set<number>();
  };

  const pickMovieItem = async () => {
    const key = getMovieCacheKey();
    if (!moviePoolCacheRef.current[key]) {
      await fetchMoviePool();
    }
    const pool = moviePoolCacheRef.current[key] ?? [];
    const used = movieUsedRef.current[key] ?? new Set<number>();
    let available = pool.filter((item) => !used.has(item.id));
    if (!available.length) {
      await fetchMoviePool();
      available = (moviePoolCacheRef.current[key] ?? []).filter((item) => !used.has(item.id));
      if (!available.length) {
        return null;
      }
    }
    const selected = available[Math.floor(Math.random() * available.length)];
    used.add(selected.id);
    movieUsedRef.current[key] = used;
    setMovieCounter({
      current: used.size,
      total: movieTotalRef.current[key] || (moviePoolCacheRef.current[key]?.length ?? 0),
    });
    return selected;
  };

  const resolveMovieDetails = async (movieId: number) => {
    if (movieDetailsCacheRef.current[movieId]) {
      return movieDetailsCacheRef.current[movieId];
    }
    const providerIds = selectedPlatforms.join("|");
    const payload = await fetchJson<MovieDetailsResponse>(
      `/surprise/movie/${movieId}?providerKeys=${encodeURIComponent(providerIds)}`,
    );
    movieDetailsCacheRef.current[movieId] = payload;
    return payload;
  };

  const openMovieResultModal = (details: MovieDetailsResponse) => {
    setMovieResult(details);
    setSelectionClosing(true);
    window.setTimeout(() => {
      setSelectionOpen(false);
      setSelectionClosing(false);
      setMovieModalOpen(true);
      setFlowState("setup");
    }, 200);
  };

  const handleGenreSelect = (value: string) => {
    setMovieGenre(value);
    window.localStorage.setItem(GENRE_STORAGE_KEY, value);
  };

  const getAuthHeaders = async () => {
    if (!user) {
      return null;
    }
    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      "X-User-Uid": user.uid,
      "Content-Type": "application/json",
    };
  };

  const readLocalHistory = (): HistoryItem[] => {
    try {
      const raw = window.localStorage.getItem(LOCAL_HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveLocalHistory = (item: HistoryItem) => {
    const current = readLocalHistory().filter((entry) => entry.movieId !== item.movieId);
    const next = [item, ...current].slice(0, 20);
    window.localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(next));
  };

  const persistMovieHistory = async () => {
    if (!movieResult?.movie) {
      return;
    }
    const payload: HistoryItem = {
      movieId: movieResult.movie.id,
      title: movieResult.movie.title,
      poster_path: movieResult.movie.poster_path,
      backdrop_path: movieResult.movie.backdrop_path,
      rating: Number(movieResult.movie.vote_average?.toFixed(1) || 0),
      platform: movieResult.platform?.name ?? null,
      watchedAt: new Date().toISOString(),
    };
    if (!user) {
      saveLocalHistory(payload);
      return;
    }
    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        saveLocalHistory(payload);
        return;
      }
      await fetchJson<{ ok: boolean }>("/history/movie", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch {
      saveLocalHistory(payload);
    }
  };

  const openHistory = async () => {
    setHistoryLoading(true);
    setHistoryOpen(true);
    try {
      if (!user) {
        setHistoryItems(readLocalHistory());
        return;
      }
      const headers = await getAuthHeaders();
      if (!headers) {
        setHistoryItems(readLocalHistory());
        return;
      }
      const payload = await fetchJson<{ items: HistoryItem[] }>("/history/movies", {
        headers,
      });
      setHistoryItems(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setHistoryItems(readLocalHistory());
    } finally {
      setHistoryLoading(false);
    }
  };

  const runSurprise = async () => {
    const now = Date.now();
    if (runningRef.current || now - lastClickRef.current < 650) {
      return;
    }
    lastClickRef.current = now;
    setErrorKind("none");
    setErrorMessage("");

    if (surpriseType === "movie" && selectedPlatforms.length === 0) {
      setValidationShake(true);
      window.setTimeout(() => setValidationShake(false), 360);
      setErrorKind("no_results");
      setErrorMessage("Nenhum filme encontrado. Tente outro gênero ou plataforma.");
      return;
    }
    runningRef.current = true;
    setLoadingState();

    try {
      if (surpriseType === "video") {
        const picked = await pickVideoResult();
        if (!picked) {
          setFlowState("empty");
          setVideoResult(null);
          setErrorKind("no_results");
          setErrorMessage("Nenhum vídeo encontrado com esses filtros.");
          return;
        }
        setVideoResult(picked);
        setFlowState("result");
        return;
      }

      const movie = await pickMovieItem();
      if (!movie) {
        setFlowState("empty");
        setMovieResult(null);
        setErrorKind("no_results");
        setErrorMessage("Nenhum filme encontrado. Tente outro gênero ou plataforma.");
        return;
      }
      const details = await resolveMovieDetails(movie.id);
      openMovieResultModal(details);
    } catch (error: any) {
      setFlowState("setup");
      const mapped = mapError(error);
      setErrorKind(mapped.kind);
      setErrorMessage(mapped.message);
    } finally {
      runningRef.current = false;
    }
  };

  const resetToStepOne = () => {
    setFlowState("setup");
    setErrorKind("none");
    setErrorMessage("");
  };

  const togglePlatform = (key: string) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
      window.localStorage.setItem(PLATFORMS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const currentMovie = movieResult?.movie;
  const movieMainGenre = currentMovie?.genres?.[0]?.name ?? "-";
  const movieYear = currentMovie?.release_date?.slice(0, 4) || "-";
  const movieDuration = currentMovie?.runtime ? `${currentMovie.runtime} min` : "Duração n/d";
  const canShowRetry = errorKind === "api" || errorKind === "network";
  const movieOverview = useMemo(
    () => truncate(currentMovie?.overview || "Sem sinopse disponível.", 160),
    [currentMovie?.overview],
  );
  const movieOverviewMobile = useMemo(
    () => truncate(currentMovie?.overview || "Sem sinopse disponível.", 100),
    [currentMovie?.overview],
  );

  return (
    <>
    <Modal
      opened={selectionOpen}
      onClose={closeAllSurprise}
      centered
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      transitionProps={{
        transition: "fade",
        duration: 180,
        timingFunction: "ease",
      }}
      overlayProps={{ opacity: 0.82, blur: 0 }}
      classNames={{
        content: `${styles.modalContent} ${selectionClosing ? styles.selectionClosing : ""}`,
        body: styles.modalBody,
      }}
      size={surpriseType === "movie" ? 860 : 760}
      trapFocus
    >
      <section
        data-testid="surprise-dialog"
        className={styles.root}
        role="dialog"
        aria-modal="true"
        aria-label="Descobrir conteúdo"
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={closeAllSurprise}
          aria-label="Fechar"
        >
          <IconX size={18} />
        </button>

        <header className={styles.header}>
          <h2>Deixa a gente te surpreender</h2>
          <p>Não sabe o que assistir? A gente escolhe por você.</p>
        </header>

        <div className={styles.typeToggle}>
          <button
            type="button"
            className={`${styles.typeButton} ${surpriseType === "video" ? styles.typeButtonActive : ""}`}
            onClick={() => {
              setSurpriseType("video");
              setFlowState("setup");
            }}
          >
            <IconVideo size={18} />
            Vídeo
          </button>
          <button
            type="button"
            className={`${styles.typeButton} ${surpriseType === "movie" ? styles.typeButtonActive : ""}`}
            onClick={() => {
              setSurpriseType("movie");
              setFlowState("setup");
            }}
          >
            <IconMovie size={18} />
            Filme
          </button>
        </div>

        {flowState === "setup" && surpriseType === "video" && (
          <div className={styles.slideSection}>
            <Text className={styles.sectionTitle}>Categoria</Text>
            <div className={styles.chips}>
              {VIDEO_CATEGORIES.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.chip} ${videoCategory === item.key ? styles.chipActive : ""}`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                  onClick={() => setVideoCategory(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {flowState === "setup" && surpriseType === "movie" && (
          <div className={`${styles.slideSection} ${validationShake ? styles.shake : ""}`}>
            <Text className={styles.sectionTitle}>Gênero</Text>
            <div className={styles.chips}>
              {MOVIE_GENRES.map((genre, index) => (
                <button
                  key={genre.key}
                  type="button"
                  className={`${styles.chip} ${movieGenre === genre.key ? styles.chipActive : ""}`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                  onClick={() => handleGenreSelect(genre.key)}
                >
                  {genre.label}
                </button>
              ))}
            </div>

            <div className={styles.platformHeaderRow}>
              <Text className={styles.sectionTitle}>Suas plataformas</Text>
              {selectedPlatforms.length > 0 && <span className={styles.savedTag}>(salvas)</span>}
            </div>
            <div className={styles.platformGrid}>
              {MOVIE_PLATFORMS.map((platform, index) => (
                <button
                  key={platform.key}
                  type="button"
                  className={`${styles.platformChip} ${selectedPlatforms.includes(platform.key) ? styles.platformChipActive : ""}`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                  onClick={() => togglePlatform(platform.key)}
                >
                  {platform.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {flowState === "loading" && (
          <div className={styles.loadingWrap}>
            <div className={styles.loadingDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>{LOADING_MESSAGES[loadingMessageIndex]}</p>
          </div>
        )}

        {flowState === "result" && surpriseType === "video" && videoResult && (
          <article className={styles.videoResultCard}>
            <img src={videoResult.thumbnail} alt={videoResult.title} className={styles.videoThumb} />
            <div className={styles.videoMeta}>
              <h3>{videoResult.title}</h3>
              <p>{videoResult.channel}</p>
              <small>{formatViews(videoResult.views)} visualizações</small>
            </div>
          </article>
        )}
        {flowState === "result" && surpriseType === "video" && videoResult && (
          <footer className={styles.resultFooterCounter}>
            Sugestão {videoCounter.current} de {videoCounter.total || "-"}
          </footer>
        )}

        {flowState === "result" && surpriseType === "movie" && currentMovie && (
          <article className={styles.movieCard}>
            {currentMovie.backdrop_path && (
              <div
                key={currentMovie.id}
                className={styles.movieBackdrop}
                style={{
                  backgroundImage: `url(https://image.tmdb.org/t/p/w1280${currentMovie.backdrop_path})`,
                }}
              />
            )}
            <div className={styles.movieBackdropOverlay} />
            <div className={styles.movieContent}>
              {currentMovie.poster_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w154${currentMovie.poster_path}`}
                  alt={currentMovie.title}
                  className={styles.moviePoster}
                />
              ) : (
                <div className={styles.moviePosterPlaceholder}>Sem poster</div>
              )}
              <div className={styles.movieMeta}>
                <h3>{currentMovie.title}</h3>
                <p>{movieYear} • {movieDuration} • {movieMainGenre}</p>
                <p className={styles.ratingText}>
                  {formatStars(currentMovie.vote_average)} {currentMovie.vote_average.toFixed(1)}/10
                </p>
                <p>{truncate(currentMovie.overview || "Sem sinopse disponível.")}</p>
                {movieResult.platform ? (
                  <Badge color="green">{movieResult.platform.name}</Badge>
                ) : (
                  <Badge color="gray">Disponibilidade não encontrada</Badge>
                )}
              </div>
            </div>
          </article>
        )}

        {flowState === "empty" && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎭</div>
            <h3>Não encontramos mais opções</h3>
            <p>
              Exploramos tudo com esses filtros. Que tal mudar o gênero ou adicionar outra plataforma?
            </p>
            <Button variant="light" color="gray" onClick={resetToStepOne}>
              Ajustar filtros
            </Button>
          </div>
        )}

        {errorMessage && (
          <Alert color="red" className={styles.errorAlert}>
            {errorMessage}
          </Alert>
        )}
        {canShowRetry && (
          <Button variant="light" color="gray" onClick={runSurprise}>
            Tentar novamente
          </Button>
        )}

        <Group justify="space-between" className={styles.actionsRow}>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
            onClick={resetToStepOne}
            disabled={flowState === "loading"}
          >
            {surpriseType === "video" ? "Alterar categoria" : "Alterar filtros"}
          </Button>

          <div className={styles.actionsRight}>
            {flowState === "result" && surpriseType === "video" && videoResult && (
              <Button
                color="webgold"
                leftSection={<IconPlayerPlayFilled size={16} />}
                onClick={() => {
                  onPlayTogether(videoResult.url);
                  onClose();
                }}
              >
                Assistir junto!
              </Button>
            )}

            {flowState === "result" && surpriseType === "movie" && movieResult && (
              <Button
                color="webgold"
                component="a"
                href={movieResult.watchLink || undefined}
                target="_blank"
                rel="noreferrer"
                disabled={!movieResult.watchLink || !movieResult.platform}
              >
                {movieResult.platform
                  ? `Assistir na ${movieResult.platform.name} ↗`
                  : "Assistir indisponível"}
              </Button>
            )}

            <Button
              variant={flowState === "setup" ? "filled" : "light"}
              color="webgold"
              onClick={runSurprise}
              disabled={runningRef.current || flowState === "loading"}
              className={runningRef.current || flowState === "loading" ? styles.loadingButton : ""}
            >
              {flowState === "loading"
                ? "Buscando..."
                : flowState === "setup"
                  ? "Me surpreenda ✦"
                  : "Outro"}
            </Button>
          </div>
        </Group>
      </section>
    </Modal>
    <Modal
      opened={movieModalOpen}
      onClose={closeAllSurprise}
      centered
      size={1100}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      classNames={{ content: styles.immersiveContent, body: styles.immersiveBody }}
    >
      {currentMovie && (
        <section className={styles.immersiveRoot}>
          <button
            type="button"
            className={styles.immersiveCloseButton}
            onClick={closeAllSurprise}
            aria-label="Fechar"
          >
            <IconX size={18} />
          </button>
          <div className={styles.immersiveBackgroundLayers}>
            {currentMovie.backdrop_path && (
              <div
                className={styles.immersiveBanner}
                style={{
                  backgroundImage: `url(https://image.tmdb.org/t/p/w1280${currentMovie.backdrop_path})`,
                }}
              />
            )}
            <div className={styles.immersiveOverlayHorizontal} />
            <div className={styles.immersiveOverlayVertical} />
          </div>
          <div className={styles.immersiveMain}>
            {currentMovie.poster_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w342${currentMovie.poster_path}`}
                alt={currentMovie.title}
                className={styles.immersivePoster}
              />
            ) : (
              <div className={styles.immersivePosterPlaceholder}>Sem poster</div>
            )}
            <div className={styles.immersiveInfo}>
              <div className={styles.immersiveTag}>Sugestão para você</div>
              <h3>{currentMovie.title}</h3>
              <p className={styles.immersiveMeta}>
                {movieYear} • {movieDuration} • {movieMainGenre}
              </p>
              <p className={styles.immersiveRating}>
                {formatStars(currentMovie.vote_average)} {currentMovie.vote_average.toFixed(1)}/10
              </p>
              <p className={styles.immersiveSynopsisDesktop}>{movieOverview}</p>
              <p className={styles.immersiveSynopsisMobile}>{movieOverviewMobile}</p>
              {movieResult?.platform ? (
                <Badge className={styles.immersivePlatformBadge}>{movieResult.platform.name}</Badge>
              ) : (
                <Badge color="gray">Disponibilidade não encontrada</Badge>
              )}
              <div className={styles.immersiveButtons}>
                <Button
                  color="webgold"
                  className={styles.immersivePrimaryButton}
                  disabled={!movieResult?.watchLink || !movieResult.platform}
                  onClick={async () => {
                    if (movieResult?.watchLink) {
                      window.open(movieResult.watchLink, "_blank", "noopener,noreferrer");
                    }
                    await persistMovieHistory();
                  }}
                >
                  {movieResult?.platform ? `Assistir na ${movieResult.platform.name} ↗` : "Assistir indisponível"}
                </Button>
                <Button variant="default" className={styles.immersiveSecondaryButton} onClick={runSurprise}>
                  Outro filme
                </Button>
                <Button
                  variant="default"
                  className={styles.immersiveSecondaryButton}
                  onClick={() => {
                    setMovieModalOpen(false);
                    setSelectionOpen(true);
                    setFlowState("setup");
                  }}
                >
                  Alterar filtros
                </Button>
              </div>
            </div>
          </div>
          <footer className={styles.immersiveFooter}>
            <span>Sugestão {movieCounter.current} de {movieCounter.total || "-"}</span>
            {user && (
              <Button variant="subtle" color="gray" onClick={() => void openHistory()}>
                🕐 Ver histórico
              </Button>
            )}
          </footer>
        </section>
      )}
    </Modal>
    <Modal
      opened={historyOpen}
      onClose={() => setHistoryOpen(false)}
      centered
      size={460}
      closeOnClickOutside={false}
      closeOnEscape={false}
      title="🕐 Histórico de filmes"
      classNames={{ content: styles.historyContent, body: styles.historyBody }}
    >
      {!user && (
        <Alert color="yellow" className={styles.historyLoginBanner}>
          Faça login para salvar seu histórico permanentemente.
          <div>
            <Button
              size="xs"
              variant="light"
              mt={8}
              onClick={() => {
                setHistoryOpen(false);
                window.dispatchEvent(new CustomEvent("webcinetv-open-login"));
              }}
            >
              Entrar
            </Button>
          </div>
        </Alert>
      )}
      {historyLoading ? (
        <Text c="dimmed">Carregando histórico...</Text>
      ) : historyItems.length === 0 ? (
        <div className={styles.historyEmpty}>
          Nenhum filme assistido ainda. Clique em &quot;Me surpreenda&quot; para começar!
        </div>
      ) : (
        <div className={styles.historyList}>
          {historyItems.map((item) => (
            <article key={`${item.movieId}-${item.watchedAt}`} className={styles.historyItem}>
              <div className={styles.historyPosterWrap}>
                {item.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w154${item.poster_path}`}
                    alt={item.title}
                    className={styles.historyPoster}
                  />
                ) : (
                  <div className={styles.historyPosterFallback}>—</div>
                )}
              </div>
              <div className={styles.historyMeta}>
                <strong>{item.title}</strong>
                <span>
                  {formatRelativeDate(item.watchedAt)} • {item.platform || "Plataforma n/d"}
                </span>
              </div>
              <div className={styles.historyRating}>★ {item.rating?.toFixed(1) ?? "-"}</div>
            </article>
          ))}
        </div>
      )}
      <div className={styles.historyFooter}>
        <Button
          variant="light"
          color="webgold"
          onClick={() => {
            setHistoryOpen(false);
            setMovieModalOpen(false);
            setSelectionOpen(true);
            setFlowState("setup");
          }}
        >
          Nova sugestão ✦
        </Button>
      </div>
    </Modal>
    </>
  );
};




