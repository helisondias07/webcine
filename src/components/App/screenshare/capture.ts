export interface ShareCaptureEnv {
  userAgent: string;
  maxTouchPoints: number;
  isSecureContext: boolean;
  hasGetDisplayMedia: boolean;
}

export type ScreenShareMode = "desktop" | "handheld" | "unsupported";

export function isHandheldShareDevice(env: ShareCaptureEnv): boolean {
  const ua = env.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return true;
  }
  // iPadOS reports itself as a Mac, but only a real iPad has touch points.
  if (/Macintosh/i.test(ua) && env.maxTouchPoints > 1) {
    return true;
  }
  return /Android|Mobile|Tablet/i.test(ua);
}

export function getScreenShareMode(env: ShareCaptureEnv): ScreenShareMode {
  if (!env.isSecureContext || !env.hasGetDisplayMedia) {
    return "unsupported";
  }
  return isHandheldShareDevice(env) ? "handheld" : "desktop";
}

/**
 * Phone and tablet browsers reject the desktop request. Resolution caps and
 * audio constraints fail before the system dialog, and those browsers cannot
 * capture another app's audio. A bare `{ video: true }` is the request they
 * can accept in the same user gesture.
 */
export function getDisplayMediaRequest(
  mode: ScreenShareMode,
): DisplayMediaStreamOptions {
  if (mode === "handheld") {
    return { video: true };
  }
  // Device pixels, capped at 1080p30 on the capturer. `logicalSurface: true`
  // captured CSS pixels, so a scaled Windows/macOS display produced a soft
  // ~720p frame that both peers then stretched. Exact sampleRate/sampleSize
  // constraints bind the audio track to a processing graph that goes silent
  // on the next renegotiation (the F5 case) until getDisplayMedia runs again.
  return {
    video: {
      // false = device pixels. true captured CSS pixels and looked soft on
      // scaled displays once both peers stretched it to the player.
      logicalSurface: false,
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    } as MediaTrackConstraints,
    audio: {
      autoGainControl: false,
      channelCount: { ideal: 2 },
      echoCancellation: false,
      noiseSuppression: false,
      sampleRate: { ideal: 48000 },
    },
  };
}

export function screenShareUnsupportedMessage(env: ShareCaptureEnv): string {
  if (!env.isSecureContext) {
    return "Compartilhar tela precisa de uma conexão segura (HTTPS). Abra o site pelo endereço https e tente de novo.";
  }
  if (isHandheldShareDevice(env)) {
    return "Este navegador no celular ou tablet não deixa capturar a tela. Atualize o Chrome no Android ou compartilhe por um computador.";
  }
  return "Este navegador não permite capturar a tela.";
}

type DeviceShareProfile = {
  captureWidth: number;
  captureHeight: number;
  maxFramerate: number;
  maxBitratePerPeer: number;
};

/** Phones and tablets cannot sustain a 1080p/5 Mbps encode on their uplink. */
export function limitShareProfileForDevice<T extends DeviceShareProfile>(
  profile: T,
  handheld: boolean,
): T {
  if (!handheld) {
    return profile;
  }
  const captureHeight = Math.min(profile.captureHeight, 720);
  const captureWidth =
    captureHeight >= 720
      ? Math.min(profile.captureWidth, 1280)
      : Math.min(profile.captureWidth, 960);
  return {
    ...profile,
    captureWidth,
    captureHeight,
    maxFramerate: Math.min(profile.maxFramerate, 24),
    maxBitratePerPeer: Math.min(profile.maxBitratePerPeer, 2_500_000),
  };
}

export function readShareCaptureEnv(): ShareCaptureEnv {
  if (typeof navigator === "undefined") {
    return {
      userAgent: "",
      maxTouchPoints: 0,
      isSecureContext: false,
      hasGetDisplayMedia: false,
    };
  }
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    isSecureContext: window.isSecureContext,
    hasGetDisplayMedia:
      typeof navigator.mediaDevices?.getDisplayMedia === "function",
  };
}
