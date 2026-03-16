/**
 * Captura screenshots reais do webcinetv.com.br para o vídeo demo Remotion.
 * Uso: npx ts-node --esm scripts/capture-screenshots.ts
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://webcinetv.com.br';
const OUT_DIR = path.resolve(__dirname, '../video/public');

async function capture() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // --- 1. Home hero (1920x1080) ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'sc_home.png') });
    console.log('✓ sc_home.png');
    await ctx.close();
  }

  // --- 2. Página /create ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/create`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, 'sc_create.png') });
    console.log('✓ sc_create.png');
    await ctx.close();
  }

  // --- 3. Home scrollado para "Recursos da plataforma" ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // Scroll para a seção de recursos
    await page.evaluate(() => {
      const el = document.querySelector('h2, h3, [class*="section"], [class*="features"]');
      if (el) el.scrollIntoView({ behavior: 'instant' });
      else window.scrollBy(0, 500);
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, 'sc_features.png') });
    console.log('✓ sc_features.png');
    await ctx.close();
  }

  // --- 4. Mobile home (390x844) ---
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'sc_mobile.png') });
    console.log('✓ sc_mobile.png');
    await ctx.close();
  }

  // --- 5. Home full page ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT_DIR, 'sc_full.png'), fullPage: true });
    console.log('✓ sc_full.png');
    await ctx.close();
  }

  await browser.close();
  console.log('\nTodos os screenshots salvos em:', OUT_DIR);
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
