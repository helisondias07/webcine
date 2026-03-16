/**
 * Grava clips de navegação real do WebCineTV (localhost) para o vídeo Remotion.
 * Uso: npx tsx scripts/record-clips.ts
 *
 * Pré-requisito: npm run dev:all rodando em outro terminal.
 *
 * Gera os clips em video/public/clips/:
 *   clip_home.webm        — home + clique "Nova Sala" + sala com vídeo rodando (~14s)
 *   clip_room_active.webm — sala ativa com chat (~10s)
 *   clip_features.webm    — carrossel de recursos da home (~7s)
 *   clip_mobile.webm      — experiência mobile (~6s)
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BASE_URL  = 'http://localhost:5173';
const CLIPS_DIR = path.resolve(__dirname, '../video/public/clips');

// MP4 direto — usa o player HTML5 nativo, reproduz sem restrições em headless
// (YouTube bloqueia autoplay em Chromium headless mesmo com --autoplay-policy)
const DEMO_VIDEO = 'https://www.youtube.com/watch?v=TZE9gVF1QbA';

/** Renomeia src para dest, deletando dest antes se já existir (evita EPERM no Windows) */
function safeRename(src: string, dest: string) {
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(src, dest);
}

/** Retorna o .webm mais recente em CLIPS_DIR que não esteja na lista de excluídos */
function latestWebm(exclude: string[]): string | undefined {
  const excluded = new Set(exclude);
  return fs
    .readdirSync(CLIPS_DIR)
    .filter(f => f.endsWith('.webm') && !excluded.has(f))
    .map(f => ({ f, t: fs.statSync(path.join(CLIPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f;
}

/** Remove temp files (.webm sem nome definido) que ficaram de gravações anteriores com falha */
function cleanTempFiles() {
  const named = new Set(['clip_home.webm', 'clip_home_p3.webm', 'clip_room_active.webm', 'clip_features.webm', 'clip_mobile.webm', 'clip_room.webm']);
  fs.readdirSync(CLIPS_DIR)
    .filter(f => f.endsWith('.webm') && !named.has(f))
    .forEach(f => { try { fs.unlinkSync(path.join(CLIPS_DIR, f)); } catch {} });
}

async function record() {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
  cleanTempFiles();

  const browser = await chromium.launch({
    headless: false,
    args: ['--autoplay-policy=no-user-gesture-required', '--start-maximized'],
  });

  // ─── Clip 1: Home → Nova Sala → sala → vídeo → chat (~15s total) ──────────
  //
  //  SPLIT DO CLIP:
  //    0s – 7.5s  →  Parte 2: home + clique Nova Sala + modal + entrar na sala
  //    7.5s – 15s →  Parte 3: pesquisa de vídeo + vídeo rodando + chat ao vivo
  //
  {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: CLIPS_DIR, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();

    // ── PARTE 2 (0–7.5s): home → criar sala ─────────────────────────────────

    // 1. Carrega a home
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // 2. Scroll suave curto
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy({ top: 60, behavior: 'smooth' }));
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);

    // 3. Volta ao topo e destaca o botão
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(300);

    const novaBtn = page.locator('button').filter({ hasText: /nova sala/i }).first();
    await novaBtn.hover();
    await page.waitForTimeout(600);

    // 4. Clica em "Nova Sala" (~3.5s do início)
    await novaBtn.click();
    await page.waitForTimeout(2000); // sala + modal carregam

    // 5. Preenche nome
    const nameInput = page.locator('input[placeholder="Seu nome"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('WebCineTV', { force: true });
      await page.waitForTimeout(300);
    }

    // 6. Entra na sala (~6s do início)
    const enterBtn = page.locator('button').filter({ hasText: /entrar na sala/i }).first();
    if (await enterBtn.isVisible()) {
      await enterBtn.click({ force: true });
    }
    await page.waitForTimeout(1500); // sala carrega — chega em ~7.5s ✓

    // ── PARTE 3 (7.5s–15s): pesquisa de vídeo + 2 usuários no chat ─────────────

    // 7. Cola link do vídeo (~7.5s)
    const searchInput = page.locator('input[name="watchparty-media-search"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    if (await searchInput.isVisible()) {
      await searchInput.click({ force: true });
      await page.waitForTimeout(300);
      // type() dispara onChange do React (fill() não funciona com inputs controlados do Mantine)
      await page.keyboard.type(DEMO_VIDEO, { delay: 18 });
      await page.waitForTimeout(400);
      await searchInput.press('Enter');
      await page.waitForTimeout(4000); // aguarda iframe do YouTube carregar e iniciar
    }

    // 8. Clica no centro do player para dar play no YouTube
    const ytPlayer = page.locator('#leftYt').first();
    if (await ytPlayer.isVisible({ timeout: 4000 }).catch(() => false)) {
      await ytPlayer.click();
      await page.waitForTimeout(1500); // vídeo visível rodando antes do chat
    }

    // 9. Pega a URL da sala para o 2º usuário entrar
    const roomUrl = page.url(); // ex: http://localhost:5173/watch/ROOMID

    // 10. Abre contexto silencioso do 2º usuário na mesma sala
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();
    await page2.goto(roomUrl, { waitUntil: 'networkidle' });
    const nameInput2 = page2.locator('input[placeholder="Seu nome"]').first();
    if (await nameInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput2.fill('Ana');
      await page2.waitForTimeout(200);
      const enterBtn2 = page2.locator('button').filter({ hasText: /entrar na sala/i }).first();
      if (await enterBtn2.isVisible()) await enterBtn2.click({ force: true });
    }
    await page2.waitForTimeout(1500);

    // 11. Abre chat nos dois contextos se necessário
    const openChatBtn = page.locator('[data-testid="open-chat-button"]');
    if (await openChatBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await openChatBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
    const openChatBtn2 = page2.locator('[data-testid="open-chat-button"]');
    if (await openChatBtn2.isVisible({ timeout: 800 }).catch(() => false)) {
      await openChatBtn2.click({ force: true });
      await page2.waitForTimeout(300);
    }

    // 12. Chat alternado entre os dois usuários
    const chatInput1 = page.locator('input[placeholder="Digite uma mensagem..."]').first();
    const chatInput2 = page2.locator('input[placeholder="Digite uma mensagem..."]').first();
    await chatInput1.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await chatInput2.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    const conversation: Array<{ input: typeof chatInput1; msg: string }> = [
      { input: chatInput1, msg: 'que filme! 🎬' },
      { input: chatInput2, msg: 'demais haha, adorei essa cena' },
      { input: chatInput1, msg: '🍿🍿🍿' },
      { input: chatInput2, msg: 'tô aqui com a pipoca também 😂' },
    ];
    for (const { input, msg } of conversation) {
      if (await input.isVisible()) {
        await input.click({ force: true });
        await input.type(msg, { delay: 40 });
        await page.waitForTimeout(200);
        await input.press('Enter');
        await page.waitForTimeout(700);
      }
    }

    await page.waitForTimeout(500); // pausa final ✓

    await ctx2.close();
    await ctx.close();

    const f = latestWebm(['clip_room_active.webm', 'clip_features.webm', 'clip_mobile.webm']);
    if (f) safeRename(path.join(CLIPS_DIR, f), path.join(CLIPS_DIR, 'clip_home.webm'));
    console.log('✓ clip_home.webm');
  }

  // ─── Clip 2: Sala ativa com chat (~10s) ────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: CLIPS_DIR, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/create`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const nameInput = page.locator('input[placeholder="Seu nome"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('Ana', { force: true });
      await page.waitForTimeout(300);
    }

    const enterBtn = page.locator('button').filter({ hasText: /entrar na sala/i }).first();
    if (await enterBtn.isVisible()) {
      await enterBtn.click({ force: true });
    }
    await page.waitForTimeout(2000);

    const searchInputC2 = page.locator('input[name="watchparty-media-search"]').first();
    await searchInputC2.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    if (await searchInputC2.isVisible()) {
      await searchInputC2.click({ force: true });
      await page.waitForTimeout(300);
      await page.keyboard.type(DEMO_VIDEO, { delay: 18 });
      await page.waitForTimeout(400);
      await searchInputC2.press('Enter');
      await page.waitForTimeout(4000); // aguarda YouTube carregar
    }

    // Clica no centro do player para dar play
    const ytPlayerC2 = page.locator('#leftYt').first();
    if (await ytPlayerC2.isVisible({ timeout: 4000 }).catch(() => false)) {
      await ytPlayerC2.click();
      await page.waitForTimeout(1500); // vídeo visível rodando antes do chat
    }

    // Abre 2º usuário silencioso na mesma sala
    const roomUrlC2 = page.url();
    const ctxC2b = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageC2b = await ctxC2b.newPage();
    await pageC2b.goto(roomUrlC2, { waitUntil: 'networkidle' });
    const nameC2b = pageC2b.locator('input[placeholder="Seu nome"]').first();
    if (await nameC2b.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameC2b.fill('Carlos');
      const enterC2b = pageC2b.locator('button').filter({ hasText: /entrar na sala/i }).first();
      if (await enterC2b.isVisible()) await enterC2b.click({ force: true });
    }
    await pageC2b.waitForTimeout(1500);

    // Abre chat nos dois contextos se necessário
    const openBtn2 = page.locator('[data-testid="open-chat-button"]');
    if (await openBtn2.isVisible({ timeout: 800 }).catch(() => false)) {
      await openBtn2.click({ force: true });
      await page.waitForTimeout(500);
    }
    const openBtnC2b = pageC2b.locator('[data-testid="open-chat-button"]');
    if (await openBtnC2b.isVisible({ timeout: 800 }).catch(() => false)) {
      await openBtnC2b.click({ force: true });
      await pageC2b.waitForTimeout(300);
    }

    const chatInputC2a = page.locator('input[placeholder="Digite uma mensagem..."]').first();
    const chatInputC2b = pageC2b.locator('input[placeholder="Digite uma mensagem..."]').first();
    await chatInputC2a.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await chatInputC2b.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    const convC2: Array<{ input: typeof chatInputC2a; msg: string }> = [
      { input: chatInputC2a, msg: 'que filme incrível! 🎬' },
      { input: chatInputC2b, msg: 'adorei essa cena haha' },
      { input: chatInputC2a, msg: '🍿🍿🍿' },
      { input: chatInputC2b, msg: 'quero assistir de novo 😂' },
    ];
    for (const { input, msg } of convC2) {
      if (await input.isVisible()) {
        await input.click({ force: true });
        await input.type(msg, { delay: 40 });
        await input.press('Enter');
        await page.waitForTimeout(700);
      }
    }

    await page.waitForTimeout(1000);
    await ctxC2b.close();
    await ctx.close();

    const f = latestWebm(['clip_home.webm', 'clip_features.webm', 'clip_mobile.webm']);
    if (f) safeRename(path.join(CLIPS_DIR, f), path.join(CLIPS_DIR, 'clip_room_active.webm'));
    console.log('✓ clip_room_active.webm');
  }

  // ─── Clip 3: Carrossel de recursos da home (~7s) ───────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: CLIPS_DIR, size: { width: 1920, height: 1080 } },
    });
    const page = await ctx.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const el = document.querySelector('#recursos') as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      else window.scrollBy({ top: 500, behavior: 'smooth' });
    });
    await page.waitForTimeout(900);

    const nextBtn = page.locator('button[aria-label*="Próxima" i], button[aria-label*="next" i]').first();
    for (let i = 0; i < 2; i++) {
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(800);
      }
    }
    await page.waitForTimeout(1500);

    await ctx.close();

    const f = latestWebm(['clip_home.webm', 'clip_room_active.webm', 'clip_mobile.webm']);
    if (f) safeRename(path.join(CLIPS_DIR, f), path.join(CLIPS_DIR, 'clip_features.webm'));
    console.log('✓ clip_features.webm');
  }

  // ─── Clip 4: Mobile (~6s) ──────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      recordVideo: { dir: CLIPS_DIR, size: { width: 390, height: 844 } },
    });
    const page = await ctx.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy({ top: 100, behavior: 'smooth' }));
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);

    await ctx.close();

    const f = latestWebm(['clip_home.webm', 'clip_room_active.webm', 'clip_features.webm']);
    if (f) safeRename(path.join(CLIPS_DIR, f), path.join(CLIPS_DIR, 'clip_mobile.webm'));
    console.log('✓ clip_mobile.webm');
  }

  await browser.close();
  console.log('\nTodos os clips salvos em:', CLIPS_DIR);
}

record().catch(e => {
  console.error(e);
  process.exit(1);
});
