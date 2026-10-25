import React from "react";
import { ActionIcon, Menu, Slider } from "@mantine/core";
import styles from "./Controls.module.css";
import {
  IconAdjustmentsHorizontal,
  IconCheck,
  IconBadgeCc,
  IconMaximize,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconRewindBackward10,
  IconRewindForward10,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";

type ShareQualityMode = "economy" | "auto" | "high" | "fragile";
type YouTubeQualityMode = "auto" | YT.SuggestedVideoQuality;

interface ControlsProps {
  muted: boolean;
  volume: number;
  localFullScreen: (fs: boolean) => void;
  localToggleMute: () => void;
  localSetVolume: (volume: number) => void;
  localTogglePictureInPicture: () => void;
  pictureInPictureSupported: boolean;
  pictureInPictureActive: boolean;
  screenShareQualityMode: ShareQualityMode;
  setScreenShareQualityMode: (mode: ShareQualityMode) => void;
  showShareQualityControl: boolean;
  youtubeQualityMode: YouTubeQualityMode;
  youtubeQualityOptions: YouTubeQualityMode[];
  setYouTubeQualityMode: (mode: YouTubeQualityMode) => void;
  showYouTubeQualityControl: boolean;
  showCountdownControl: boolean;
  countdownInProgress: boolean;
  onStartCountdown: () => void;
  showAudioRecovery: boolean;
  onRecoverAudio: () => void;
  showTransportControls: boolean;
  transportDisabled: boolean;
  paused: boolean;
  onTogglePlay: () => void;
  onSeekBy: (seconds: number) => void;
  captionsEnabled: boolean;
  showCaptionsControl: boolean;
  onToggleCaptions: () => void;
}

export const Controls = (props: ControlsProps) => {
  const {
    muted,
    volume,
    localToggleMute,
    localSetVolume,
    localFullScreen,
    localTogglePictureInPicture,
    pictureInPictureSupported,
    pictureInPictureActive,
    screenShareQualityMode,
    setScreenShareQualityMode,
    showShareQualityControl,
    youtubeQualityMode,
    youtubeQualityOptions,
    setYouTubeQualityMode,
    showYouTubeQualityControl,
    showCountdownControl,
    countdownInProgress,
    onStartCountdown,
    showAudioRecovery,
    onRecoverAudio,
    showTransportControls,
    transportDisabled,
    paused,
    onTogglePlay,
    onSeekBy,
    captionsEnabled,
    showCaptionsControl,
    onToggleCaptions,
  } = props;

  const getYouTubeQualityLabel = (value: YouTubeQualityMode) => {
    switch (value) {
      case "auto":
      case "default":
        return "Auto";
      case "highres":
        return "Alta";
      case "hd1080":
        return "1080p";
      case "hd720":
        return "720p";
      case "large":
        return "480p";
      case "medium":
        return "360p";
      case "small":
        return "240p";
      default:
        return String(value);
    }
  };

  return (
    <div className={styles.controls}>
      {showTransportControls && (
        <>
          <button
            type="button"
            className={styles.action}
            disabled={transportDisabled}
            onClick={() => onSeekBy(-10)}
            aria-label="Voltar 10 segundos"
            title="Voltar 10 segundos"
          >
            <IconRewindBackward10 />
          </button>
          <button
            type="button"
            className={styles.action}
            disabled={transportDisabled}
            onClick={onTogglePlay}
            aria-label={paused ? "Reproduzir" : "Pausar"}
            title={paused ? "Reproduzir" : "Pausar"}
          >
            {paused ? <IconPlayerPlay /> : <IconPlayerPause />}
          </button>
          <button
            type="button"
            className={styles.action}
            disabled={transportDisabled}
            onClick={() => onSeekBy(10)}
            aria-label="Avançar 10 segundos"
            title="Avançar 10 segundos"
          >
            <IconRewindForward10 />
          </button>
        </>
      )}
      {muted ? (
        <button
          type="button"
          onClick={localToggleMute}
          className={styles.action}
          aria-label="Desmutar"
          title="Ativar volume"
        >
          <IconVolumeOff />
        </button>
      ) : (
        <button
          type="button"
          onClick={localToggleMute}
          className={styles.action}
          aria-label="Mutar"
          title="Silenciar"
        >
          <IconVolume />
        </button>
      )}
      <div className={styles.volumeSlider}>
        <Slider
          value={volume}
          disabled={muted}
          min={0}
          max={1}
          step={0.01}
          onChangeEnd={(value: number) => {
            localSetVolume(value);
          }}
        />
      </div>
      {showCaptionsControl && (
        <button
          type="button"
          className={`${styles.action} ${captionsEnabled ? styles.actionActive : ""}`}
          onClick={onToggleCaptions}
          aria-pressed={captionsEnabled}
          aria-label={captionsEnabled ? "Desligar legendas" : "Ligar legendas"}
          title={captionsEnabled ? "Desligar legendas" : "Ligar legendas"}
        >
          <IconBadgeCc />
        </button>
      )}
      {showYouTubeQualityControl && (
        <Menu>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={styles.action}
              title="Qualidade do YouTube"
              aria-label="Qualidade do YouTube"
            >
              <IconAdjustmentsHorizontal size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {youtubeQualityOptions.map((quality) => (
              <Menu.Item
                key={quality}
                leftSection={
                  youtubeQualityMode === quality ? (
                    <IconCheck size={14} />
                  ) : undefined
                }
                onClick={() => setYouTubeQualityMode(quality)}
              >
                {getYouTubeQualityLabel(quality)}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
      {showShareQualityControl && (
        <Menu>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={styles.action}
              title="Qualidade de transmissão"
              aria-label="Qualidade de transmissão"
            >
              <IconAdjustmentsHorizontal size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={
                screenShareQualityMode === "auto" ? (
                  <IconCheck size={14} />
                ) : undefined
              }
              onClick={() => setScreenShareQualityMode("auto")}
            >
              Auto
            </Menu.Item>
            <Menu.Item
              data-testid="share-quality-fragile"
              leftSection={
                screenShareQualityMode === "fragile" ? (
                  <IconCheck size={14} />
                ) : undefined
              }
              onClick={() => setScreenShareQualityMode("fragile")}
            >
              Rede frágil
            </Menu.Item>
            <Menu.Item
              leftSection={
                screenShareQualityMode === "high" ? (
                  <IconCheck size={14} />
                ) : undefined
              }
              onClick={() => setScreenShareQualityMode("high")}
            >
              1080p
            </Menu.Item>
            <Menu.Item
              leftSection={
                screenShareQualityMode === "economy" ? (
                  <IconCheck size={14} />
                ) : undefined
              }
              onClick={() => setScreenShareQualityMode("economy")}
            >
              720p
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
      {showAudioRecovery && (
        <button
          type="button"
          onClick={onRecoverAudio}
          className={styles.action}
          title="Ativar ou recuperar o som da transmissão"
          aria-label="Recuperar som"
        >
          <IconRefresh size={18} />
        </button>
      )}
      {pictureInPictureSupported && (
        <button
          type="button"
          onClick={localTogglePictureInPicture}
          className={`${styles.pipButton} ${pictureInPictureActive ? styles.pipButtonActive : ""}`}
          title={
            pictureInPictureActive
              ? "Desativar Picture in Picture"
              : "Ativar Picture in Picture"
          }
          aria-label={
            pictureInPictureActive
              ? "Desativar Picture in Picture"
              : "Ativar Picture in Picture"
          }
        >
          Picture in Picture
        </button>
      )}
      {showCountdownControl && (
        <button
          type="button"
          onClick={onStartCountdown}
          className={styles.countdownButton}
          disabled={countdownInProgress}
          title="Iniciar contagem regressiva sincronizada"
        >
          ▶ Contagem regressiva
        </button>
      )}
      <IconMaximize
        onClick={() => localFullScreen(true)}
        className={styles.action}
        title="Tela cheia"
      />
    </div>
  );
};
