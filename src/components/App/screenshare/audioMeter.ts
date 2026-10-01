// Level meter for the audio that is being shared. The analyser is deliberately
// NOT connected to the AudioContext destination, so nothing is played back
// (no echo).
export class AudioLevelMeter {
  private context?: AudioContext;
  private timer?: number;

  start(track: MediaStreamTrack, onLevel: (level: number) => void): boolean {
    this.stop();
    const AudioContextCtor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioContextCtor) {
      return false;
    }
    try {
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(new MediaStream([track]));
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      void context.resume().catch(() => undefined);
      this.context = context;
      const data = new Uint8Array(analyser.fftSize);
      let level = 0;
      this.timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        level = smoothLevel(level, computeLevel(data));
        onLevel(level);
      }, 100);
      return true;
    } catch (e) {
      console.warn("screenshare: audio meter unavailable", e);
      this.stop();
      return false;
    }
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }
}

// RMS of unsigned 8-bit time-domain samples, scaled to 0..1.
export function computeLevel(data: Uint8Array): number {
  if (!data.length) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / data.length) * 4);
}

// Fast attack, slow release.
export function smoothLevel(previous: number, target: number): number {
  return target > previous ? target : previous * 0.85;
}
