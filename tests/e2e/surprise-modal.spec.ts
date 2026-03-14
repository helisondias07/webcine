import { expect, test, type Page } from "@playwright/test";

async function createRoom(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Nova sala" }).first().click();
  await expect(page).toHaveURL(/\/watch\/[a-z0-9-]+/);
  await page.getByPlaceholder("Seu apelido ou nome").fill("Surprise QA");
  await page.getByRole("button", { name: "Entrar na sala" }).click();
  await expect(page.locator("#watchPlayerShell")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("watchparty-showchatcolumn", "0");
    window.localStorage.setItem("watchparty-username", "Surprise QA");
  });

  await page.route("**/surprise/video**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        category: "gaming",
        items: [
          {
            id: "abc123",
            url: "https://www.youtube.com/watch?v=abc123",
            title: "Gaming Highlights",
            channel: "Canal QA",
            thumbnail: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
            views: 240000,
          },
        ],
      }),
    });
  });

  await page.route("**/surprise/providers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        region: "BR",
        providers: [
          {
            key: "netflix",
            label: "Netflix",
            providerId: 8,
            providerName: "Netflix",
            logoPath: "/logo.png",
          },
        ],
      }),
    });
  });

  await page.route("**/surprise/movies**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [
          {
            id: 100,
            title: "Filme Teste",
            release_date: "2021-01-01",
            vote_average: 8.3,
            overview: "Resumo de teste do filme.",
            poster_path: "/poster.jpg",
            backdrop_path: "/backdrop.jpg",
          },
        ],
      }),
    });
  });

  await page.route("**/surprise/movie/100**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        movie: {
          id: 100,
          title: "Filme Teste",
          release_date: "2021-01-01",
          runtime: 120,
          vote_average: 8.3,
          overview: "Resumo de teste do filme com detalhes.",
          poster_path: "/poster.jpg",
          backdrop_path: "/backdrop.jpg",
          genres: [{ id: 28, name: "Ação" }],
        },
        watchLink: "https://www.justwatch.com/br/filme-teste",
        platform: {
          id: 8,
          name: "Netflix",
          logoPath: "/logo.png",
        },
      }),
    });
  });
});

test("abre modal, sugere video e permite iniciar assistir junto", async ({ page }) => {
  await createRoom(page);

  await page.getByTestId("empty-surprise-button").click();
  await expect(page.getByTestId("surprise-dialog")).toBeVisible();

  await page.getByRole("button", { name: "Me surpreenda ✦" }).click();
  await expect(page.getByText("Gaming Highlights")).toBeVisible();

  await page.getByRole("button", { name: "Assistir junto!" }).click();
  await expect(page.getByTestId("surprise-dialog")).toBeHidden();
});

test("filme retorna sugestao ao selecionar plataforma", async ({ page }) => {
  await createRoom(page);

  await page.getByTestId("empty-surprise-button").click();
  await page.getByRole("button", { name: "Filme" }).click();

  await page.getByRole("button", { name: "Netflix" }).click();
  await page.getByRole("button", { name: "Me surpreenda ✦" }).click();
  await expect(page.getByText("Filme Teste")).toBeVisible();
});
