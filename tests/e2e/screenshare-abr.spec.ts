import { expect, test, type Page } from "@playwright/test";

/**
 * Bitrate-only adaptation. The host capture is a 1920×1080 canvas. Loss, RTT
 * and a frozen encode counter are injected into the host's getStats so the
 * real sender parameters move. CDP bandwidth shaping does not affect
 * localhost WebRTC, so the stats the page already reads are the lever.
 */

test.beforeEach(({ browserName }) => {
  test.skip(
    browserName === "webkit",
    "O WebKit do Playwright não oferece canvas.captureStream para simular compartilhamento.",
  );
});

async function installSyntheticScreenShare(page: Page) {
  await page.addInitScript(() => {
    const install = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const context = canvas.getContext("2d");
      let frame = 0;
      window.setInterval(() => {
        if (!context) {
          return;
        }
        frame += 1;
        context.fillStyle = `hsl(${frame % 360} 70% 40%)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#fff";
        context.fillRect((frame * 18) % 1680, 240, 280, 280);
      }, 33);
      const stream = canvas.captureStream(30);
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        configurable: true,
        value: async () => stream,
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
      install();
    }
  });
}

async function installStatsInjection(page: Page) {
  await page.addInitScript(() => {
    const proto = RTCPeerConnection.prototype;
    const original = proto.getStats;
    proto.getStats = function getStatsWithAbrInjection(
      ...args: Parameters<RTCPeerConnection["getStats"]>
    ) {
      return Promise.resolve(original.apply(this, args)).then((report) => {
        const flag = (
          window as unknown as {
            __abrInject?: { loss?: boolean; freeze?: boolean };
          }
        ).__abrInject;
        if (!flag) {
          return report;
        }
        const next = new Map<string, object>();
        let sawRemoteVideo = false;
        report.forEach((stat, id) => {
          const copy = { ...(stat as object) } as {
            type?: string;
            kind?: string;
            fractionLost?: number;
            roundTripTime?: number;
            framesEncoded?: number;
          };
          if (
            flag.loss &&
            copy.type === "remote-inbound-rtp" &&
            copy.kind === "video"
          ) {
            copy.fractionLost = 0.25;
            copy.roundTripTime = 0.9;
            sawRemoteVideo = true;
          }
          if (
            flag.freeze &&
            copy.type === "outbound-rtp" &&
            copy.kind === "video"
          ) {
            copy.framesEncoded = 1;
          }
          next.set(id, copy);
        });
        if (flag.loss && !sawRemoteVideo) {
          next.set("abr-remote-inbound", {
            type: "remote-inbound-rtp",
            kind: "video",
            fractionLost: 0.25,
            roundTripTime: 0.9,
          });
        }
        return next as unknown as RTCStatsReport;
      });
    };
  });
}

type VideoSender = {
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
  degradationPreference: string;
};

async function videoSenders(page: Page): Promise<VideoSender[]> {
  return page.evaluate(() => {
    const pcs =
      (window as unknown as { __peerConnections?: RTCPeerConnection[] })
        .__peerConnections ?? [];
    const senders: VideoSender[] = [];
    for (const pc of pcs) {
      if (pc.connectionState === "closed") {
        continue;
      }
      const sender = pc
        .getSenders()
        .find((candidate) => candidate.track?.kind === "video");
      if (!sender) {
        continue;
      }
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: string;
      };
      const encoding = params.encodings?.[0];
      senders.push({
        maxBitrate: encoding?.maxBitrate ?? 0,
        maxFramerate: encoding?.maxFramerate ?? 0,
        scaleResolutionDownBy: encoding?.scaleResolutionDownBy ?? 1,
        degradationPreference: params.degradationPreference ?? "",
      });
    }
    return senders;
  });
}

function senderVideo(page: Page) {
  return videoSenders(page).then((senders) => senders[0] ?? null);
}

async function guestPicture(page: Page) {
  return page.evaluate(async () => {
    const video = document.querySelector<HTMLVideoElement>("#leftVideo");
    const pcs =
      (window as unknown as { __peerConnections?: RTCPeerConnection[] })
        .__peerConnections ?? [];
    let frameWidth = 0;
    let frameHeight = 0;
    for (const pc of pcs) {
      if (pc.connectionState === "closed") {
        continue;
      }
      const stats = await pc.getStats();
      stats.forEach((report) => {
        const sample = report as {
          type?: string;
          kind?: string;
          frameWidth?: number;
          frameHeight?: number;
        };
        if (sample.type === "inbound-rtp" && sample.kind === "video") {
          frameWidth = Math.max(frameWidth, sample.frameWidth ?? 0);
          frameHeight = Math.max(frameHeight, sample.frameHeight ?? 0);
        }
      });
    }
    return {
      elementWidth: video?.videoWidth ?? 0,
      elementHeight: video?.videoHeight ?? 0,
      frameWidth,
      frameHeight,
    };
  });
}

test("ABR só de bitrate e preset rede frágil no tablet", async ({ browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext({
    viewport: { width: 1180, height: 820 },
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await installStatsInjection(host);
  await host.addInitScript(() => {
    window.localStorage.setItem("watchparty-username", "Host ABR");
    window.localStorage.setItem("watchparty-showchatcolumn", "0");
  });
  await guest.addInitScript(() => {
    window.localStorage.setItem("watchparty-username", "Tablet ABR");
    window.localStorage.setItem("watchparty-showchatcolumn", "0");
  });
  await installSyntheticScreenShare(host);
  await host.addInitScript(() => {
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
  await guest.addInitScript(() => {
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

  await host.goto("/");
  await host.getByRole("button", { name: "Nova sala" }).first().click();
  await expect(host).toHaveURL(/\/watch\/[a-z0-9-]+/);
  await guest.goto(host.url());
  await expect(guest.locator("#watchPlayerShell")).toBeVisible();
  await host.getByTestId("empty-screenshare-button").click();
  await host
    .getByRole("dialog", { name: "Compartilhar tela" })
    .getByRole("button", { name: "Escolher o que compartilhar" })
    .click();
  const sound = guest.getByRole("button", { name: "Ativar som" });
  try {
    await sound.waitFor({ state: "visible", timeout: 8_000 });
    await sound.click({ force: true });
  } catch {
    // Autoplay was already allowed.
  }

  await expect
    .poll(() => senderVideo(host), { timeout: 20_000 })
    .toMatchObject({
      degradationPreference: "maintain-resolution",
      scaleResolutionDownBy: 1,
    });
  await expect.poll(() => senderVideo(host), { timeout: 15_000 }).toEqual(
    expect.objectContaining({
      maxBitrate: expect.any(Number),
    }),
  );
  const baseline = await senderVideo(host);
  expect(baseline?.maxBitrate ?? 0).toBeGreaterThanOrEqual(3_000_000);
  await expect
    .poll(async () => {
      const picture = await guestPicture(guest);
      return Math.min(
        picture.frameWidth,
        picture.frameHeight,
        picture.elementWidth,
        picture.elementHeight,
      );
    }, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1000);
  const picture = await guestPicture(guest);
  expect(picture.frameWidth).toBeGreaterThanOrEqual(1600);
  expect(picture.elementWidth).toBeGreaterThanOrEqual(1600);

  await host.evaluate(() => {
    (window as unknown as { __abrInject?: { loss: boolean; freeze: boolean } }).__abrInject =
      { loss: true, freeze: true };
  });
  await expect
    .poll(async () => (await senderVideo(host))?.maxBitrate ?? 0, {
      timeout: 35_000,
    })
    .toBeLessThanOrEqual(1_500_000);
  const stressed = await senderVideo(host);
  expect(stressed?.maxBitrate ?? 0).toBeGreaterThanOrEqual(1_200_000);
  expect(stressed?.scaleResolutionDownBy ?? 1).toBeLessThanOrEqual(1);
  expect(stressed?.degradationPreference).toBe("maintain-resolution");
  const stressedPicture = await guestPicture(guest);
  expect(stressedPicture.frameWidth).toBeGreaterThanOrEqual(1600);
  expect(stressedPicture.frameHeight).toBeGreaterThanOrEqual(1000);

  await host.evaluate(() => {
    (window as unknown as { __abrInject?: unknown }).__abrInject = undefined;
  });
  await expect
    .poll(async () => (await senderVideo(host))?.maxBitrate ?? 0, {
      timeout: 25_000,
    })
    .toBeGreaterThanOrEqual(1_800_000);
  const recoveredPicture = await guestPicture(guest);
  expect(recoveredPicture.frameHeight).toBeGreaterThanOrEqual(1000);
  expect((await senderVideo(host))?.scaleResolutionDownBy ?? 1).toBeLessThanOrEqual(1);

  await guest.getByRole("button", { name: "Qualidade de transmissão" }).click();
  await guest.getByRole("menuitem", { name: "Rede frágil" }).click();
  await expect
    .poll(() =>
      guest.evaluate(() => window.localStorage.getItem("watchparty-ss-quality")),
    )
    .toBe("fragile");
  await expect
    .poll(async () => {
      const senders = await videoSenders(host);
      return senders.some(
        (sender) =>
          sender.maxBitrate >= 1_200_000 &&
          sender.maxBitrate <= 1_500_000 &&
          sender.maxFramerate > 0 &&
          sender.maxFramerate <= 24 &&
          sender.scaleResolutionDownBy <= 1 &&
          sender.degradationPreference === "maintain-resolution",
      );
    }, { timeout: 15_000 })
    .toBe(true);
  const fragilePicture = await guestPicture(guest);
  expect(fragilePicture.frameWidth).toBeGreaterThanOrEqual(1600);
  expect(fragilePicture.frameHeight).toBeGreaterThanOrEqual(1000);

  await guest.setViewportSize({ width: 820, height: 1180 });
  await expect(guest.getByRole("button", { name: "Qualidade de transmissão" })).toBeVisible();
  const portrait = await guestPicture(guest);
  expect(portrait.frameWidth).toBeGreaterThanOrEqual(1600);
  expect(portrait.frameHeight).toBeGreaterThanOrEqual(1000);
  expect((await senderVideo(host))?.scaleResolutionDownBy ?? 1).toBeLessThanOrEqual(1);

  await hostContext.close();
  await guestContext.close();
});
