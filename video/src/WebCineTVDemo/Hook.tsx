import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { GOLD, DARK_BG } from './constants';

// Cada linha surge em `start` e leva `duration` frames para aparecer completamente
function lineIn(frame: number, start: number, duration = 24) {
  return {
    opacity: interpolate(frame, [start, start + duration], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
    y: interpolate(frame, [start, start + duration], [22, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  };
}

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Stagger de 28 frames (~0.93s) entre cada linha
  const l1 = lineIn(frame, 10);   // "E se você pudesse"           — frame 10–34
  const l2 = lineIn(frame, 38);   // "ir ao cinema em..."          — frame 38–62
  const l3 = lineIn(frame, 66);   // "com quem quiser, de onde..." — frame 66–90

  const fadeOut = interpolate(frame, [durationInFrames - 24, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  });

  const glowOpacity = interpolate(frame, [20, 110], [0, 1], { extrapolateRight: 'clamp' });

  const mainStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: 68,
    fontWeight: 800,
    fontFamily: '"Sora", "Segoe UI", sans-serif',
    lineHeight: 1.25,
    letterSpacing: '-0.5px',
    textShadow: `0 0 80px ${GOLD}55`,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: DARK_BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow cinemático de fundo */}
      <div
        style={{
          position: 'absolute',
          width: 960,
          height: 440,
          borderRadius: '50%',
          background: `radial-gradient(ellipse, ${GOLD}16 0%, transparent 68%)`,
          opacity: glowOpacity,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ textAlign: 'center', position: 'relative' }}>

        {/* Linha 1 — eyebrow */}
        <div
          style={{
            opacity: l1.opacity,
            transform: `translateY(${l1.y}px)`,
            color: '#a0a0a0',
            fontSize: 38,
            fontWeight: 300,
            fontFamily: '"Sora", "Segoe UI", sans-serif',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 24,
          }}
        >
          E se você pudesse...
        </div>

        {/* Linha 2 — principal */}
        <div
          style={{
            opacity: l2.opacity,
            transform: `translateY(${l2.y}px)`,
            marginBottom: 12,
            ...mainStyle,
          }}
        >
          Ir ao cinema em{' '}
          <span style={{ color: GOLD }}>qualquer</span>
          {' '}lugar do mundo,
        </div>

        {/* Linha 3 — "com quem quiser, de onde quiser." (mesma linha) */}
        <div
          style={{
            opacity: l3.opacity,
            transform: `translateY(${l3.y}px)`,
            ...mainStyle,
          }}
        >
          com{' '}
          <span style={{ color: GOLD }}>quem</span>
          {' '}quiser, de{' '}
          <span style={{ color: GOLD }}>onde</span>
          {' '}quiser.
        </div>

      </div>
    </div>
  );
};
