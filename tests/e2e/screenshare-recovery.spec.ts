import { expect, test, type Page } from "@playwright/test";

async function prepareIdentity(page: Page, name: string) {
  await page.addInitScript((displayName) => {
    window.localStorage.setItem("watchparty-showchatcolumn", "0");
    window.localStorage.setItem("watchparty-username", displayName);
  }, name);
}

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
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext("2d");
      context?.fillRect(0, 0, canvas.width, canvas.height);
      const videoStream = canvas.captureStream(15);
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      const stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        configurable: true,
        value: async () => {
          void audioContext.resume();
          return stream;
        },
      });
      (window as any).__syntheticShare = { audioContext, oscillator, stream };
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
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Boolean(
            window.watchparty?.socket &&
              document.querySelector<HTMLVideoElement>("#leftVideo"),
          ),
      ),
    )
    .toBe(true);
}

test("endpoint TURN não expõe credenciais sem configuração", async ({
  request,
}) => {
  const response = await request.get("http://127.0.0.1:8091/webrtc/ice");
  expect(response.status()).toBe(204);
});

test("refresh do transmissor libera a sala para compartilhar novamente", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const host = await hostContext.newPage();
  const viewer = await viewerContext.newPage();
  await prepareIdentity(host, "Host Recovery");
  await installSyntheticScreenShare(host);
  const roomUrl = await createRoom(host);
  await startSyntheticShare(host);
  await prepareIdentity(viewer, "Viewer Recovery");
  await viewer.goto(roomUrl);
  await expect(viewer.locator("#watchPlayerShell")).toBeVisible();

  await expect
    .poll(() =>
      host.evaluate(() =>
        Boolean(
          document.querySelector<HTMLButtonElement>(
            '[data-testid="empty-screenshare-button"]',
          ),
        ),
      ),
    )
    .toBe(false);

  await host.reload();
  await expect(host.locator("#watchPlayerShell")).toBeVisible();
  await expect(host.getByTestId("empty-screenshare-button")).toBeVisible();
  await expect(viewer.getByTestId("empty-screenshare-button")).toBeVisible();

  await host.getByTestId("empty-screenshare-button").click();
  await expect(
    host.getByRole("dialog", { name: "Compartilhar tela" }),
  ).toBeVisible();
  await hostContext.close();
  await viewerContext.close();
});

test("espectador que entra depois recebe track de audio da transmissao", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const host = await hostContext.newPage();
  const viewer = await viewerContext.newPage();

  await prepareIdentity(host, "Host Audio");
  await installSyntheticScreenShare(host);
  const roomUrl = await createRoom(host);
  await startSyntheticShare(host);

  await prepareIdentity(viewer, "Tablet Viewer");
  await viewer.goto(roomUrl);
  await expect(viewer.locator("#watchPlayerShell")).toBeVisible();

  await expect
    .poll(
      () =>
        viewer.evaluate(() => {
          const video = document.querySelector<HTMLVideoElement>("#leftVideo");
          const stream = video?.srcObject as MediaStream | null;
          return stream?.getAudioTracks().length ?? 0;
        }),
      { timeout: 15_000 },
    )
    .toBe(1);

  const activateSound = viewer.getByRole("button", { name: "Ativar som" });
  if (await activateSound.isVisible()) {
    // The prompt pulses (scale), so the actionability check never settles.
    await activateSound.click({ force: true });
  }
  await expect
    .poll(() =>
      viewer.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>("#leftVideo");
        const stream = video?.srcObject as MediaStream | null;
        return {
          muted: video?.muted ?? true,
          audioState: stream?.getAudioTracks()[0]?.readyState ?? "missing",
        };
      }),
    )
    .toEqual({ muted: false, audioState: "live" });

  const recoverAudio = viewer.getByRole("button", { name: "Recuperar som" });
  await expect(recoverAudio).toBeVisible();
  await recoverAudio.click();
  await expect
    .poll(() =>
      viewer.evaluate(
        () => document.querySelector<HTMLVideoElement>("#leftVideo")?.muted,
      ),
    )
    .toBe(false);

  await hostContext.close();
  await viewerContext.close();
});

test("espectador mantém a faixa de áudio depois de vários F5", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const host = await hostContext.newPage();
  const viewer = await viewerContext.newPage();

  await prepareIdentity(host, "Host Refresh");
  await installSyntheticScreenShare(host);
  const roomUrl = await createRoom(host);
  await startSyntheticShare(host);

  await prepareIdentity(viewer, "Guest Refresh");
  await viewer.goto(roomUrl);
  await expect(viewer.locator("#watchPlayerShell")).toBeVisible();

  const audioTracks = () =>
    viewer.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>("#leftVideo");
      const stream = video?.srcObject as MediaStream | null;
      return (
        stream
          ?.getAudioTracks()
          .filter((track) => track.readyState === "live").length ?? 0
      );
    });

  await expect.poll(audioTracks, { timeout: 15_000 }).toBe(1);

  for (let reload = 0; reload < 2; reload += 1) {
    await viewer.reload();
    await expect(viewer.locator("#watchPlayerShell")).toBeVisible();
    await expect.poll(audioTracks, { timeout: 15_000 }).toBe(1);
  }

  await hostContext.close();
  await viewerContext.close();
});
