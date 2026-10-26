// Captures the round-2 screenshots with Playwright (chromium, software GL). Foreground, manual stepping (?manual=1).
// usage: node tools/shots.mjs [name-prefix ...]   (no names = all)   -> screenshots/r2/
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = new URL('../screenshots/r2/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/`;
const only = process.argv.slice(2);

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch {} await sleep(200); }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pages = {};
async function pageFor(kind) {
  if (pages[kind]) return pages[kind];
  const phone = kind === 'phone';
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/parallel_shader|GPU stall|swiftshader/i.test(m.text())) console.log('[browser]', m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  pages[kind] = page;
  return page;
}
let page;
async function load(kind, params) {
  page = await pageFor(kind);
  console.log('load', kind, params);
  await page.goto(BASE + '?manual=1&q=high&' + params, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 });
  await sleep(300);
}
const settle = async (s = 1.5) => { await page.evaluate((x) => window.__game.advance(x), s); };
const shot = async (name) => { await sleep(900); console.log('shooting', name); await page.screenshot({ path: OUT + name + '.png', timeout: 400000 }); console.log('saved', name); };
const g = (fn, arg) => page.evaluate(fn, arg);

const common = 'play=1&skiptut=1&pause=1&intro=0';
const jobs = {
  async '01-overzicht-dag'() { await load('desk', `${common}&hour=11.5&pressure=55`); await settle(8); await shot('01-overzicht-dag'); },
  async '02-blaak-close'() { await load('desk', `${common}&hour=15&pressure=55&cam=58,-4,52,2.5,1.12`); await settle(6); await shot('02-blaak-close'); },
  async '03-kopvanzuid-gouden-uur'() { await load('desk', `${common}&hour=17.7&pressure=55&cam=-18,48,80,0.35,1.1`); await settle(6); await shot('03-kopvanzuid-gouden-uur'); },
  async '04-nacht-overzicht'() { await load('desk', `${common}&hour=23&pressure=60`); await settle(8); await shot('04-nacht-overzicht'); },
  async '05-wedstrijddag'() { await load('desk', `${common}&hour=20.4&pressure=55&cam=70,52,110,-0.35,1.0`); await g(() => window.__game.startEvent('wedstrijd')); await settle(22); await shot('05-wedstrijddag'); },
  async '06-gorilla'() { await load('desk', `${common}&hour=13&pressure=55&cam=48,-52,70,0.5,1.05`); await g(() => window.__game.startEvent('gorilla')); await settle(11); await shot('06-gorilla'); },
  async '07-garage-ghost'() {
    await load('desk', `${common}&hour=16.5&pressure=80&cam=16,-9,70,2.72,1.0`);
    await g(() => window.__game.setPressure(0.8));
    await g(() => { window.__game.select('garage'); window.__game.hoverLot(4); });
    await settle(1.5); await shot('07-garage-ghost');
    await g(() => { window.__game.placeAt(4, 'garage'); window.__game.hoverLot(null); });
    await g(() => window.__game.advance(0.3)); await shot('08-garage-geplaatst-start');
    await settle(5); await shot('08-garage-geplaatst');
  },
  async '09-tutorial-stap1'() { await load('desk', 'play=1&tutorial=1&pause=1&intro=0&hour=10.5&pressure=75'); await g(() => window.__game.setPressure(0.75)); await settle(5); await shot('09-tutorial-stap1'); },
  async '10-regen-slogan'() { await load('desk', `${common}&hour=14&pressure=60`); await g(() => { window.__game.setRain(true); window.__game.toast('Steden schuilen niet wanneer het regent.'); }); await settle(5); await shot('10-regen-slogan'); },
  async '11-labels'() { await load('desk', `${common}&hour=12&pressure=50&labels=1`); await settle(3); await shot('11-labels'); },
  async '13-centraal-station'() { await load('desk', `${common}&hour=15&pressure=55&cam=0,-62,95,0.25,0.95`); await settle(5); await shot('13-centraal-station'); },
  async '14-kuip'() { await load('desk', `${common}&hour=16&pressure=55&cam=77,67,80,-0.6,0.95`); await settle(5); await shot('14-kuip'); },
  async '15-kleinpolder'() { await load('desk', `${common}&hour=14&pressure=55&cam=-88,-60,75,0.9,0.95`); await settle(5); await shot('15-kleinpolder'); },
  async '16-euromast-museumpark'() { await load('desk', `${common}&hour=14&pressure=55&cam=-52,0,80,2.0,0.95`); await settle(5); await shot('16-euromast-museumpark'); },
  async '17-erasmusbrug'() { await load('desk', `${common}&hour=14&pressure=55&cam=6,44,150,2.75,1.15`); await settle(5); await shot('17-erasmusbrug'); },
  async '12-sap-kaart'() { await load('desk', `${common}&hour=12&pressure=50`); await g(() => window.__game.showSap()); await settle(2); await shot('12-sap-kaart'); },
  async 'phone-01-overzicht'() { await load('phone', `${common}&hour=11.5&pressure=55`); await settle(8); await shot('phone-01-overzicht'); },
  async 'phone-02-tutorial'() { await load('phone', 'play=1&tutorial=1&pause=1&intro=0&hour=10.5&pressure=75'); await g(() => window.__game.setPressure(0.75)); await settle(5); await shot('phone-02-tutorial'); },
  async 'phone-03-uitgeklapt'() { await load('phone', `${common}&hour=12&pressure=60`); await g(() => window.__game.expandMood(true)); await settle(3); await shot('phone-03-uitgeklapt'); },
  async 'phone-04-schuif'() { await load('phone', `${common}&hour=12&pressure=60`); await g(() => window.__game.openSheet(true)); await settle(3); await shot('phone-04-schuif'); },
};
for (const [k, fn] of Object.entries(jobs)) {
  if (only.length && !only.some((o) => k.startsWith(o))) continue;
  try { await fn(); } catch (e) { console.log('FAILED', k, e.message); }
}
await browser.close();
server.kill();
process.exit(0);
