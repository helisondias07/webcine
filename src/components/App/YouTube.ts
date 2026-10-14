import type { MediaPlayerClass } from "dashjs";
import { Player } from "./Player";
import config from "../../config";

const debugLog = (...args: unknown[]) => {
  if (config.NODE_ENV === "development") {
    console.log(...args);
  }
};

type YouTubeQualityMode = "auto" | YT.SuggestedVideoQuality;

function normalizeYouTubeQuality(value: string | undefined): YouTubeQualityMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "auto":
      return "auto";
    case "default":
      return "default";
    case "small":
      return "small";
    case "medium":
      return "medium";
    case "large":
      return "large";
    case "hd720":
      return "hd720";
    case "hd1080":
      return "hd1080";
    case "highres":
      return "highres";
    default:
      return "auto";
  }
}

type CaptionPlayer = YT.Player & {
  unloadModule?: (module: string) => void;
  loadModule?: (module: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
  getOption?: (module: string, option: string) => unknown;
};

export class YouTube implements Player {
  watchPartyYTPlayer: YT.Player | null;
  preferredQuality: YouTubeQualityMode;
  availableQualityLevels: YT.SuggestedVideoQuality[] = [];
  captionsEnabled = false;

  constructor(
    watchPartyYTPlayer: YT.Player | null,
    preferredQuality: string = "auto",
  ) {
    this.watchPartyYTPlayer = watchPartyYTPlayer;
    this.preferredQuality = normalizeYouTubeQuality(preferredQuality);
  }
  clearDashState = () => {};
  setDashState = (player: MediaPlayerClass) => {};

  toSuggestedQuality = (): YT.SuggestedVideoQuality => {
    return this.preferredQuality === "auto" ? "default" : this.preferredQuality;
  };

  private resolveEffectiveQuality = (): YT.SuggestedVideoQuality => {
    const preferred = this.toSuggestedQuality();
    const available = this.watchPartyYTPlayer?.getAvailableQualityLevels() ?? [];
    if (!available.length) {
      return preferred;
    }
    if (preferred !== "default" && available.includes(preferred)) {
      return preferred;
    }
    const qualityOrder: YT.SuggestedVideoQuality[] = [
      "highres",
      "hd1080",
      "hd720",
      "large",
      "medium",
      "small",
    ];
    const best = qualityOrder.find((quality) => available.includes(quality));
    return best ?? preferred;
  };

  private applyQualityPreference = () => {
    const player = this.watchPartyYTPlayer as
      | (YT.Player & {
          setPlaybackQualityRange?: (
            suggestedQuality: YT.SuggestedVideoQuality,
          ) => void;
        })
      | null;
    if (!player) {
      return;
    }
    const quality = this.resolveEffectiveQuality();
    player.setPlaybackQuality(quality);
    player.setPlaybackQualityRange?.(quality);
    this.refreshAvailableQualityLevels();
  };

  private captionPlayer = (): CaptionPlayer | null => {
    return (this.watchPartyYTPlayer as CaptionPlayer | null) ?? null;
  };

  setCaptionsEnabled = (enabled: boolean) => {
    this.captionsEnabled = enabled;
    this.applyCaptionsPreference();
  };

  applyCaptionsPreference = () => {
    const player = this.captionPlayer();
    if (!player) {
      return;
    }
    try {
      if (!this.captionsEnabled) {
        player.unloadModule?.("captions");
        player.setOption?.("captions", "track", {});
        return;
      }
      player.loadModule?.("captions");
      const tracks = player.getOption?.("captions", "tracklist");
      const list = Array.isArray(tracks)
        ? (tracks as { languageCode?: string; languageName?: string }[])
        : [];
      const preferred =
        list.find((track) => track.languageCode === "pt") ??
        list.find((track) => track.languageCode === "pt-BR") ??
        list.find((track) => track.languageCode?.startsWith("pt")) ??
        list[0];
      if (preferred) {
        player.setOption?.("captions", "track", preferred);
      }
    } catch {
      // The captions module is not ready on every state change.
    }
  };

  setPreferredQuality = (quality: string) => {
    this.preferredQuality = normalizeYouTubeQuality(quality);
    this.applyQualityPreference();
  };

  getPreferredQuality = (): YouTubeQualityMode => {
    return this.preferredQuality;
  };

  refreshAvailableQualityLevels = (): YT.SuggestedVideoQuality[] => {
    const levels = this.watchPartyYTPlayer?.getAvailableQualityLevels() ?? [];
    this.availableQualityLevels = Array.from(new Set(levels));
    return this.availableQualityLevels;
  };

  getAvailableQualityLevels = (): YT.SuggestedVideoQuality[] => {
    if (this.availableQualityLevels.length > 0) {
      return this.availableQualityLevels;
    }
    return this.refreshAvailableQualityLevels();
  };

  getCurrentTime = () => {
    return this.watchPartyYTPlayer?.getCurrentTime() ?? 0;
  };

  getDuration = () => {
    return this.watchPartyYTPlayer?.getDuration() ?? 0;
  };

  isMuted = () => {
    return this.watchPartyYTPlayer?.isMuted() ?? false;
  };

  getPlaybackRate = (): number => {
    return this.watchPartyYTPlayer?.getPlaybackRate() ?? 1;
  };

  setPlaybackRate = (rate: number) => {
    this.watchPartyYTPlayer?.setPlaybackRate(rate);
  };

  setSrcAndTime = async (src: string, time: number) => {
    const url = new window.URL(src);
    // Standard link https://www.youtube.com/watch?v=ID
    const videoId = new URLSearchParams(url.search).get("v");
    // Link shortener https://youtu.be/ID
    const altVideoId = src.split("/").slice(-1)[0].split("?")[0];
    const parsedVideoId = videoId || altVideoId;
    if (!parsedVideoId) {
      return;
    }
    this.watchPartyYTPlayer?.cueVideoById({
      videoId: parsedVideoId,
      startSeconds: time,
      suggestedQuality: this.toSuggestedQuality(),
    });
    window.setTimeout(() => this.applyCaptionsPreference(), 0);
    window.setTimeout(() => this.applyCaptionsPreference(), 400);
    window.setTimeout(() => this.applyCaptionsPreference(), 1200);
    window.setTimeout(() => {
      this.applyQualityPreference();
    }, 120);
    window.setTimeout(() => {
      this.applyQualityPreference();
    }, 650);
    // this.watchPartyYTPlayer?.cuePlaylist({listType: 'playlist', list: 'OLAK5uy_mtoaOGQksRdPbwlNtQ9IiK67wir5QqyIc'});
  };

  playVideo = async () => {
    debugLog("play yt");
    this.watchPartyYTPlayer?.playVideo();
  };

  pauseVideo = () => {
    this.watchPartyYTPlayer?.pauseVideo();
  };

  seekVideo = (time: number) => {
    this.watchPartyYTPlayer?.seekTo(time, true);
  };

  shouldPlay = () => {
    return (
      this.watchPartyYTPlayer?.getPlayerState() ===
        window.YT?.PlayerState.PAUSED ||
      this.getCurrentTime() === this.getDuration()
    );
  };

  setMute = (muted: boolean) => {
    if (muted) {
      this.watchPartyYTPlayer?.mute();
    } else {
      this.watchPartyYTPlayer?.unMute();
    }
  };

  setVolume = (volume: number) => {
    this.watchPartyYTPlayer?.setVolume(volume * 100);
  };

  getVolume = (): number => {
    const volume = this.watchPartyYTPlayer?.getVolume();
    return (volume ?? 0) / 100;
  };

  isReady = () => {
    return Boolean(this.watchPartyYTPlayer);
  };

  stopVideo = () => {
    this.watchPartyYTPlayer?.stopVideo();
  };

  clearState = () => {
    return;
  };

  getTimeRanges = (): { start: number; end: number }[] => {
    return [
      {
        start: 0,
        end:
          (this.watchPartyYTPlayer?.getVideoLoadedFraction() ?? 0) *
          this.getDuration(),
      },
    ];
  };

  setLoop = (loop: boolean): void => {
    this.watchPartyYTPlayer?.setLoop(loop);
  };

  getVideoEl = (): HTMLMediaElement => {
    return document.getElementById("leftYt") as HTMLMediaElement;
  };
}
