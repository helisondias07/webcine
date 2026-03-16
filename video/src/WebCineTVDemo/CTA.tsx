import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile,
} from 'remotion';
import { GOLD, DARK_BG, BLUE_DARK } from './constants';

export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 110 }, from: 0.6, to: 1 });
  const titleY    = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 18, stiffness: 100 }, from: 20, to: 0 });
  const urlOpacity = interpolate(frame, [22, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tagOpacity = interpolate(frame, [36, 54], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(160deg, ${BLUE_DARK} 0%, ${DARK_BG} 60%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        fontFamily: '"Sora", "Segoe UI", sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow dourado central */}
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(ellipse, ${GOLD}22 0%, transparent 68%)`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Linha horizontal decorativa topo */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
        }}
      />

      {/* Logo */}
      <div style={{ opacity: fadeIn, transform: `scale(${logoScale})`, marginBottom: 24 }}>
        <Img src={staticFile('logo-webcinema.svg')} style={{ width: 88, height: 88 }} />
      </div>

      {/* Título */}
      <div style={{ transform: `translateY(${titleY}px)`, opacity: fadeIn }}>
        <h1
          style={{
            color: '#ffffff',
            fontSize: 80,
            fontWeight: 800,
            margin: 0,
            letterSpacing: '-2px',
            textAlign: 'center',
          }}
        >
          WebCine<span style={{ color: GOLD }}>TV</span>
        </h1>
      </div>

      {/* URL */}
      <div style={{ opacity: urlOpacity, marginTop: 18 }}>
        <p
          style={{
            color: GOLD,
            fontSize: 32,
            fontWeight: 500,
            margin: 0,
            letterSpacing: '2px',
            fontFamily: '"Outfit", monospace',
          }}
        >
          webcinetv.com.br
        </p>
      </div>

      {/* Tagline */}
      <div style={{ opacity: tagOpacity, marginTop: 28 }}>
        <p
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 20,
            fontWeight: 300,
            margin: 0,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontFamily: '"Outfit", "Segoe UI", sans-serif',
          }}
        >
          Sua sala de cinema online
        </p>
      </div>

      {/* Linha decorativa rodapé */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
        }}
      />
    </div>
  );
};
