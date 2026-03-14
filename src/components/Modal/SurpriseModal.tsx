import React, { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Group, Modal, Text } from "@mantine/core";
import {
  IconArrowLeft,
  IconMovie,
  IconPlayerPlayFilled,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { serverPath } from "../../utils/utils";
import styles from "./SurpriseModal.module.css";

type SurpriseType = "video" | "movie";
type FlowState = "setup" | "loading" | "result" | "empty";

type VideoCategoryKey =
  | "tente-nao-rir"
  | "gaming"
  | "clipe-de-musica"
  | "stand-up"
  | "documentario"
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
  platform: {
    id: number;
    name: string;
    logoPath: string | null;
  } | null;
};

const VIDEO_CATEGORIES: { key: VideoCategoryKey; label: string }[] = [
  { key: "tente-nao-rir", label: "Tente não rir" },
  { key: "gaming", label: "Gaming" },
  { key: "clipe-de-musica", label: "Clipe de música" },
  { key: "stand-up", label: "Stand-up" },
  { key: "documentario", label: "Documentário" },
  { key: "aleatorio", label: "Aleatório" },
];

const MOVIE_GENRES = [
  { key: "28", label: "Ação" },
  { key: "35", label: "Comédia" },
  { key: "27", label: "Terror" },
  { key: "10749", label: "Romance" },
  { key: "any", label: "Qualquer" },
] as const;

const MOVIE_PLATFORMS = [
  { key: "netflix", label: "Netflix" },
  { key: "prime-video", label: "Prime Video" },
  { key: "disney-plus", label: "Disney+" },
  { key: "globoplay", label: "Globoplay" },
  { key: "paramount-plus", label: "Paramount+" },
  { key: "max", label: "Max" },
] as const;

const LOADING_MESSAGES = [
  "Procurando algo incrível para você...",
  "Garimpando as melhores opções...",
  "Quase lá, selecionando o melhor...",
];

const PLATFORMS_STORAGE_KEY = "wc_platforms";

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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${serverPath}${url}`);
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error("Servidor indisponível no momento. Tente novamente.");
  }
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Resposta inválida do servidor. Tente novamente.");
  }
  if (!response.ok) {
    throw new Error(String(data?.message ?? "Erro ao carregar dados."));
  }
  return data as T;
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
  const [surpriseType, setSurpriseType] = useState<SurpriseType>("video");
  const [flowState, setFlowState] = useState<FlowState>("setup");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [validationShake, setValidationShake] = useState(false);

  const [videoCategory, setVideoCategory] = useState<VideoCategoryKey>("aleatorio");
  const [videoResult, setVideoResult] = useState<VideoResult | null>(null);

  const [movieGenre, setMovieGenre] = useState<string>("any");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [movieResult, setMovieResult] = useState<MovieDetailsResponse | null>(null);

  const lastClickRef = useRef(0);
  const runningRef = useRef(false);
  const videoCacheRef = useRef<Record<string, VideoResult[]>>({});
  const videoUsedRef = useRef<Record<string, Set<string>>>({});
  const moviePoolCacheRef = useRef<Record<string, MovieListItem[]>>({});
  const movieUsedRef = useRef<Record<string, Set<number>>>({});
  const movieDetailsCacheRef = useRef<Record<number, MovieDetailsResponse>>({});

  useEffect(() => {
    if (!opened) {
      setFlowState("setup");
      setErrorMessage("");
      setValidationShake(false);
      return;
    }
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
  }, [opened]);

  const setLoadingState = () => {
    setFlowState("loading");
    setErrorMessage("");
    setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
  };

  const getMovieCacheKey = () => {
    const providers = [...selectedPlatforms].sort().join("|");
    return `${movieGenre}|${providers}`;
  };

  const pickVideoResult = async () => {
    const category = videoCategory;
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
      return picked;
    }
    const picked = available[Math.floor(Math.random() * available.length)];
    usedSet.add(picked.id);
    videoUsedRef.current[category] = usedSet;
    return picked;
  };

  const fetchMoviePool = async () => {
    const providers = selectedPlatforms.join("|");
    const genre = movieGenre === "any" ? "any" : movieGenre;
    const payload = await fetchJson<{ results: MovieListItem[] }>(
      `/surprise/movies?genre=${encodeURIComponent(genre)}&providers=${encodeURIComponent(providers)}`,
    );
    const key = getMovieCacheKey();
    moviePoolCacheRef.current[key] = shuffle(payload.results || []);
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

  const runSurprise = async () => {
    const now = Date.now();
    if (runningRef.current || now - lastClickRef.current < 650) {
      return;
    }
    lastClickRef.current = now;
    setErrorMessage("");

    if (surpriseType === "movie" && selectedPlatforms.length === 0) {
      setValidationShake(true);
      window.setTimeout(() => setValidationShake(false), 360);
      setErrorMessage("Selecione ao menos uma plataforma para continuar.");
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
        return;
      }
      const details = await resolveMovieDetails(movie.id);
      setMovieResult(details);
      setFlowState("result");
    } catch (error: any) {
      setFlowState("setup");
      setErrorMessage(String(error?.message ?? "Não foi possível buscar sugestões agora."));
    } finally {
      runningRef.current = false;
    }
  };

  const resetToStepOne = () => {
    setFlowState("setup");
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      withCloseButton={false}
      closeOnClickOutside
      closeOnEscape
      transitionProps={{
        transition: "fade",
        duration: 180,
        timingFunction: "ease",
      }}
      overlayProps={{ opacity: 0.82, blur: 0 }}
      classNames={{
        content: styles.modalContent,
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
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
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
            <IconVideo size={20} />
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
            <IconMovie size={20} />
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
                  style={{ animationDelay: `${index * 0.04}s` }}
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
                  style={{ animationDelay: `${index * 0.04}s` }}
                  onClick={() => setMovieGenre(genre.key)}
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
                  style={{ animationDelay: `${index * 0.04}s` }}
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

        <Group justify="space-between" className={styles.actionsRow}>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
            onClick={resetToStepOne}
            disabled={flowState === "loading"}
          >
            Voltar
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

            {flowState !== "loading" && (
              <Button
                variant={flowState === "setup" ? "filled" : "light"}
                color="webgold"
                onClick={runSurprise}
                disabled={runningRef.current}
              >
                {flowState === "setup" ? "Me surpreenda ✦" : "Outro"}
              </Button>
            )}
          </div>
        </Group>
      </section>
    </Modal>
  );
};




