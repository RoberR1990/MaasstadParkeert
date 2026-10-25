// Captures the stijlproef screenshots with Playwright (chromium, software GL fallback).
// usage: node tools/shots.mjs [name ...]   (no names = all)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/`;
const only = process.argv.slice(2);

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch {} await sleep(200); }

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[browser]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

async function load(params) {
  console.log('load', params);
  await page.goto(BASE + '?manual=1&' + params, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
  await sleep(300);
}
const settle = async (ms = 1500) => { await page.evaluate((s) => window.__game.advance(s), ms / 1000); };
const shot = async (name) => { console.log('shooting', name); await page.screenshot({ path: OUT + name + '.png', timeout: 400000 }); console.log('saved', name); };
const want = (n) => only.length === 0 || only.includes(n);

const common = 'play=1&skiptut=1&pause=1&intro=0';
const jobs = {
  async '01-title'() { await load('intro=0&pause=1&hour=16.4&pressure=60'); await settle(2500); await shot('01-title'); },
  async '02-dag'() { await load(`${common}&hour=11.5&pressure=55`); await page.evaluate(() => window.__game.setPressure(0.55)); await settle(2500); await shot('02-dag'); },
  async '03-gouden-uur'() { await load(`${common}&hour=17.7&pressure=60`); await page.evaluate(() => window.__game.setPressure(0.6)); await settle(2500); await shot('03-gouden-uur'); },
  async '04-nacht'() { await load(`${common}&hour=23&pressure=60`); await page.evaluate(() => window.__game.setPressure(0.6)); await settle(2500); await shot('04-nacht'); },
  async '05-regen'() { await load(`${common}&hour=14&pressure=60&rain=1`); await page.evaluate(() => { window.__game.setRain(true); window.__game.setPressure(0.6); }); await settle(4000); await shot('05-regen'); },
  async '06-tutorial-stap1'() {
    await load('play=1&tutorial=1&pause=1&intro=0&hour=10.5&pressure=75');
    await page.evaluate(() => window.__game.setPressure(0.75));
    await settle(3500); await shot('06-tutorial-stap1');
  },
  async '07-garage-ghost'() {
    await load(`${common}&hour=16.5&pressure=80`);
    await page.evaluate(() => window.__game.setPressure(0.8));
    const id = await page.evaluate(() => { const g = window.__game; let best = null, bd = 1e9; for (const f of g.freeLots()) { const s = g.projectLot(f.id); const d = Math.hypot(s.x - 760, (s.y - 560) * 1.2); if (d < bd) { bd = d; best = f.id; } } return best; });
    await page.evaluate((id) => { window.__game.select('garage'); window.__game.hoverLot(id); }, id);
    await settle(1500); await shot('07-garage-ghost');
    await page.evaluate((id) => { window.__game.placeAt(id, 'garage'); }, id);
    await page.evaluate(() => window.__game.advance(0.3)); await shot('08-garage-plaatsen');
    await settle(4500); await shot('09-garage-geplaatst');
  },
  async '10-hoge-druk'() { await load(`${common}&hour=15&pressure=100`); await page.evaluate(() => window.__game.setPressure(1.0)); await settle(2500); await shot('10-hoge-druk'); },
};
for (const [k, fn] of Object.entries(jobs)) {
  if (!want(k) && !(only.some((o) => k.startsWith(o)))) continue;
  try { await fn(); } catch (e) { console.log('FAILED', k, e.message); }
}
const fps = await page.evaluate(() => window.__game?.fps).catch(() => null);
console.log('last fps (software GL, not representative):', fps);
await browser.close();
server.kill();
process.exit(0);
