export { GOLD, GOLD_GLOW, DARK_BG, BLUE_DARK } from './constants';

export const REELS_FPS    = 30;
export const REELS_WIDTH  = 1080;
export const REELS_HEIGHT = 1920;
export const REELS_DURATION_FRAMES = 999; // 33.3s (cortes em 7.40s–8.10s removem 21 frames)

export const REELS_SCENES = {
  hook:     { start: 0,   end: 225  }, // 0s–7.5s  — hook dramático
  home:     { start: 225, end: 450  }, // 7.5s–15s — home + Nova Sala
  features: { start: 450, end: 900  }, // 15s–30s  — vídeo + chat ao vivo (15s)
  cta:      { start: 900, end: 1050 }, // 30s–35s  — logo + URL
};
