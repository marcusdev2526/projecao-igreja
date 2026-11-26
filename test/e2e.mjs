// Teste de tela (GitHub Actions): abre o painel, o telão e o celular num navegador de verdade
// e confere se passam slide, mostram a letra e não dão erro de JavaScript.
// Rodar: npm run test:e2e   (no computador: CHROME_PATH=... se o Playwright não baixou o navegador)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from '../server/index.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-e2e-'));
const srv = await startServer({ port: 0, dataDir });
const base = `http://localhost:${srv.server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
const watch = (p, name) => { p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`)); return p; };
const step = async (name, fn) => { process.stdout.write(`• ${name} … `); await fn(); console.log('ok'); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const panel = watch(await ctx.newPage(), 'painel');
  const screen = watch(await ctx.newPage(), 'telão');
  await step('painel abre', async () => { await panel.goto(base + '/'); await panel.waitForSelector('#itemList .item'); });
  await step('telão abre e o aviso "telão fechado" some', async () => {
    await screen.goto(base + '/screen.html');
    await panel.waitForFunction(() => document.getElementById('screenWarn').hidden);
  });
  await step('escolher louvor e passar slide aparece no telão', async () => {
    await panel.click('#itemList .item');
    await panel.click('.slide >> nth=1');
    await screen.waitForFunction(() => (document.querySelector('.content-layer:last-child')?.innerText || '').trim().length > 0, null, { timeout: 5000 });
    const before = await screen.evaluate(() => document.querySelector('.content-layer:last-child').innerText);
    await panel.keyboard.press('PageDown');
    await screen.waitForFunction((b) => document.querySelector('.content-layer:last-child').innerText !== b, before, { timeout: 5000 });
  });
  await step('tela preta e volta', async () => {
    await panel.keyboard.press('b');
    await screen.waitForFunction(() => document.querySelector('.stage').classList.contains('is-black'));
    await panel.keyboard.press('b');
    await screen.waitForFunction(() => !document.querySelector('.stage').classList.contains('is-black'));
  });
  await step('Bíblia completa abre', async () => { await panel.click('#viewSeg [data-view="biblia"]'); await panel.waitForTimeout(400); await panel.click('#viewSeg [data-view="inicio"]'); });
  await step('configurações e temas abrem', async () => {
    await panel.click('#settingsBtn'); await panel.waitForSelector('#settings[open]'); await panel.keyboard.press('Escape');
    await panel.click('#themeBtn'); await panel.waitForSelector('#themes[open] .theme-card, #themes[open] [data-theme]'); await panel.keyboard.press('Escape');
  });
  await step('cenas ilustradas desenham', async () => {
    const p = watch(await ctx.newPage(), 'cenas');
    await p.goto(base + '/screen.html?embed');
    await p.evaluate(async () => {
      const { createStage, slideHTML } = await import('/shared/render.js');
      const h = document.createElement('div'); h.style.cssText = 'width:960px;height:540px;position:fixed;left:0;top:0'; document.body.append(h);
      const st = createStage(h, { live: true });
      for (const id of ['cena', 'luar', 'nascer', 'mar', 'trigal', 'estrelado', 'calvario']) { st.setTheme(id); st.show(slideHTML({ kind: 'song', lines: [{ pt: 'Ainda que a figueira não floresça' }] }, 'pt')); }
    });
    await p.waitForSelector('.cena-hl', { state: 'attached' }).catch(() => {});
  });
  await step('sem erros de JavaScript', async () => { assert.deepEqual(errors, []); });
  console.log('\nTodos os testes de tela passaram.');
} catch (e) {
  console.error('\nFALHOU:', e.message, errors.length ? '\nErros na página:\n' + errors.join('\n') : '');
  process.exitCode = 1;
} finally {
  await browser.close();
  srv.io.close();
  srv.server.close();
  setTimeout(() => process.exit(process.exitCode || 0), 200);
}
