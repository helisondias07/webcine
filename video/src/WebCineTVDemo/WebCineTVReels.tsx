import React from 'react';
import {
  AbsoluteFill, Audio, Series, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring,
} from 'remotion';
import { CinematicScene } from './CinematicScene';
import { CTA } from './CTA';
import { REELS_SCENES, GOLD, DARK_BG } from './constants_reels';
import { GOLD as GOLD_COLOR, DARK_BG as DARK_BG_COLOR, BLUE_DARK } from './constants';

const d = (scene: { start: number; end: number }) => scene.end - scene.start;

// ─── Hook vertical — fontes compactas para 1080px de largura ──────────────────
const HookReels: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const line = (start: number) => ({
    opacity: interpolate(frame, [start, start + 22], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    }),
    y: interpolate(frame, [start, start + 22], [18, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    }),
  });

  const l1 = line(10);
  const l2 = line(36);
  const l3 = line(62);
  const fadeOut = interpolate(frame, [durationInFrames - 22, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  });
  const glowOpacity = interpolate(frame, [20, 100], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%', background: DARK_BG_COLOR,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: fadeOut, position: 'relative', overflow: 'hidden',
      padding: '0 60px',
    }}>
      <div style={{
        position: 'absolute', width: 700, height: 700, borderRadius: '50%',
        background: `radial-gradient(ellipse, ${GOLD_COLOR}16 0%, transparent 68%)`,
        opacity: glowOpacity, top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', pointerEvents: 'none',
      }} />

      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div style={{
          opacity: l1.opacity, transform: `translateY(${l1.y}px)`,
          color: '#a0a0a0', fontSize: 30, fontWeight: 300,
          fontFamily: '"Sora", "Segoe UI", sans-serif',
          letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 28,
        }}>
          E se você pudesse...
        </div>

        <div style={{
          opacity: l2.opacity, transform: `translateY(${l2.y}px)`,
          color: '#ffffff', fontSize: 52, fontWeight: 800,
          fontFamily: '"Sora", "Segoe UI", sans-serif',
          lineHeight: 1.22, letterSpacing: '-0.3px',
          textShadow: `0 0 60px ${GOLD_COLOR}55`, marginBottom: 10,
        }}>
          Ir ao cinema em{' '}
          <span style={{ color: GOLD_COLOR }}>qualquer</span>
          {' '}lugar do mundo,
        </div>

        <div style={{
          opacity: l3.opacity, transform: `translateY(${l3.y}px)`,
          color: '#ffffff', fontSize: 52, fontWeight: 800,
          fontFamily: '"Sora", "Segoe UI", sans-serif',
          lineHeight: 1.22, letterSpacing: '-0.3px',
          textShadow: `0 0 60px ${GOLD_COLOR}55`,
        }}>
          com{' '}<span style={{ color: GOLD_COLOR }}>quem</span>
          {' '}quiser, de{' '}<span style={{ color: GOLD_COLOR }}>onde</span>
          {' '}quiser.
        </div>
      </div>
    </div>
  );
};

// ─── Música de fundo com fade ─────────────────────────────────────────────────
const BgMusic: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const volume = (f: number) => interpolate(
    f,
    [0, 60, durationInFrames - 60, durationInFrames],
    [0, 0.18, 0.18, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return <Audio src={staticFile('music/bg.mp3')} volume={volume} />;
};

// ─── Composição principal Reels (1080×1920) ───────────────────────────────────
export const WebCineTVReels: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#050505' }}>
      <BgMusic />
      <Series>

        {/* 0s–7.4s — Hook (aparado em 222 frames para corte em 7.40s) */}
        <Series.Sequence durationInFrames={222}>
          <HookReels />
        </Series.Sequence>

        {/* 8.1s–14.5s — Home (corte 7.40s–8.10s removido; videoStartFrom=51 pula frames cortados) */}
        <Series.Sequence durationInFrames={177}>
          <CinematicScene
            clip="clip_home_v.webm"
            eyebrow="A plataforma"
            title="Crie sua sala em segundos."
            subtitle="Sem instalar nada. Sem criar conta. Só colar o link e assistir junto."
            textPosition="bottom-center"
            accentColor={GOLD_COLOR}
            videoStartFrom={51}
          />
        </Series.Sequence>

        {/* 15s–30s — Vídeo + chat ao vivo (clip vertical, 7.5s–fim) */}
        <Series.Sequence durationInFrames={d(REELS_SCENES.features)}>
          <CinematicScene
            clip="clip_home_v.webm"
            eyebrow="Experiência completa"
            title="Vídeo, chat e reações ao vivo."
            subtitle="YouTube, Twitch, Virtual Browser — tudo na mesma sala."
            textPosition="bottom-center"
            accentColor="#34c98a"
            videoStartFrom={225}
          />
        </Series.Sequence>

        {/* 30s–35s — CTA */}
        <Series.Sequence durationInFrames={d(REELS_SCENES.cta)}>
          <CTA />
        </Series.Sequence>

      </Series>
    </AbsoluteFill>
  );
};
