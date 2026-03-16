export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_DURATION_FRAMES = 900; // 30 segundos exatos

// Cenas (frames)
export const SCENES = {
  hook:     { start: 0,   end: 90  }, // 0s–3s   — tela preta + pergunta dramática
  home:     { start: 90,  end: 330 }, // 3s–11s  — home page navegando
  room:     { start: 330, end: 570 }, // 11s–19s — sala de watch + modal
  features: { start: 570, end: 780 }, // 19s–26s — recursos / mobile
  cta:      { start: 780, end: 900 }, // 26s–30s — logo + URL
};

export const GOLD       = '#d4a84b';
export const GOLD_GLOW  = '#e8c06a';
export const DARK_BG    = '#050505';
export const BLUE_DARK  = '#0a0f1a';
