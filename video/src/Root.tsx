import React from 'react';
import { Composition } from 'remotion';
import { WebCineTVDemo } from './WebCineTVDemo/WebCineTVDemo';
import { WebCineTVReels } from './WebCineTVDemo/WebCineTVReels';
import { VIDEO_FPS, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_DURATION_FRAMES } from './WebCineTVDemo/constants';
import { REELS_FPS, REELS_WIDTH, REELS_HEIGHT, REELS_DURATION_FRAMES } from './WebCineTVDemo/constants_reels';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="WebCineTVDemo"
        component={WebCineTVDemo}
        durationInFrames={VIDEO_DURATION_FRAMES}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      <Composition
        id="WebCineTVReels"
        component={WebCineTVReels}
        durationInFrames={REELS_DURATION_FRAMES}
        fps={REELS_FPS}
        width={REELS_WIDTH}
        height={REELS_HEIGHT}
      />
    </>
  );
};
