import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const q = process.argv[2] ?? 'play=1&skiptut=1&pause=1&intro=0&fps=1';
const t0 = Date.now();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('console', (m) => console.log('[c]', m.text().slice(0, 200)));
await p.goto('http://127.0.0.1:4173/?' + q);
await p.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000 });
console.log('ready', (Date.now() - t0) / 1000);
for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 5000)); console.log(await p.evaluate(() => document.body.innerText.match(/\d+ fps.*/)?.[0])); }
await b.close();
