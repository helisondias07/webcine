export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_DURATION_FRAMES = 1050; // 35 segundos

export const SCENES = {
  hook:     { start: 0,   end: 225  }, // 0s–7.5s   — hook dramático
  home:     { start: 225, end: 450  }, // 7.5s–15s  — home + Nova Sala + entrar na sala
  features: { start: 450, end: 900  }, // 15s–30s   — vídeo rodando + chat ao vivo (15s)
  cta:      { start: 900, end: 1050 }, // 30s–35s   — logo + URL (5s)
};

export const GOLD       = '#d4a84b';
export const GOLD_GLOW  = '#e8c06a';
export const DARK_BG    = '#050505';
export const BLUE_DARK  = '#0a0f1a';
