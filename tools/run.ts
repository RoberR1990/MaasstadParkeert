import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from '../src/sim/load';
import { createState, tick } from '../src/sim/model';
import { finalScore, PERSONAS } from '../src/sim/score';
import { BOTS, actAs, guardLog } from './bots';

const cfg = loadConfig();
// tuning helper: --set a.b.c=1.5 overrides a config value for this run only (JSON value)
for (const a of process.argv.slice(2)) if (a.startsWith('--set=')) {
  const [path, val] = a.slice(6).split('='); const parts = path.split('.'); let o: any = cfg;
  for (const k of parts.slice(0, -1)) o = o[k]; o[parts[parts.length - 1]] = JSON.parse(val);
}
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const results: Record<string, any> = {};
const rows: string[][] = [];

for (const bot of BOTS) {
  const runs = SEEDS.map(seed => {
    let s = createState(cfg, seed), rejected = 0; const blij: number[] = [];
    for (let q = 0; q < cfg.quarters; q++) { s = tick(s, actAs(bot, s, cfg), cfg); rejected += s.rejected.length; blij.push(s.history[s.history.length - 1].blij); }
    if (seed === 1) {
      const cols = Object.keys(s.history[0]);
      writeFileSync(join(out, `${bot.name}-seed1.csv`), [cols.join(','), ...s.history.map(r => cols.map(k => { const v = (r as any)[k]; return typeof v === 'number' ? +v.toFixed(3) : v; }).join(','))].join('\n'));
    }
    return { seed, ...finalScore(s, cfg), firstClosure: s.firstClosureQuarter, rejected, blij };
  });
  const sc = runs.map(r => r.score), closed = runs.filter(r => r.firstClosure !== null).map(r => r.firstClosure as number);
  const persona = Object.fromEntries(PERSONAS.map(p => [p, mean(runs.map(r => r.persona[p]))]));
  results[bot.name] = { runs, mean: mean(sc), min: Math.min(...sc), max: Math.max(...sc), fondsEnd: mean(runs.map(r => r.fondsEnd)), backlogEnd: mean(runs.map(r => r.backlogEnd)), negQ: mean(runs.map(r => r.negFondsQuarters)), persona, afgeroomd: mean(runs.map(r => r.afgeroomd)), penalties: mean(runs.map(r => r.penalties)), meanBlij: mean(runs.map(r => r.meanBlij)), blijQ: Array.from({ length: cfg.quarters }, (_, q) => mean(runs.map(r => r.blij[q]))), guard: guardLog[bot.name] ?? {}, firstClosureMean: closed.length ? mean(closed) : null, closedRuns: closed.length };
  const r = results[bot.name];
  rows.push([bot.name, r.mean.toFixed(0), mean(runs.map(x => x.meanBlij)).toFixed(1), r.min.toFixed(0), r.max.toFixed(0), (r.fondsEnd / 1e6).toFixed(1), (r.afgeroomd / 1e6).toFixed(0), (100 * r.penalties / (r.meanBlij * cfg.score.scoreScale)).toFixed(0), r.backlogEnd.toFixed(1), r.negQ.toFixed(1),
    ...PERSONAS.map(p => persona[p].toFixed(0)), r.closedRuns ? `${r.firstClosureMean.toFixed(1)} (${r.closedRuns}/20)` : '-']);
}
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
const head = ['bot', 'score', 'blij', 'min', 'max', 'fonds M€', 'afgeroomd', 'pen%', 'achterst.', 'negQ', ...PERSONAS.map(p => p.slice(0, 4)), '1e dicht kw'];
const wd = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
const line = (r: string[]) => r.map((x, i) => x.padStart(wd[i])).join(' | ');
console.log([line(head), wd.map(w => '-'.repeat(w)).join('-+-'), ...rows.map(line)].join('\n'));

const qs = [4, 8, 12, 16, 20, 28, 40];
console.log('\nblij per kwartaal (gemiddeld): ' + qs.map(q => 'q' + q).join('  '));
for (const b of BOTS) console.log(b.name.padStart(10) + ' ' + qs.map(q => results[b.name].blijQ[q - 1].toFixed(1).padStart(5)).join('  '));
const mb = (n: string, a: number, b: number) => mean(results[n].blijQ.slice(a - 1, b));
console.log(`\nbouwwoede vs nietsdoen q4-12: ${mb('bouwwoede', 4, 12).toFixed(1)} vs ${mb('nietsdoen', 4, 12).toFixed(1)}`);
for (const b of BOTS) if (guardLog[b.name] && (b.name === 'beheerder' || process.argv.includes('--guard'))) console.log(b.name, 'guard-afwijzingen/20 seeds:', JSON.stringify(guardLog[b.name]));
