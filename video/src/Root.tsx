import React from 'react';
import { Composition } from 'remotion';
import { WebCineTVDemo } from './WebCineTVDemo/WebCineTVDemo';
import { VIDEO_FPS, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_DURATION_FRAMES } from './WebCineTVDemo/constants';

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
    </>
  );
};
