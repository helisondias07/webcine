import { expect, test, type Page } from "@playwright/test";

const sampleMediaUrl = "https://example.com/video.mp4";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("watchparty-showchatcolumn", "0");
    window.localStorage.setItem("watchparty-username", "E2E Tester");
  });
});

async function createRoom(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Nova sala" }).first().click();
  await expect(page).toHaveURL(/\/watch\/[a-z0-9-]+/);
  await page.getByPlaceholder("Seu nome").fill("E2E Tester");
  await expect(page.locator("#watchPlayerShell")).toBeVisible();
}

async function assertTopbarNotOverlappingPlayer(page: Page) {
  const topbar = page.getByTestId("topbar").first();
  const playerShell = page.locator("#watchPlayerShell");
  await expect(topbar).toBeVisible();
  await expect(playerShell).toBeVisible();
  const topbarBox = await topbar.boundingBox();
  const playerShellBox = await playerShell.boundingBox();
  expect(topbarBox).not.toBeNull();
  expect(playerShellBox).not.toBeNull();
  expect((topbarBox?.y ?? 0) + (topbarBox?.height ?? 0)).toBeLessThanOrEqual(
    (playerShellBox?.y ?? 0) + 2,
  );
}

async function openAndCloseChat(page: Page) {
  const openChatButton = page.getByTestId("open-chat-button");
  if (await openChatButton.isVisible()) {
    await openChatButton.click();
  }
  await expect(page.getByTestId("chat-panel")).toBeVisible();
  await page.getByTestId("close-chat-button").click();
  await expect(openChatButton).toBeVisible();
}

async function addAndCheckPlaylist(page: Page) {
  await page.waitForFunction(() => Boolean(window.watchparty?.socket?.connected));
  await page.evaluate((url) => {
    window.watchparty.socket?.emit("CMD:playlistAdd", url);
  }, sampleMediaUrl);

  const playlistButton = page.getByTestId("playlist-button");
  await expect(playlistButton).toContainText("1");
  await page.evaluate(() => {
    window.watchparty.socket?.emit("CMD:playlistDelete", 0);
  });
  await expect(playlistButton).toContainText("0");
}

async function assertScreenShareModalFitsViewport(page: Page) {
  const screenShareButton = page.getByTestId("empty-screenshare-button");
  await expect(screenShareButton).toBeVisible();
  await screenShareButton.click();

  const modal = page.getByRole("dialog", { name: "Compartilhar tela" });
  await expect(modal).toBeVisible();
  const modalBox = await modal.boundingBox();
  const viewport = page.viewportSize();
  expect(modalBox).not.toBeNull();
  expect(modalBox?.x ?? 0).toBeGreaterThanOrEqual(0);
  expect(modalBox?.y ?? 0).toBeGreaterThanOrEqual(0);
  expect((modalBox?.x ?? 0) + (modalBox?.width ?? 0)).toBeLessThanOrEqual(
    viewport?.width ?? 0,
  );
  expect((modalBox?.y ?? 0) + (modalBox?.height ?? 0)).toBeLessThanOrEqual(
    viewport?.height ?? 0,
  );

  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
}

test("cria sala, alterna chat e opera playlist", async ({ page }) => {
  await createRoom(page);
  await assertTopbarNotOverlappingPlayer(page);
  await openAndCloseChat(page);
  await addAndCheckPlaylist(page);
});

test("mobile valida topbar e modal sem sobreposicao critica", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 450, "Somente para mobile");

  await createRoom(page);
  await assertTopbarNotOverlappingPlayer(page);
  await assertScreenShareModalFitsViewport(page);
});
