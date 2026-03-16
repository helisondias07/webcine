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

/**
 * Registra um init script no contexto que injeta CSS de hide-scrollbar em
 * toda navegação (incluindo SPAs e redirects) antes dos scripts da página.
 */
async function registerHideScrollbars(ctx: import('@playwright/test').BrowserContext) {
  await ctx.addInitScript(() => {
    const injectStyle = () => {
      const id = '__no_scrollbar__';
      if (document.getElementById(id)) return;
      const s = document.createElement('style');
      s.id = id;
      s.textContent = '::-webkit-scrollbar{display:none!important;width:0!important}*{scrollbar-width:none!important}';
      (document.head || document.documentElement).appendChild(s);
    };
    // Injeta imediatamente e também após DOMContentLoaded (para SPAs)
    injectStyle();
    document.addEventListener('DOMContentLoaded', injectStyle);
  });
}

/** Injeta CSS que esconde todas as scrollbars em uma página já carregada */
async function hideScrollbars(page: import('@playwright/test').Page) {
  await page.addStyleTag({ content: '::-webkit-scrollbar{display:none!important;width:0!important}*{scrollbar-width:none!important}' }).catch(() => {});
}

/** Remove temp files (.webm sem nome definido) que ficaram de gravações anteriores com falha */
function cleanTempFiles() {
  const named = new Set(['clip_home.webm', 'clip_home_v.webm', 'clip_home_p3.webm', 'clip_room_active.webm', 'clip_features.webm', 'clip_mobile.webm', 'clip_room.webm']);
  fs.readdirSync(CLIPS_DIR)
    .filter(f => f.endsWith('.webm') && !named.has(f))
    .forEach(f => { try { fs.unlinkSync(path.join(CLIPS_DIR, f)); } catch {} });
}

async function record() {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
  cleanTempFiles();

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--force-device-scale-factor=1',
      '--high-dpi-support=1',
    ],
  });

  // ─── Clip 1: Home → Nova Sala → sala → vídeo → chat (~15s total) ──────────
  //
  //  SPLIT DO CLIP:
  //    0s – 7.5s  →  Parte 2: home + clique Nova Sala + modal + entrar na sala
  //    7.5s – 15s →  Parte 3: pesquisa de vídeo + vídeo rodando + chat ao vivo
  //
  {
    const ctx = await browser.newContext({
      viewport: { width: 1360, height: 765 },
      deviceScaleFactor: 1,
      recordVideo: { dir: CLIPS_DIR, size: { width: 1360, height: 765 } },
    });
    await registerHideScrollbars(ctx);
    const page = await ctx.newPage();

    // ── PARTE 2 (0–7.5s): home → criar sala ─────────────────────────────────

    // 1. Carrega a home
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await hideScrollbars(page);
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

    // ── PARTE 3 (7.5s+): pesquisa de vídeo + 2 usuários no chat ─────────────

    // 7. Cola link do vídeo — inicia ctx2 em paralelo enquanto YouTube carrega
    const roomUrl = page.url();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();

    const searchInput = page.locator('input[name="watchparty-media-search"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    if (await searchInput.isVisible()) {
      await searchInput.click({ force: true });
      await page.waitForTimeout(300);
      await page.keyboard.type(DEMO_VIDEO, { delay: 18 });
      await page.waitForTimeout(300);
      await searchInput.press('Enter');
    }

    // 8. Carrega YouTube + entra ctx2 em paralelo (economiza ~3s)
    const ytPlayer = page.locator('#leftYt').first();
    await Promise.all([
      // Aguarda player aparecer e dá play
      ytPlayer.waitFor({ state: 'visible', timeout: 8000 })
        .then(() => page.waitForTimeout(600))
        .then(() => ytPlayer.click())
        .then(() => page.waitForTimeout(800))
        .catch(() => {}),
      // Simultaneamente: ctx2 navega, preenche nome e entra na sala
      page2.goto(roomUrl, { waitUntil: 'networkidle' })
        .then(async () => {
          const nameInput2 = page2.locator('input[placeholder="Seu nome"]').first();
          if (await nameInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
            await nameInput2.fill('Ana');
            await page2.waitForTimeout(150);
            const enterBtn2 = page2.locator('button').filter({ hasText: /entrar na sala/i }).first();
            if (await enterBtn2.isVisible()) await enterBtn2.click({ force: true });
          }
        })
        .catch(() => {}),
    ]);

    await page.waitForTimeout(600); // pausa breve com vídeo visível

    // 9. Abre chat nos dois contextos se necessário
    const openChatBtn = page.locator('[data-testid="open-chat-button"]');
    if (await openChatBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await openChatBtn.click({ force: true });
      await page.waitForTimeout(400);
    }
    const openChatBtn2 = page2.locator('[data-testid="open-chat-button"]');
    if (await openChatBtn2.isVisible({ timeout: 800 }).catch(() => false)) {
      await openChatBtn2.click({ force: true });
      await page2.waitForTimeout(200);
    }

    // 10. Chat alternado entre os dois usuários
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
        await page.waitForTimeout(150);
        await input.press('Enter');
        await page.waitForTimeout(650);
      }
    }

    await page.waitForTimeout(600); // pausa final com último chat visível

    await ctx2.close();
    await ctx.close();

    const f = latestWebm(['clip_room_active.webm', 'clip_features.webm', 'clip_mobile.webm']);
    if (f) safeRename(path.join(CLIPS_DIR, f), path.join(CLIPS_DIR, 'clip_home.webm'));
    console.log('✓ clip_home.webm');
  }

  // ─── Clip 2: Sala ativa com chat (~10s) ────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1360, height: 765 },
      deviceScaleFactor: 1,
      recordVideo: { dir: CLIPS_DIR, size: { width: 1360, height: 765 } },
    });
    await registerHideScrollbars(ctx);
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/create`, { waitUntil: 'networkidle' });
    await hideScrollbars(page);
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
      viewport: { width: 1360, height: 765 },
      deviceScaleFactor: 1,
      recordVideo: { dir: CLIPS_DIR, size: { width: 1360, height: 765 } },
    });
    await registerHideScrollbars(ctx);
    const page = await ctx.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await hideScrollbars(page);
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
      deviceScaleFactor: 1,
      recordVideo: { dir: CLIPS_DIR, size: { width: 390, height: 844 } },
    });
    await registerHideScrollbars(ctx);
    const page = await ctx.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await hideScrollbars(page);
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

  // ─── Clip 5: Vertical Reels (540×960) — mesma flow do clip_home ───────────
  //
  //  Grava no viewport mobile 540×960 para que o app renderize o layout
  //  responsivo. O Remotion escala para 1080×1920 via objectFit: 'cover'.
  //
  //    0s – 7.5s  →  home + criar sala (Parte 2 Reels)
  //    7.5s – 15s →  vídeo + chat (Parte 3 Reels)
  //
  {
    const ctx = await browser.newContext({
      viewport: { width: 540, height: 960 },
      deviceScaleFactor: 1,
      recordVideo: { dir: CLIPS_DIR, size: { width: 540, height: 960 } },
    });
    await registerHideScrollbars(ctx);
    const page = await ctx.newPage();

    // ── PARTE 2 (0–7.5s): home → criar sala ─────────────────────────────────

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await hideScrollbars(page);
    await page.waitForTimeout(1200);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy({ top: 60, behavior: 'smooth' }));
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(300);

    const novaBtn = page.locator('button').filter({ hasText: /nova sala/i }).first();
    await novaBtn.hover();
    await page.waitForTimeout(600);
    await novaBtn.click();
    await page.waitForTimeout(2000);

    const nameInput = page.locator('input[placeholder="Seu nome"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('WebCineTV', { force: true });
      await page.waitForTimeout(300);
    }

    const enterBtn = page.locator('button').filter({ hasText: /entrar na sala/i }).first();
    if (await enterBtn.isVisible()) await enterBtn.click({ force: true });
    await page.waitForTimeout(1500);

    // ── PARTE 3 (7.5s+): vídeo + chat ───────────────────────────────────────

    const roomUrlV = page.url();
    const ctx2v = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2v = await ctx2v.newPage();

    const searchInput = page.locator('input[name="watchparty-media-search"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    if (await searchInput.isVisible()) {
      await searchInput.click({ force: true });
      await page.waitForTimeout(300);
      await page.keyboard.type(DEMO_VIDEO, { delay: 18 });
      await page.waitForTimeout(300);
      await searchInput.press('Enter');
    }

    const ytPlayerV = page.locator('#leftYt').first();
    await Promise.all([
      ytPlayerV.waitFor({ state: 'visible', timeout: 8000 })
        .then(() => page.waitForTimeout(600))
        .then(() => ytPlayerV.click())
        .then(() => page.waitForTimeout(800))
        .catch(() => {}),
      page2v.goto(roomUrlV, { waitUntil: 'networkidle' })
        .then(async () => {
          const nameInput2 = page2v.locator('input[placeholder="Seu nome"]').first();
          if (await nameInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
            await nameInput2.fill('Ana');
            await page2v.waitForTimeout(150);
            const enterBtn2 = page2v.locator('button').filter({ hasText: /entrar na sala/i }).first();
            if (await enterBtn2.isVisible()) await enterBtn2.click({ force: true });
          }
        })
        .catch(() => {}),
    ]);

    await page.waitForTimeout(600);

    // Abre chat
    const openChatBtnV = page.locator('[data-testid="open-chat-button"]');
    if (await openChatBtnV.isVisible({ timeout: 800 }).catch(() => false)) {
      await openChatBtnV.click({ force: true });
      await page.waitForTimeout(400);
    }
    const openChatBtn2V = page2v.locator('[data-testid="open-chat-button"]');
    if (await openChatBtn2V.isVisible({ timeout: 800 }).catch(() => false)) {
      await openChatBtn2V.click({ force: true });
      await page2v.waitForTimeout(200);
    }

    const chatInput1V = page.locator('input[placeholder="Digite uma mensagem..."]').first();
    const chatInput2V = page2v.locator('input[placeholder="Digite uma mensagem..."]').first();
    await chatInput1V.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await chatInput2V.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    const conversationV: Array<{ input: typeof chatInput1V; msg: string }> = [
      { input: chatInput1V, msg: 'que filme! 🎬' },
      { input: chatInput2V, msg: 'demais haha, adorei essa cena' },
      { input: chatInput1V, msg: '🍿🍿🍿' },
      { input: chatInput2V, msg: 'tô aqui com a pipoca também 😂' },
    ];
    for (const { input, msg } of conversationV) {
      if (await input.isVisible()) {
        await input.click({ force: true });
        await input.type(msg, { delay: 40 });
        await page.waitForTimeout(150);
        await input.press('Enter');
        await page.waitForTimeout(650);
      }
    }

    await page.waitForTimeout(600);
    await ctx2v.close();
    await ctx.close();

    const f = latestWebm(['clip_home.webm', 'clip_room_active.webm', 'clip_features.webm', 'clip_mobile.webm']);
    if (f) safeRename(path.join(CLIPS_DIR, f), path.join(CLIPS_DIR, 'clip_home_v.webm'));
    console.log('✓ clip_home_v.webm');
  }

  await browser.close();
  console.log('\nTodos os clips salvos em:', CLIPS_DIR);
}

record().catch(e => {
  console.error(e);
  process.exit(1);
});
