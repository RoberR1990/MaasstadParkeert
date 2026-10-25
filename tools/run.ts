import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from '../src/sim/load';
import { createState, tick } from '../src/sim/model';
import { finalScore, PERSONAS } from '../src/sim/score';
import { BOTS } from './bots';

const cfg = loadConfig();
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const results: Record<string, any> = {};
const rows: string[][] = [];

for (const bot of BOTS) {
  const runs = SEEDS.map(seed => {
    let s = createState(cfg, seed), rejected = 0;
    for (let q = 0; q < cfg.quarters; q++) { s = tick(s, bot.act(s, cfg), cfg); rejected += s.rejected.length; }
    if (seed === 1) {
      const cols = Object.keys(s.history[0]);
      writeFileSync(join(out, `${bot.name}-seed1.csv`), [cols.join(','), ...s.history.map(r => cols.map(k => { const v = (r as any)[k]; return typeof v === 'number' ? +v.toFixed(3) : v; }).join(','))].join('\n'));
    }
    return { seed, ...finalScore(s, cfg), firstClosure: s.firstClosureQuarter, rejected };
  });
  const sc = runs.map(r => r.score), closed = runs.filter(r => r.firstClosure !== null).map(r => r.firstClosure as number);
  const persona = Object.fromEntries(PERSONAS.map(p => [p, mean(runs.map(r => r.persona[p]))]));
  results[bot.name] = { runs, mean: mean(sc), min: Math.min(...sc), max: Math.max(...sc), fondsEnd: mean(runs.map(r => r.fondsEnd)), backlogEnd: mean(runs.map(r => r.backlogEnd)), negQ: mean(runs.map(r => r.negFondsQuarters)), persona, firstClosureMean: closed.length ? mean(closed) : null, closedRuns: closed.length };
  const r = results[bot.name];
  rows.push([bot.name, r.mean.toFixed(0), mean(runs.map(x => x.meanBlij)).toFixed(1), r.min.toFixed(0), r.max.toFixed(0), (r.fondsEnd / 1e6).toFixed(1), r.backlogEnd.toFixed(1), r.negQ.toFixed(1),
    ...PERSONAS.map(p => persona[p].toFixed(0)), r.closedRuns ? `${r.firstClosureMean.toFixed(1)} (${r.closedRuns}/20)` : '-']);
}
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
const head = ['bot', 'score', 'blij', 'min', 'max', 'fonds M€', 'achterst.', 'negQ', ...PERSONAS.map(p => p.slice(0, 4)), '1e dicht kw'];
const wd = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
const line = (r: string[]) => r.map((x, i) => x.padStart(wd[i])).join(' | ');
console.log([line(head), wd.map(w => '-'.repeat(w)).join('-+-'), ...rows.map(line)].join('\n'));
