/**
 * Cena cinemática: vídeo fullscreen com vignette + texto overlay.
 * Fade-in/out via overlay preto (não opacity do container) para evitar flash branco.
 */
import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  OffthreadVideo,
  staticFile,
} from 'remotion';
import { GOLD, DARK_BG } from './constants';

interface CinematicSceneProps {
  clip: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accentColor?: string;
  videoStartFrom?: number;
  textPosition?: 'bottom-left' | 'center' | 'bottom-center';
  /** Intervalo [inicio, fim] em frames da cena onde a tela fica preta — mascara cortes no clip */
  blackoutFrames?: [number, number];
}

export const CinematicScene: React.FC<CinematicSceneProps> = ({
  clip,
  eyebrow,
  title,
  subtitle,
  accentColor = GOLD,
  videoStartFrom = 0,
  textPosition = 'bottom-left',
  blackoutFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Overlay preto: aparece escuro, some suavemente no início e volta no fim
  const overlayFadeIn  = interpolate(frame, [0, 20], [1, 0], { extrapolateRight: 'clamp' });
  const overlayFadeOut = interpolate(frame, [durationInFrames - 16, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
  });

  // Blackout suave para mascarar corte no clip (fade 5 frames antes/depois)
  const blackout = blackoutFrames
    ? interpolate(
        frame,
        [blackoutFrames[0] - 5, blackoutFrames[0], blackoutFrames[1], blackoutFrames[1] + 5],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;

  const overlayOpacity = Math.max(overlayFadeIn, overlayFadeOut, blackout);

  // Texto slide-up
  const textY = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 90, mass: 1 },
    from: 28,
    to: 0,
  });
  const textOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' });

  const isCenter       = textPosition === 'center' || textPosition === 'bottom-center';
  const isBottomCenter = textPosition === 'bottom-center';

  const textStyle: React.CSSProperties = isCenter && !isBottomCenter
    ? {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 140px',
      }
    : isBottomCenter
    ? {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '0 120px 80px',
      }
    : {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '0 100px 80px',
      };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: DARK_BG,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Vídeo fullscreen — sem zoom, sem transform */}
      <OffthreadVideo
        src={staticFile(`clips/${clip}`)}
        startFrom={videoStartFrom}
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Vignette cinemático */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%),
            linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 46%)
          `,
          pointerEvents: 'none',
        }}
      />

      {/* Overlay preto de transição — fica ABAIXO do texto para texto permanecer visível */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000000',
          opacity: overlayOpacity,
          pointerEvents: 'none',
        }}
      />

      {/* Texto overlay — sempre na camada de cima */}
      <div
        style={{
          ...textStyle,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          fontFamily: '"Sora", "Segoe UI", sans-serif',
        }}
      >
        {eyebrow && (
          <div
            style={{
              color: accentColor,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ display: 'inline-block', width: 32, height: 1.5, background: accentColor }} />
            {eyebrow}
            <span style={{ display: 'inline-block', width: 32, height: 1.5, background: accentColor }} />
          </div>
        )}
        <div
          style={{
            color: '#ffffff',
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.5px',
            textShadow: '0 4px 32px rgba(0,0,0,0.7)',
            maxWidth: 860,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              color: 'rgba(255,255,255,0.72)',
              fontSize: 26,
              fontWeight: 400,
              marginTop: 16,
              lineHeight: 1.5,
              maxWidth: 720,
              fontFamily: '"Outfit", "Segoe UI", sans-serif',
              textShadow: '0 2px 16px rgba(0,0,0,0.6)',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

    </div>
  );
};
