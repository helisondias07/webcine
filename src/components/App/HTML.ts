import { Player } from "./Player";

export class HTML implements Player {
  elId: string;
  constructor(elId: string) {
    this.elId = elId;
  }

  getVideoEl = (): HTMLMediaElement => {
    return document.getElementById(this.elId) as HTMLMediaElement;
  };

  getCurrentTime = () => {
    return this.getVideoEl()?.currentTime ?? 0;
  };

  getDuration = () => {
    return this.getVideoEl()?.duration ?? 0;
  };

  isMuted = () => {
    return this.getVideoEl()?.muted ?? false;
  };

  getPlaybackRate = (): number => {
    return this.getVideoEl()?.playbackRate ?? 1;
  };

  setPlaybackRate = (rate: number) => {
    if (this.getVideoEl()) {
      this.getVideoEl().playbackRate = rate;
    }
  };

  setSrcAndTime = async (src: string, time: number) => {
    const leftVideo = this.getVideoEl();
    if (leftVideo) {
      leftVideo.currentTime = time;
      leftVideo.src = src;
    }
  };

  playVideo = async () => {
    if (this.getVideoEl()) {
      await this.getVideoEl().play();
    }
  };

  pauseVideo = () => {
    if (this.getVideoEl()) {
      this.getVideoEl().pause();
    }
  };

  seekVideo = (time: number) => {
    if (this.getVideoEl()) {
      this.getVideoEl().currentTime = time;
    }
  };

  shouldPlay = () => {
    const leftVideo = this.getVideoEl();
    return Boolean(leftVideo?.paused || leftVideo?.ended);
  };

  setMute = (muted: boolean) => {
    const leftVideo = this.getVideoEl();
    if (leftVideo) {
      leftVideo.muted = muted;
    }
    const audio = document.getElementById("iPhoneAudio") as HTMLAudioElement;
    if (audio) {
      audio.muted = muted;
    }
  };

  setVolume = (volume: number) => {
    if (this.getVideoEl()) {
      this.getVideoEl().volume = volume;
    }
  };

  getVolume = (): number => {
    return this.getVideoEl()?.volume ?? 1;
  };

  isReady = () => {
    return Boolean(this.getVideoEl());
  };

  clearState = () => {
    const leftVideo = this.getVideoEl();

    // Clear src and srcObject
    leftVideo.src = "";
    leftVideo.srcObject = null;
  };

  getTimeRanges = (): { start: number; end: number }[] => {
    const leftVideo = this.getVideoEl();
    const buffers = [];
    const rangeCount = leftVideo?.buffered.length;
    for (let i = 0; i < rangeCount; i++) {
      const start = leftVideo?.buffered.start(i);
      const end = leftVideo?.buffered.end(i);
      buffers.push({ start, end });
    }
    return buffers;
  };

  setLoop = (loop: boolean): void => {
    const leftVideo = this.getVideoEl();
    leftVideo.loop = loop;
  };
}
