import { expect, test, type Page } from "@playwright/test";

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
    const controls = [
      ...row.querySelectorAll<HTMLElement>("button, input"),
    ].filter((element) => element.getClientRects().length > 0);
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

test("barra da sala de compartilhamento fica em uma linha no desktop", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installSyntheticScreenShare(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nova sala" }).first().click();
  await expect(page).toHaveURL(/\/watch\/[a-z0-9-]+/);
  await page.getByTestId("empty-screenshare-button").click();
  await page.getByRole("button", { name: "Escolher o que compartilhar" }).click();
  await expect(
    page.getByRole("button", { name: "Parar compartilhamento" }),
  ).toBeVisible();

  for (const [width, height] of [
    [1366, 768],
    [1600, 900],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    const row = await commandRowSpread(page);
    expect(row.count).toBeGreaterThan(3);
    expect(row.spread).toBeLessThan(16);
    expect(row.overflow).toBeLessThanOrEqual(1);
  }
});
