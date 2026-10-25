import { expect, test, type Page } from "@playwright/test";

/**
 * Two real Chromium contexts. getDisplayMedia cannot open the OS tab picker
 * here, so the host capture is a 1920x1080 canvas plus looping stereo noise.
 * Signaling, Opus fmtp, sender parameters and RTP stats are the real stack.
 */

type StatSnapshot = {
  at: number;
  connectionState: string;
  iceConnectionState: string;
  localOpus: string;
  remoteOpus: string;
  multiopus: boolean;
  sender: {
    degradationPreference?: string;
    scaleResolutionDownBy?: number;
    maxBitrate?: number;
    maxFramerate?: number;
    audioMaxBitrate?: number;
    audioDtx?: boolean;
  } | null;
  outboundVideo: RtpVideo | null;
  inboundVideo: RtpVideo | null;
  outboundAudio: RtpAudio | null;
  inboundAudio: RtpAudio | null;
  pair: {
    nominated?: boolean;
    state?: string;
    availableOutgoingBitrate?: number;
    currentRoundTripTime?: number;
    localType?: string;
    remoteType?: string;
  } | null;
};

type RtpVideo = {
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  framesDecoded?: number;
  framesEncoded?: number;
  framesSent?: number;
  freezeCount?: number;
  packetsLost?: number;
  packetsSent?: number;
  packetsReceived?: number;
  bytesSent?: number;
  bytesReceived?: number;
  qualityLimitationReason?: string;
  targetBitrate?: number;
};

type RtpAudio = {
  packetsSent?: number;
  packetsReceived?: number;
  packetsLost?: number;
  bytesSent?: number;
  bytesReceived?: number;
  targetBitrate?: number;
};

test.describe.configure({ mode: "serial" });

test.beforeEach(({ browserName }) => {
  test.skip(
    browserName === "webkit",
    "O WebKit do Playwright não oferece canvas.captureStream para simular compartilhamento.",
  );
});

async function prepareIdentity(page: Page, name: string) {
  await page.addInitScript((displayName) => {
    window.localStorage.setItem("watchparty-showchatcolumn", "0");
    window.localStorage.setItem("watchparty-username", displayName);
  }, name);
}

async function installPeerTracker(page: Page) {
  await page.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    const tracked: RTCPeerConnection[] = [];
    window.RTCPeerConnection = new Proxy(Native, {
      construct(target, args) {
        const pc = new target(
          ...(args as ConstructorParameters<typeof RTCPeerConnection>),
        );
        tracked.push(pc);
        return pc;
      },
    });
    (window as unknown as { __peerConnections: RTCPeerConnection[] }).__peerConnections =
      tracked;
  });
}

async function installSyntheticScreenShare(page: Page) {
  await page.addInitScript(() => {
    const install = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const context = canvas.getContext("2d");
      let frame = 0;
      const draw = () => {
        if (!context) {
          return;
        }
        frame += 1;
        context.fillStyle = `hsl(${frame % 360} 65% 42%)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.fillRect((frame * 12) % 1920, 360, 240, 240);
        context.font = "72px sans-serif";
        context.fillText(`webcine ${frame}`, 80, 180);
      };
      draw();
      window.setInterval(draw, 33);
      const videoStream = canvas.captureStream(30);
      const audioContext = new AudioContext();
      const noise = audioContext.createBuffer(
        2,
        audioContext.sampleRate * 2,
        audioContext.sampleRate,
      );
      for (let channel = 0; channel < 2; channel += 1) {
        const data = noise.getChannelData(channel);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      const source = audioContext.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      const stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      const calls: unknown[] = [];
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        configurable: true,
        value: async (constraints: unknown) => {
          calls.push(constraints);
          (window as unknown as { __displayMediaCalls: unknown[] }).__displayMediaCalls =
            calls;
          void audioContext.resume();
          return stream;
        },
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
      install();
    }
  });
}

async function createRoom(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Nova sala" }).first().click();
  await expect(page).toHaveURL(/\/watch\/[a-z0-9-]+/);
  await expect(page.locator("#watchPlayerShell")).toBeVisible();
  return page.url();
}

async function startSyntheticShare(page: Page) {
  await page.getByTestId("empty-screenshare-button").click();
  await page
    .getByRole("dialog", { name: "Compartilhar tela" })
    .getByRole("button", { name: "Escolher o que compartilhar" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.watchparty?.socket?.connected ?? false),
    )
    .toBe(true);
}

async function activateSoundIfNeeded(page: Page) {
  const button = page.getByRole("button", { name: "Ativar som" });
  try {
    await button.waitFor({ state: "visible", timeout: 4_000 });
    await button.click({ force: true });
  } catch {
    // Autoplay was already allowed.
  }
}

async function readSnapshots(page: Page): Promise<StatSnapshot[]> {
  return page.evaluate(async () => {
    const opusLine = (sdp: string | undefined) => {
      if (!sdp) {
        return "";
      }
      const rtp = sdp.match(/^a=rtpmap:(\d+)\s+opus\/48000\/2\s*$/im);
      if (!rtp) {
        return "";
      }
      const fmtp = sdp.match(new RegExp(`^a=fmtp:${rtp[1]}\\s+([^\\r\\n]+)`, "im"));
      return fmtp ? fmtp[1] : "missing-fmtp";
    };
    const pcs = (
      window as unknown as { __peerConnections?: RTCPeerConnection[] }
    ).__peerConnections ?? [];
    const snapshots: StatSnapshot[] = [];
    for (const pc of pcs) {
      if (pc.connectionState === "closed") {
        continue;
      }
      let stats: RTCStatsReport;
      try {
        stats = await pc.getStats();
      } catch {
        continue;
      }
      const selected = Array.from(stats.values()).find(
        (report) =>
          report.type === "candidate-pair" &&
          (report as RTCIceCandidatePairStats).nominated &&
          (report as RTCIceCandidatePairStats).state === "succeeded",
      ) as RTCIceCandidatePairStats | undefined;
      const local = selected
        ? (stats.get(selected.localCandidateId ?? "") as
            | RTCIceCandidateStats
            | undefined)
        : undefined;
      const remote = selected
        ? (stats.get(selected.remoteCandidateId ?? "") as
            | RTCIceCandidateStats
            | undefined)
        : undefined;
      const videoOut = Array.from(stats.values()).find(
        (report) => report.type === "outbound-rtp" && (report as { kind?: string }).kind === "video",
      ) as RtpVideo | undefined;
      const videoIn = Array.from(stats.values()).find(
        (report) => report.type === "inbound-rtp" && (report as { kind?: string }).kind === "video",
      ) as RtpVideo | undefined;
      const audioOut = Array.from(stats.values()).find(
        (report) => report.type === "outbound-rtp" && (report as { kind?: string }).kind === "audio",
      ) as RtpAudio | undefined;
      const audioIn = Array.from(stats.values()).find(
        (report) => report.type === "inbound-rtp" && (report as { kind?: string }).kind === "audio",
      ) as RtpAudio | undefined;
      const videoSender = pc.getSenders().find((sender) => sender.track?.kind === "video");
      const audioSender = pc.getSenders().find((sender) => sender.track?.kind === "audio");
      const videoParams = videoSender?.getParameters();
      const audioParams = audioSender?.getParameters();
      const videoEncoding = videoParams?.encodings?.[0] as
        | (RTCRtpEncodingParameters & { dtx?: boolean })
        | undefined;
      const audioEncoding = audioParams?.encodings?.[0] as
        | (RTCRtpEncodingParameters & { dtx?: boolean })
        | undefined;
      const localSdp = pc.localDescription?.sdp ?? "";
      const remoteSdp = pc.remoteDescription?.sdp ?? "";
      snapshots.push({
        at: Date.now(),
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        localOpus: opusLine(localSdp),
        remoteOpus: opusLine(remoteSdp),
        multiopus: /multiopus/i.test(localSdp) || /multiopus/i.test(remoteSdp),
        sender: videoSender
          ? {
              degradationPreference: (
                videoParams as { degradationPreference?: string } | undefined
              )?.degradationPreference,
              scaleResolutionDownBy: videoEncoding?.scaleResolutionDownBy,
              maxBitrate: videoEncoding?.maxBitrate,
              maxFramerate: videoEncoding?.maxFramerate,
              audioMaxBitrate: audioEncoding?.maxBitrate,
              audioDtx: audioEncoding?.dtx,
            }
          : null,
        outboundVideo: videoOut ?? null,
        inboundVideo: videoIn ?? null,
        outboundAudio: audioOut ?? null,
        inboundAudio: audioIn ?? null,
        pair: selected
          ? {
              nominated: selected.nominated,
              state: selected.state,
              availableOutgoingBitrate: selected.availableOutgoingBitrate,
              currentRoundTripTime: selected.currentRoundTripTime,
              localType: local?.candidateType,
              remoteType: remote?.candidateType,
            }
          : null,
      });
    }
    return snapshots;
  });
}

function liveMedia(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>("#leftVideo");
    const stream = video?.srcObject as MediaStream | null;
    return {
      video:
        stream?.getVideoTracks().filter((track) => track.readyState === "live")
          .length ?? 0,
      audio:
        stream?.getAudioTracks().filter((track) => track.readyState === "live")
          .length ?? 0,
      muted: video?.muted ?? true,
      paused: video?.paused ?? true,
      width: video?.videoWidth ?? 0,
      height: video?.videoHeight ?? 0,
    };
  });
}

async function waitForGuestMedia(page: Page) {
  await expect
    .poll(() => liveMedia(page), { timeout: 20_000 })
    .toMatchObject({ video: 1, audio: 1 });
  await activateSoundIfNeeded(page);
  await expect
    .poll(() => liveMedia(page), { timeout: 10_000 })
    .toMatchObject({ video: 1, audio: 1, muted: false });
}

function pickGuest(snapshots: StatSnapshot[]) {
  return snapshots.find((snapshot) => snapshot.inboundVideo) ?? snapshots[0];
}

function pickHost(snapshots: StatSnapshot[]) {
  return snapshots.find((snapshot) => snapshot.outboundVideo) ?? snapshots[0];
}

test("sessão a dois: opus, qualidade, F5 do convidado e fim no F5 do host", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors: string[] = [];
  for (const page of [host, guest]) {
    page.on("pageerror", (error) => errors.push(error.message));
  }

  await prepareIdentity(host, "Host Sessao");
  await installPeerTracker(host);
  await installSyntheticScreenShare(host);
  await prepareIdentity(guest, "Guest Sessao");
  await installPeerTracker(guest);

  const roomUrl = await createRoom(host);
  await startSyntheticShare(host);
  const displayCalls = await host.evaluate(
    () =>
      (window as unknown as { __displayMediaCalls?: Array<Record<string, unknown>> })
        .__displayMediaCalls ?? [],
  );
  expect(displayCalls[0]?.systemAudio).toBe("include");
  expect(displayCalls[0]).not.toHaveProperty("suppressLocalAudioPlayback");

  await guest.goto(roomUrl);
  await expect(guest.locator("#watchPlayerShell")).toBeVisible();
  await waitForGuestMedia(guest);

  await expect
    .poll(async () => {
      const inbound = pickGuest(await readSnapshots(guest))?.inboundVideo;
      return inbound?.framesDecoded ?? 0;
    })
    .toBeGreaterThan(5);

  const guestBefore = pickGuest(await readSnapshots(guest));
  const hostBefore = pickHost(await readSnapshots(host));
  await guest.waitForTimeout(1_500);
  const guestAfter = pickGuest(await readSnapshots(guest));
  const hostAfter = pickHost(await readSnapshots(host));

  expect(guestAfter?.multiopus).toBe(false);
  expect(hostAfter?.multiopus).toBe(false);
  expect(hostAfter?.localOpus).toContain("stereo=1");
  expect(hostAfter?.localOpus).toContain("useinbandfec=1");
  expect(hostAfter?.localOpus).toContain("usedtx=0");
  expect(hostAfter?.localOpus).toContain("maxaveragebitrate=128000");
  expect(guestAfter?.remoteOpus).toContain("stereo=1");
  expect(guestAfter?.remoteOpus).toContain("maxaveragebitrate=128000");
  expect(hostAfter?.sender?.degradationPreference).toBe("maintain-resolution");
  expect(hostAfter?.sender?.scaleResolutionDownBy ?? 1).toBe(1);
  expect(hostAfter?.sender?.maxBitrate ?? 0).toBeGreaterThanOrEqual(3_000_000);

  const framesBefore = guestBefore?.inboundVideo?.framesDecoded ?? 0;
  const framesAfter = guestAfter?.inboundVideo?.framesDecoded ?? 0;
  const audioBefore = guestBefore?.inboundAudio?.bytesReceived ?? 0;
  const audioAfter = guestAfter?.inboundAudio?.bytesReceived ?? 0;
  expect(framesAfter).toBeGreaterThan(framesBefore);
  expect(audioAfter).toBeGreaterThan(audioBefore);
  expect(guestAfter?.inboundVideo?.frameHeight ?? 0).toBeGreaterThanOrEqual(1000);
  expect(guestAfter?.inboundVideo?.frameWidth ?? 0).toBeGreaterThanOrEqual(1600);

  const samples: Array<StatSnapshot | undefined> = [];
  for (let i = 0; i < 6; i += 1) {
    await guest.waitForTimeout(5_000);
    samples.push(pickGuest(await readSnapshots(guest)));
    samples.push(pickHost(await readSnapshots(host)));
  }
  const guestSamples = samples.filter((sample) => sample?.inboundVideo);
  const heights = guestSamples.map((sample) => sample?.inboundVideo?.frameHeight ?? 0);
  const widths = guestSamples.map((sample) => sample?.inboundVideo?.frameWidth ?? 0);
  const fps = guestSamples
    .map((sample) => sample?.inboundVideo?.framesPerSecond)
    .filter((value): value is number => typeof value === "number");
  const freezes = guestSamples.map((sample) => sample?.inboundVideo?.freezeCount ?? 0);
  const lost = guestSamples.map((sample) => sample?.inboundAudio?.packetsLost ?? 0);
  const audioKbps = guestSamples.map((sample, index) => {
    if (index === 0) {
      return 0;
    }
    const previous = guestSamples[index - 1];
    const bytes =
      (sample?.inboundAudio?.bytesReceived ?? 0) -
      (previous?.inboundAudio?.bytesReceived ?? 0);
    const seconds = ((sample?.at ?? 0) - (previous?.at ?? 0)) / 1000;
    return seconds > 0 ? Math.round((bytes * 8) / seconds / 1000) : 0;
  });
  const hostAudioTarget = (await readSnapshots(host))
    .map((sample) => sample.outboundAudio?.targetBitrate)
    .filter((value): value is number => typeof value === "number");

  expect(Math.min(...heights)).toBeGreaterThanOrEqual(1000);
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(1600);
  expect(fps.length).toBeGreaterThan(0);
  expect(Math.min(...fps)).toBeGreaterThanOrEqual(12);
  expect(Math.max(...freezes) - Math.min(...freezes)).toBeLessThanOrEqual(2);
  expect(Math.max(...lost)).toBeLessThanOrEqual(5);

  for (let reload = 0; reload < 3; reload += 1) {
    await guest.reload();
    await expect(guest.locator("#watchPlayerShell")).toBeVisible();
    await waitForGuestMedia(guest);
    const first = pickGuest(await readSnapshots(guest));
    await guest.waitForTimeout(1_200);
    const second = pickGuest(await readSnapshots(guest));
    expect(second?.inboundVideo?.framesDecoded ?? 0).toBeGreaterThan(
      first?.inboundVideo?.framesDecoded ?? 0,
    );
    expect(second?.inboundAudio?.bytesReceived ?? 0).toBeGreaterThan(
      first?.inboundAudio?.bytesReceived ?? 0,
    );
    expect(second?.remoteOpus).toContain("stereo=1");
    expect(second?.remoteOpus).toContain("maxaveragebitrate=128000");
    expect(second?.inboundVideo?.frameHeight ?? 0).toBeGreaterThanOrEqual(1000);
  }

  console.log(
    JSON.stringify(
      {
        phase: "after-reloads",
        errors,
        displayCalls,
        hostOpus: hostAfter?.localOpus,
        guestOpus: guestAfter?.remoteOpus,
        sender: hostAfter?.sender,
        outboundVideo: hostAfter?.outboundVideo,
        inboundVideo: guestAfter?.inboundVideo,
        heights,
        widths,
        fps,
        freezes,
        audioPacketsLost: lost,
        guestAudioKbps: audioKbps,
        hostAudioTargetBitrate: hostAudioTarget,
        pair: guestAfter?.pair,
        hostPair: hostAfter?.pair,
      },
      null,
      2,
    ),
  );

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await prepareIdentity(second, "Guest Dois");
  await installPeerTracker(second);
  await second.goto(roomUrl);
  await expect(second.locator("#watchPlayerShell")).toBeVisible();
  await waitForGuestMedia(second);
  await expect
    .poll(async () => pickGuest(await readSnapshots(second))?.inboundVideo?.frameHeight ?? 0, {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(720);
  await secondContext.close();
  await guest.waitForTimeout(1_000);
  const afterLeave = await liveMedia(guest);
  expect(afterLeave.video).toBe(1);
  expect(afterLeave.audio).toBe(1);

  await host.reload();
  await expect(host.locator("#watchPlayerShell")).toBeVisible();
  await expect(host.getByTestId("empty-screenshare-button")).toBeVisible();
  await expect(guest.getByTestId("empty-screenshare-button")).toBeVisible({
    timeout: 15_000,
  });

  await hostContext.close();
  await guestContext.close();
});

test("convidado recupera áudio e vídeo depois de uma queda curta de rede", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await prepareIdentity(host, "Host Rede");
  await installPeerTracker(host);
  await installSyntheticScreenShare(host);
  await prepareIdentity(guest, "Guest Rede");
  await installPeerTracker(guest);
  const roomUrl = await createRoom(host);
  await startSyntheticShare(host);
  await guest.goto(roomUrl);
  await waitForGuestMedia(guest);

  await guestContext.setOffline(true);
  await guest.waitForTimeout(3_000);
  await guestContext.setOffline(false);

  await expect
    .poll(() => guest.evaluate(() => window.watchparty?.socket?.connected ?? false), {
      timeout: 20_000,
    })
    .toBe(true);
  await waitForGuestMedia(guest);
  const first = pickGuest(await readSnapshots(guest));
  await guest.waitForTimeout(1_200);
  const second = pickGuest(await readSnapshots(guest));
  expect(second?.inboundVideo?.framesDecoded ?? 0).toBeGreaterThan(
    first?.inboundVideo?.framesDecoded ?? 0,
  );
  expect(second?.inboundAudio?.bytesReceived ?? 0).toBeGreaterThan(
    first?.inboundAudio?.bytesReceived ?? 0,
  );
  expect(second?.inboundVideo?.frameHeight ?? 0).toBeGreaterThanOrEqual(1000);
  expect(second?.remoteOpus).toContain("maxaveragebitrate=128000");

  await hostContext.close();
  await guestContext.close();
});

test("watchdog de quadro congelado pede um novo envio no meio da sessão", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await prepareIdentity(host, "Host Freeze");
  await installPeerTracker(host);
  await installSyntheticScreenShare(host);
  await prepareIdentity(guest, "Guest Freeze");
  await installPeerTracker(guest);
  const roomUrl = await createRoom(host);
  await startSyntheticShare(host);
  await guest.goto(roomUrl);
  await waitForGuestMedia(guest);

  await expect
    .poll(async () => pickGuest(await readSnapshots(guest))?.inboundVideo?.framesDecoded ?? 0)
    .toBeGreaterThan(10);
  // Let the one-shot post-connect check observe healthy frames first.
  await guest.waitForTimeout(8_000);

  const patched = await guest.evaluate(() => {
    const pcs = (
      window as unknown as { __peerConnections?: RTCPeerConnection[] }
    ).__peerConnections ?? [];
    const pc = pcs.find(
      (candidate) =>
        candidate.connectionState === "connected" &&
        candidate.getReceivers().some((receiver) => receiver.track.kind === "video"),
    );
    if (!pc) {
      return false;
    }
    const native = pc.getStats.bind(pc);
    let locked: number | null = null;
    pc.getStats = async () => {
      const report = await native();
      const frozen = new Map<string, RTCStats>();
      report.forEach((stat, id) => {
        const video = stat as { type?: string; kind?: string; framesDecoded?: number };
        if (
          video.type === "inbound-rtp" &&
          video.kind === "video" &&
          typeof video.framesDecoded === "number"
        ) {
          if (locked === null) {
            locked = video.framesDecoded;
          }
          frozen.set(id, { ...stat, framesDecoded: locked });
          return;
        }
        frozen.set(id, stat);
      });
      return frozen as unknown as RTCStatsReport;
    };
    return true;
  });
  expect(patched).toBe(true);

  await expect
    .poll(
      () =>
        guest.evaluate(() => {
          const pcs = (
            window as unknown as { __peerConnections?: RTCPeerConnection[] }
          ).__peerConnections ?? [];
          return pcs.filter((pc) => pc.connectionState === "closed").length;
        }),
      { timeout: 25_000 },
    )
    .toBeGreaterThan(0);

  await hostContext.close();
  await guestContext.close();
});
