import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.beforeEach(({ browserName }) => {
  test.skip(
    browserName === "webkit",
    "O WebKit do Playwright não oferece canvas.captureStream para simular compartilhamento.",
  );
});

async function installSyntheticScreenShare(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("watchparty-showchatcolumn", "0");
    window.localStorage.setItem("watchparty-username", "Host Barra");
    const install = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext("2d");
      context?.fillRect(0, 0, canvas.width, canvas.height);
      const stream = canvas.captureStream(5);
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

async function commandRowSpread(page: Page) {
  return page.getByTestId("room-command-row").evaluate((row) => {
    const controls = [...row.querySelectorAll<HTMLElement>("button, input")].filter(
      (element) => element.getClientRects().length > 0,
    );
    const tops = controls.map((element) =>
      Math.round(element.getBoundingClientRect().top),
    );
    return {
      spread: tops.length ? Math.max(...tops) - Math.min(...tops) : 999,
      overflow: row.scrollWidth - row.clientWidth,
      count: controls.length,
    };
  });
}

async function headerSpread(page: Page) {
  return page.evaluate(() => {
    const brand = document.querySelector<HTMLElement>('[aria-label="WebCineTV"]');
    const title = document.querySelector<HTMLElement>('[data-testid="room-title"]');
    const topbar = document.querySelector<HTMLElement>('[data-testid="topbar"]');
    if (!brand || !title || !topbar) {
      return { spread: 999, topbarHeight: 0 };
    }
    const brandBox = brand.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    const barBox = topbar.getBoundingClientRect();
    return {
      spread: Math.abs(
        Math.round(brandBox.top + brandBox.height / 2) -
          Math.round(titleBox.top + titleBox.height / 2),
      ),
      titleInside:
        titleBox.top >= barBox.top - 1 && titleBox.bottom <= barBox.bottom + 1,
      topbarHeight: Math.round(barBox.height),
    };
  });
}

test("sala em uma linha no desktop e no tablet", async ({ page }) => {
  test.setTimeout(90_000);
  mkdirSync("/opt/cursor/artifacts/screenshots", { recursive: true });
  await installSyntheticScreenShare(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nova sala" }).first().click();
  await expect(page).toHaveURL(/\/watch\/[a-z0-9-]+/);
  await expect(page.getByTestId("room-title")).toContainText("Sala de Host Barra");
  await expect
    .poll(async () => (await headerSpread(page)).spread)
    .toBeLessThan(8);
  expect((await headerSpread(page)).titleInside).toBe(true);
  expect((await headerSpread(page)).topbarHeight).toBeLessThan(88);

  await expect(page.getByTestId("room-command-row").getByLabel("Nome no chat")).toHaveCount(0);
  await page.getByTestId("settings-button").click();
  await expect(page.getByLabel("Nome no chat")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("empty-screenshare-button").click();
  await page.getByRole("button", { name: "Escolher o que compartilhar" }).click();
  const stop = page.getByRole("button", { name: "Parar compartilhamento" });
  await expect(stop).toBeVisible();
  await expect(page.locator("section[data-playing='true']")).toBeVisible();
  await expect(page.getByTestId("live-corner")).toBeVisible();
  const cornerSide = await page.getByTestId("live-corner").evaluate((corner) => {
    const player = document.querySelector("#watchPlayerShell");
    if (!player) {
      return "missing";
    }
    const cornerBox = corner.getBoundingClientRect();
    const playerBox = player.getBoundingClientRect();
    return cornerBox.left < playerBox.left + playerBox.width / 2 ? "left" : "right";
  });
  expect(cornerSide).toBe("left");

  const shots: Array<[number, number, string, "icons" | "labels"]> = [
    [1920, 1080, "desktop-1920", "labels"],
    [1366, 768, "desktop-1366", "labels"],
    [1280, 800, "desktop-1280", "icons"],
    [1180, 820, "tablet-1180x820", "icons"],
    [1024, 768, "tablet-1024x768", "icons"],
    [820, 1180, "tablet-portrait-820", "icons"],
  ];

  for (const [width, height, name, mode] of shots) {
    await page.setViewportSize({ width, height });
    const row = await commandRowSpread(page);
    const header = await headerSpread(page);
    expect(row.count, name).toBeGreaterThan(3);
    expect(row.spread, name).toBeLessThan(16);
    expect(row.overflow, name).toBeLessThanOrEqual(1);
    expect(header.spread, name).toBeLessThan(16);
    expect(header.titleInside, name).toBe(true);
    expect(header.topbarHeight, name).toBeLessThan(96);
    const settingsWidth = await page
      .getByTestId("settings-button")
      .evaluate((element) => Math.round(element.getBoundingClientRect().width));
    const stopWidth = await stop.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width),
    );
    if (mode === "icons") {
      expect(settingsWidth, name).toBeLessThan(56);
      expect(stopWidth, name).toBeGreaterThan(100);
    } else {
      expect(settingsWidth, name).toBeGreaterThan(80);
    }
    await page.screenshot({
      path: `/opt/cursor/artifacts/screenshots/${name}.png`,
      fullPage: false,
    });
  }
});
