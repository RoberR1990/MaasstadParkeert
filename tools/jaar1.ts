// Headless Jaar 1 check: 3 bots x 20 seeds over the 4-quarter round. `npm run jaar1`
import { loadConfig } from '../src/sim/load';
import { createState, tick } from '../src/sim/model';
import { goalStatus, starsFor, teamLoads, teamLevel } from '../src/sim/round';
import type { GameState } from '../src/sim/types';

const cfg = loadConfig('scenario-jaar1.json');
import { J1_BOTS as bots } from './jaar1-bots';
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const verbose = process.argv.includes('-v');

for (const bot of bots) {
  const rows: any[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    let s: GameState = createState(cfg, seed), redEver = false;
    for (let q = 0; q < 4; q++) {
      s = tick(s, (bot as any).act(s, cfg), cfg);
      const L = teamLoads(s, cfg); if (verbose && seed === 1) console.log('   load', JSON.stringify(Object.fromEntries(Object.entries(L).map(([k, v]) => [k, +v.toFixed(2)]))));
      if (Object.values(L).some(l => teamLevel(l, cfg) === 'rood')) redEver = true;
      if (verbose && seed === 1) { const r = s.history[q]; console.log(`  ${bot.name} q${q + 1} blij ${r.blij.toFixed(1)} fonds ${(s.fonds / 1e6).toFixed(1)} rev ${(r.revenue / 1e6).toFixed(1)} costs ${(r.costs / 1e6).toFixed(1)} centrumZoek ${r.searchCentrum.toFixed(1)} avgZoek ${r.avgSearch.toFixed(1)} rej ${s.rejected.join(' | ')}`); console.log('     ', ['bewoner','ondernemer','bezoeker','fietser','stad','wethouder'].map(k => k.slice(0,4) + ' ' + (r as any)[k].toFixed(0)).join(' '), '| zoek', Object.values(s.wijken).map(w => w.id.slice(0,4) + ' ' + w.m.search.toFixed(1)).join(' '), 'bike', r.bikeShort.toFixed(2), 'netheid', r.netheid.toFixed(0)); }
    }
    const st = goalStatus(s, cfg, redEver);
    rows.push({ blij: st.blij, fonds: s.fonds / 1e6, search: s.history[3].searchCentrum, ok: st.blijOk && st.fondsOk && st.marathonOk, stars: starsFor(st, cfg, s.fonds), neg: s.negFondsQuarters, red: redEver, blijOk: st.blijOk, fondsOk: st.fondsOk, mOk: st.marathonOk });
  }
  console.log(`${bot.name.padEnd(10)} blij ${mean(rows.map(r => r.blij)).toFixed(1)} (min ${Math.min(...rows.map(r => r.blij)).toFixed(1)} max ${Math.max(...rows.map(r => r.blij)).toFixed(1)}) fonds ${mean(rows.map(r => r.fonds)).toFixed(1)} M€ marathon-zoek ${mean(rows.map(r => r.search)).toFixed(1)} min | blij>=70 ${rows.filter(r => r.blijOk).length}/20 fonds ok ${rows.filter(r => r.fondsOk).length}/20 marathon ok ${rows.filter(r => r.mOk).length}/20 | gehaald ${rows.filter(r => r.ok).length}/20 sterren ${mean(rows.map(r => r.stars)).toFixed(2)} rood ${rows.filter(r => r.red).length}/20`);
}
