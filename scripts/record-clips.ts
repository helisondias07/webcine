/**
 * Grava clips de navegação real do webcinetv.com.br para o vídeo Remotion.
 * Uso: npx ts-node --esm scripts/record-clips.ts
 *
 * Gera 4 clips .webm em video/public/clips/:
 *   clip_home.webm     — home page carregando + scroll suave
 *   clip_room.webm     — sala de watch com o app funcionando
 *   clip_features.webm — seção de recursos da plataforma
 *   clip_mobile.webm   — experiência mobile
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://webcinetv.com.br';
const CLIPS_DIR = path.resolve(__dirname, '../video/public/clips');

async function record() {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // ─── Clip 1: Home — carregamento + scroll suave (6s) ───────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: CLIPS_DIR, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Scroll suave até "Recursos da plataforma"
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy({ top: 80, behavior: 'smooth' }));
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1000);

    // Hover no botão "Nova sala"
    const novaBtn = page.locator('button, a').filter({ hasText: /nova sala/i }).first();
    if (await novaBtn.isVisible()) {
      await novaBtn.hover();
      await page.waitForTimeout(600);
    }
    await page.waitForTimeout(800);

    await ctx.close(); // fecha e salva o .webm

    // Renomeia o arquivo gerado (Playwright gera nome aleatório)
    const files = fs.readdirSync(CLIPS_DIR).filter(f => f.endsWith('.webm'));
    const latest = files.map(f => ({ f, t: fs.statSync(path.join(CLIPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0]?.f;
    if (latest) fs.renameSync(path.join(CLIPS_DIR, latest), path.join(CLIPS_DIR, 'clip_home.webm'));
    console.log('✓ clip_home.webm');
  }

  // ─── Clip 2: Sala de watch (5s) ────────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: CLIPS_DIR, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/create`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Digita um nome no campo do modal (force: true ignora o overlay do Mantine)
    const nicknameInput = page.locator('input[placeholder="Seu nome"]').first();
    await nicknameInput.click({ force: true });
    await page.waitForTimeout(300);
    await nicknameInput.fill('helison', { force: true });
    await page.waitForTimeout(400);

    // Clica em algumas cores de avatar
    const colors = page.locator('[data-mantine-color-scheme] button, .mantine-ColorSwatch-root, [class*="swatch"]');
    const count = await colors.count();
    for (let i = 1; i < Math.min(4, count); i++) {
      await colors.nth(i).click({ force: true });
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(500);

    // Hover no botão de entrar
    const enterBtn = page.locator('button').filter({ hasText: /entrar na sala/i }).first();
    await enterBtn.hover({ force: true });
    await page.waitForTimeout(800);
    await page.waitForTimeout(600);

    await ctx.close();

    const files = fs.readdirSync(CLIPS_DIR).filter(f => f.endsWith('.webm') && !['clip_home.webm'].includes(f));
    const latest = files.map(f => ({ f, t: fs.statSync(path.join(CLIPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0]?.f;
    if (latest) fs.renameSync(path.join(CLIPS_DIR, latest), path.join(CLIPS_DIR, 'clip_room.webm'));
    console.log('✓ clip_room.webm');
  }

  // ─── Clip 3: Recursos da plataforma — carrossel (5s) ───────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: CLIPS_DIR, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Scroll direto para a seção de recursos
    await page.evaluate(() => {
      const el = document.querySelector('[class*="section"], h2, h3');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      else window.scrollBy({ top: 400, behavior: 'smooth' });
    });
    await page.waitForTimeout(800);

    // Clica no próximo item do carrossel de recursos
    const nextBtn = page.locator('button[aria-label*="próximo"], button[aria-label*="next"], [class*="arrow"], [class*="next"]').first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(700);
      await nextBtn.click();
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(1000);

    await ctx.close();

    const done = new Set(['clip_home.webm', 'clip_room.webm']);
    const files = fs.readdirSync(CLIPS_DIR).filter(f => f.endsWith('.webm') && !done.has(f));
    const latest = files.map(f => ({ f, t: fs.statSync(path.join(CLIPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0]?.f;
    if (latest) fs.renameSync(path.join(CLIPS_DIR, latest), path.join(CLIPS_DIR, 'clip_features.webm'));
    console.log('✓ clip_features.webm');
  }

  // ─── Clip 4: Mobile (5s) ───────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      recordVideo: { dir: CLIPS_DIR, size: { width: 390, height: 844 } },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // Scroll suave
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy({ top: 100, behavior: 'smooth' }));
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);

    await ctx.close();

    const done = new Set(['clip_home.webm', 'clip_room.webm', 'clip_features.webm']);
    const files = fs.readdirSync(CLIPS_DIR).filter(f => f.endsWith('.webm') && !done.has(f));
    const latest = files.map(f => ({ f, t: fs.statSync(path.join(CLIPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0]?.f;
    if (latest) fs.renameSync(path.join(CLIPS_DIR, latest), path.join(CLIPS_DIR, 'clip_mobile.webm'));
    console.log('✓ clip_mobile.webm');
  }

  await browser.close();
  console.log('\nTodos os clips salvos em:', CLIPS_DIR);
}

record().catch((e) => {
  console.error(e);
  process.exit(1);
});
