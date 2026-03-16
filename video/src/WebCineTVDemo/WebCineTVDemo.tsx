import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { Hook } from './Hook';
import { CinematicScene } from './CinematicScene';
import { CTA } from './CTA';
import { SCENES, GOLD } from './constants';

const d = (scene: { start: number; end: number }) => scene.end - scene.start;


export const WebCineTVDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#050505' }}>
      <Series>

        {/* 0s–6s — Hook: pergunta dramática na tela preta */}
        <Series.Sequence durationInFrames={d(SCENES.hook)}>
          <Hook />
        </Series.Sequence>

        {/* 6s–21s — Home + clique "Nova Sala" + sala com vídeo (clip_home seg 0–15) */}
        <Series.Sequence durationInFrames={d(SCENES.home)}>
          <CinematicScene
            clip="clip_home.mp4"
            eyebrow="A plataforma"
            title="Crie sua sala em segundos."
            subtitle="Sem instalar nada. Sem criar conta. Só colar o link e assistir junto."
            textPosition="bottom-left"
            accentColor={GOLD}
            videoStartFrom={3}
            blackoutFrames={[114, 124]}
          />
        </Series.Sequence>

        {/* 21s–26s — Chat ao vivo + mensagens (clip_home_p3 = clip_home cortado a partir dos 7.5s) */}
        <Series.Sequence durationInFrames={d(SCENES.features)}>
          <CinematicScene
            clip="clip_home_p3.mp4"
            eyebrow="Experiência completa"
            title="Vídeo, chat e reações ao vivo."
            subtitle="YouTube, Twitch, Virtual Browser e Screensharing — tudo na mesma sala."
            textPosition="bottom-left"
            accentColor="#34c98a"
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
