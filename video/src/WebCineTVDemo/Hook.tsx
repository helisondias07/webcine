import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { GOLD, DARK_BG } from './constants';

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Linha 1 aparece logo
  const line1Opacity = interpolate(frame, [6, 22], [0, 1], { extrapolateRight: 'clamp' });
  const line1Y       = interpolate(frame, [6, 22], [18, 0], { extrapolateRight: 'clamp' });

  // Linha 2 aparece depois
  const line2Opacity = interpolate(frame, [22, 38], [0, 1], { extrapolateRight: 'clamp' });
  const line2Y       = interpolate(frame, [22, 38], [18, 0], { extrapolateRight: 'clamp' });

  // Fade out no final
  const fadeOut = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  });

  // Brilho de fundo sutil
  const glowOpacity = interpolate(frame, [10, 50], [0, 1], { extrapolateRight: 'clamp' });

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
          width: 900,
          height: 400,
          borderRadius: '50%',
          background: `radial-gradient(ellipse, ${GOLD}18 0%, transparent 68%)`,
          opacity: glowOpacity,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Texto */}
      <div style={{ textAlign: 'center', padding: '0 120px', position: 'relative' }}>
        <div
          style={{
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px)`,
            color: '#c8c8c8',
            fontSize: 44,
            fontWeight: 300,
            fontFamily: '"Sora", "Segoe UI", sans-serif',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 28,
          }}
        >
          E se você pudesse
        </div>
        <div
          style={{
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
            color: '#ffffff',
            fontSize: 72,
            fontWeight: 800,
            fontFamily: '"Sora", "Segoe UI", sans-serif',
            lineHeight: 1.1,
            letterSpacing: '-0.5px',
            textShadow: `0 0 80px ${GOLD}66`,
          }}
        >
          ir ao cinema com{' '}
          <span style={{ color: GOLD }}>qualquer pessoa</span>
          {' '}do mundo?
        </div>
      </div>
    </div>
  );
};
