/**
 * Grava um clip da sala de watch ativa no webcinetv.com.br:
 * entra como convidado, cola um link de vídeo e simula chat.
 *
 * Uso: npx ts-node --esm scripts/record-room-active.ts
 * Saída: video/public/clips/clip_room_active.webm
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL   = 'https://webcinetv.com.br';
const CLIPS_DIR  = path.resolve(__dirname, '../video/public/clips');

// Vídeo público que toca sem restrições em headless (Big Buck Bunny)
const DEMO_VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

async function record() {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: CLIPS_DIR, size: { width: 1920, height: 1080 } },
  });

  const page = await ctx.newPage();

  // ── 1. Criar sala ───────────────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/create`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ── 2. Preencher nome no modal de convidado ─────────────────────────────────
  const nameInput = page.locator('input[placeholder="Seu nome"]').first();
  await nameInput.fill('Ana', { force: true });
  await page.waitForTimeout(400);

  // Selecionar uma cor (amarelo — índice 1)
  const colors = page.locator('.mantine-Modal-content button');
  const count  = await colors.count();
  if (count > 1) {
    await colors.nth(1).click({ force: true });
    await page.waitForTimeout(250);
  }

  // ── 3. Entrar na sala ───────────────────────────────────────────────────────
  const enterBtn = page.locator('button').filter({ hasText: /entrar na sala/i }).first();
  await enterBtn.click({ force: true });
  await page.waitForTimeout(2500); // aguarda sala carregar

  // ── 4. Colar link do vídeo ─────────────────────────────────────────────────
  const searchInput = page.locator('input[name="watchparty-media-search"]').first();
  await searchInput.click({ force: true });
  await page.waitForTimeout(300);
  await searchInput.fill(DEMO_VIDEO);
  await page.waitForTimeout(500);
  await searchInput.press('Enter');
  await page.waitForTimeout(3500); // aguarda vídeo iniciar

  // ── 5. Simular mensagens de chat ────────────────────────────────────────────
  // Abre o chat
  const chatBtn = page.locator('[class*="chatToggle"], button[aria-label*="chat"], button[aria-label*="Chat"]').first();
  if (await chatBtn.isVisible()) {
    await chatBtn.click({ force: true });
    await page.waitForTimeout(600);
  }

  const chatMessages = [
    'que filme incrível! 🎬',
    'adorei essa cena haha',
    '🍿🍿🍿',
  ];

  for (const msg of chatMessages) {
    const chatInput = page.locator('input[placeholder*="mensagem"], textarea[placeholder*="mensagem"], [class*="chatInput"] input').first();
    if (await chatInput.isVisible()) {
      await chatInput.click({ force: true });
      await chatInput.type(msg, { delay: 60 });
      await page.waitForTimeout(200);
      await chatInput.press('Enter');
      await page.waitForTimeout(700);
    }
  }

  await page.waitForTimeout(1500);

  // ── 6. Fechar e salvar ──────────────────────────────────────────────────────
  await ctx.close();

  // Renomear o .webm gerado (nome aleatório do Playwright)
  const existing = new Set(
    fs.readdirSync(CLIPS_DIR)
      .filter(f => f.endsWith('.webm') && f !== 'clip_room_active.webm')
      .filter(f => ['clip_home.webm','clip_room.webm','clip_features.webm','clip_mobile.webm'].includes(f) === false)
  );

  const allFiles = fs.readdirSync(CLIPS_DIR).filter(f => f.endsWith('.webm') && !existing.has(f));
  const candidate = allFiles
    .filter(f => !['clip_home.webm','clip_room.webm','clip_features.webm','clip_mobile.webm','clip_room_active.webm'].includes(f))
    .map(f => ({ f, t: fs.statSync(path.join(CLIPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f;

  if (candidate) {
    fs.renameSync(path.join(CLIPS_DIR, candidate), path.join(CLIPS_DIR, 'clip_room_active.webm'));
    console.log('✓ clip_room_active.webm salvo em', CLIPS_DIR);
  } else {
    console.warn('⚠ Nenhum arquivo novo encontrado para renomear.');
  }

  await browser.close();
}

record().catch(e => { console.error(e); process.exit(1); });
