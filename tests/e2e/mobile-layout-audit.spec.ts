import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectInViewport(page: Page, locator: Locator, tolerance = 2) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) {
    return;
  }
  expect(box.x).toBeGreaterThanOrEqual(-tolerance);
  expect(box.y).toBeGreaterThanOrEqual(-tolerance);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + tolerance);
}

async function expectNoHorizontalOverflow(page: Page, maxOverflowPx = 1) {
  const overflow = await page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    return Math.max(0, doc.scrollWidth - window.innerWidth);
  });
  expect(overflow).toBeLessThanOrEqual(maxOverflowPx);
}

async function createRoom(page: Page) {
  await page.goto("/");
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Nova sala" }).first().click();
  await expect(page).toHaveURL(/\/watch\/[a-z0-9-]+/);
  await page.getByPlaceholder("Seu nome").fill("Mobile QA");
  await expect(page.locator("#watchPlayerShell")).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

async function openAndAssertModal(
  page: Page,
  openButtonTestId: string,
  dialogName: string,
) {
  await page.getByTestId(openButtonTestId).click();
  const modal = page.getByRole("dialog", { name: dialogName });
  await expectInViewport(page, modal, 8);
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expectNoHorizontalOverflow(page);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("watchparty-showchatcolumn", "0");
    window.localStorage.setItem("watchparty-username", "Mobile QA");
  });
});

test("auditoria mobile: telas principais sem quebra critica", async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 450, "Somente projetos mobile");

  await page.goto("/");
  await expectNoHorizontalOverflow(page);
  await expect(page.locator("#inicio")).toBeVisible();
  await expect(page.locator("#recursos")).toBeVisible();
  await expect(page.getByText(/Premium|Assinar|Família/i)).toHaveCount(0);
  await expectInViewport(page, page.getByRole("button", { name: "Nova sala" }).first(), 6);

  await createRoom(page);

  const topbar = page.getByTestId("topbar");
  await expectInViewport(page, topbar, 6);

  await openAndAssertModal(page, "empty-screenshare-button", "Compartilhar tela");
  await expect(page.getByTestId("empty-vbrowser-button")).toHaveCount(0);
  await openAndAssertModal(page, "empty-file-button", "Compartilhar arquivo");
  await page.getByTestId("empty-surprise-button").click();
  await expect(page.getByTestId("surprise-dialog")).toBeVisible();
  await page.getByTestId("surprise-dialog").getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByTestId("surprise-dialog")).toBeHidden();
  await expectNoHorizontalOverflow(page);

  const playlistButton = page.getByTestId("playlist-button");
  await expectInViewport(page, playlistButton, 6);
  await playlistButton.click();
  const queueDropdown = page.locator("[role='menu']").last();
  await expect(queueDropdown).toBeVisible();
  await expectInViewport(page, queueDropdown, 8);
  await page.keyboard.press("Escape");
  await expectNoHorizontalOverflow(page);

  const openChatButton = page.getByTestId("open-chat-button");
  if (await openChatButton.isVisible()) {
    await openChatButton.click();
  }
  const chatPanel = page.getByTestId("chat-panel");
  await expect(chatPanel).toBeVisible();
  await expectInViewport(page, chatPanel, 8);
  await expectInViewport(page, page.getByPlaceholder("Digite uma mensagem..."), 8);

  await chatPanel.getByRole("button", { name: "Pessoas", exact: true }).click();
  await expect(chatPanel).toBeVisible();
  await expect(
    chatPanel.getByRole("button", { name: "Chat", exact: true }),
  ).toBeVisible();
  await expect(
    chatPanel.getByRole("button", { name: "Pessoas", exact: true }),
  ).toBeVisible();
  const peopleBody = page.locator("[data-testid='chat-panel'] video, [data-testid='chat-panel'] img").first();
  await expect(peopleBody).toBeVisible();
  await page.getByTestId("close-chat-button").click();
  await expect(chatPanel).not.toBeVisible();

  await page.getByTestId("settings-button").click();
  const settingsModal = page.locator("[role='dialog']").filter({
    hasText: "Trancar sala",
  });
  await expectInViewport(page, settingsModal, 8);
  await settingsModal.getByText("Trancar sala").waitFor();
  await page.keyboard.press("Escape");
  await expect(settingsModal).toBeHidden();

  await expectNoHorizontalOverflow(page);
});
