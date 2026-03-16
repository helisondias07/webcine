import React from 'react';
import { AbsoluteFill, Audio, Series, staticFile, useVideoConfig, interpolate } from 'remotion';
import { Hook } from './Hook';
import { CinematicScene } from './CinematicScene';
import { CTA } from './CTA';
import { SCENES, GOLD } from './constants';

const d = (scene: { start: number; end: number }) => scene.end - scene.start;

const BgMusic: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  // Fade-in nos primeiros 60 frames (2s) e fade-out nos últimos 60 (2s)
  const volume = (f: number) => interpolate(
    f,
    [0, 60, durationInFrames - 60, durationInFrames],
    [0, 0.18, 0.18, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return <Audio src={staticFile('music/bg.mp3')} volume={volume} />;
};

export const WebCineTVDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#050505' }}>
      <BgMusic />
      <Series>

        {/* 0s–6s — Hook: pergunta dramática na tela preta */}
        <Series.Sequence durationInFrames={d(SCENES.hook)}>
          <Hook />
        </Series.Sequence>

        {/* 6s–21s — Home + clique "Nova Sala" + sala com vídeo (clip_home seg 0–7.5s) */}
        <Series.Sequence durationInFrames={d(SCENES.home)}>
          <CinematicScene
            clip="clip_home.webm"
            eyebrow="A plataforma"
            title="Crie sua sala em segundos."
            subtitle="Sem instalar nada. Sem criar conta. Só colar o link e assistir junto."
            textPosition="bottom-left"
            accentColor={GOLD}
            videoStartFrom={3}
          />
        </Series.Sequence>

        {/* 21s–31s — Vídeo rodando + chat ao vivo (clip_home seg 7.5s–15s) */}
        <Series.Sequence durationInFrames={d(SCENES.features)}>
          <CinematicScene
            clip="clip_home.webm"
            eyebrow="Experiência completa"
            title="Vídeo, chat e reações ao vivo."
            subtitle="YouTube, Twitch, Virtual Browser e Screensharing — tudo na mesma sala."
            textPosition="bottom-left"
            accentColor="#34c98a"
            videoStartFrom={225}
          />
        </Series.Sequence>

        {/* 26s–30s — CTA final */}
        <Series.Sequence durationInFrames={d(SCENES.cta)}>
          <CTA />
        </Series.Sequence>

      </Series>
    </AbsoluteFill>
  );
};
