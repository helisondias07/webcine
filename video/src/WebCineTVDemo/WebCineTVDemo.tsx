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

        {/* 0s–3s — Hook: pergunta dramática na tela preta */}
        <Series.Sequence durationInFrames={d(SCENES.hook)}>
          <Hook />
        </Series.Sequence>

        {/* 3s–11s — Home page: scroll suave, CTA visível */}
        <Series.Sequence durationInFrames={d(SCENES.home)}>
          <CinematicScene
            clip="clip_home.webm"
            eyebrow="A plataforma"
            title="Crie sua sala em segundos."
            subtitle="Sem instalar nada. Sem criar conta. Só colar o link e assistir junto."
            textPosition="bottom-left"
            accentColor={GOLD}
          />
        </Series.Sequence>

        {/* 11s–19s — Sala de watch: modal de entrada, interface */}
        <Series.Sequence durationInFrames={d(SCENES.room)}>
          <CinematicScene
            clip="clip_room.webm"
            eyebrow="Dentro da sala"
            title="Assista com quem você quiser."
            subtitle="Convide amigos, escolha um conteúdo e sincronizem juntos em tempo real."
            textPosition="bottom-left"
            accentColor="#4a9eff"
          />
        </Series.Sequence>

        {/* 19s–26s — Sala ativa: vídeo rodando + chat */}
        <Series.Sequence durationInFrames={d(SCENES.features)}>
          <CinematicScene
            clip="clip_room_active.webm"
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
