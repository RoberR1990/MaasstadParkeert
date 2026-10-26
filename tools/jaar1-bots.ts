// Bots for the 4-quarter Jaar 1 round (shared by tools/jaar1.ts and the tests).
import { BOTS } from './bots';
import type { GameState } from '../src/sim/types';
import type { Action, Config } from '../src/sim/types';
import { staffNeeds } from '../src/sim/model';
/** A sensible Jaar-1 manager: fixes the red wijk with a garage + enforcement, staffs what it builds, adds bike places, keeps cash. */
export const beheerderJ1 = { name: 'beheerder', act(s: GameState, c: Config): Action[] {
  const out: Action[] = [], q = s.quarter, A = c.assets;
  const have = (r: any) => s.staff[r as 'monteur'] + s.hiring.filter(h => h.role === r).reduce((a, h) => a + h.n, 0);
  const queued = (asset: string, w?: string) => s.queue.filter(x => x.asset === asset && (!w || x.wijk === w)).reduce((a, x) => a + x.count, 0);
  let cash = s.fonds - 1.5e6;
  const buy = (cost: number) => cash >= cost ? (cash -= cost, true) : false;
  if (q === 0 && buy(A.garage.capex)) out.push({ type: 'build', asset: 'garage', wijk: 'centrum' });
  if (q <= 1 && s.wijken.centrum.m.bez > 0.9 && buy(A.scanauto.capex)) out.push({ type: 'build', asset: 'scanauto', count: 1 });
  if (q === 0) out.push({ type: 'build', asset: 'automaat', wijk: 'kopbrug', count: 6 });
  for (const w of Object.values(s.wijken)) {
    const short = w.bikeDemand - (w.bikeSpots + w.bikeRacks * A.nietjes.cap + w.stallings.reduce((a, x) => a + x.cap, 0));
    if (q >= 1 && short > 1500 && !queued('stalling', w.id) && w.stallings.length === 0 && buy(A.stalling.capex)) out.push({ type: 'build', asset: 'stalling', wijk: w.id });
    else if (short > 300 && w.bikeRacks < 8 && buy(5 * A.nietjes.capex)) out.push({ type: 'build', asset: 'nietjes', wijk: w.id, count: 5 });
  }
  if (q === 1) out.push({ type: 'build', asset: 'automaat', wijk: 'kuipwijk', count: 20 });
  if (q === 2) out.push({ type: 'introducePaid', wijk: 'kuipwijk', level: 'midden' });
  if (q === c.scenario.goal.marathon.quarter) out.push({ type: 'setTariff', wijk: 'centrum', level: 'hoog' });
  const need = staffNeeds(s, c, true);
  for (const r of ['monteur', 'schoonmaker', 'handhaver', 'klantcontact'] as const) if (need[r] * 1.1 - have(r) > 0.3) out.push({ type: 'hire', role: r, n: Math.min(3, Math.ceil(need[r] * 1.1 - have(r))) });
  return out;
} };
/** A player who only uses what the Jaar-1 screen offers (garage, sets of 5 automaten, scanauto, stalling, hires, tarief). */
export const spelerUI = { name: 'speler-ui', act(s: GameState, c: Config): Action[] {
  const out: Action[] = [], q = s.quarter;
  const have = (r: any) => s.staff[r as 'monteur'] + s.hiring.filter(h => h.role === r).reduce((a, h) => a + h.n, 0);
  if (q === 0) out.push({ type: 'build', asset: 'garage', wijk: 'centrum' }, { type: 'build', asset: 'scanauto', count: 1 }, { type: 'build', asset: 'stalling', wijk: 'centrum' }, { type: 'build', asset: 'stalling', wijk: 'kopbrug' });
  if (q === 1) out.push({ type: 'build', asset: 'stalling', wijk: 'kuipwijk' }, { type: 'build', asset: 'stalling', wijk: 'noord' });
  if (q === 1) out.push({ type: 'introducePaid', wijk: 'kuipwijk', level: 'midden' });
  if (q === c.scenario.goal.marathon.quarter) out.push({ type: 'setTariff', wijk: 'centrum', level: 'hoog' });
  const need = staffNeeds(s, c, true);
  for (const r of ['monteur', 'schoonmaker', 'handhaver', 'klantcontact'] as const) if (need[r] - have(r) > 0.3) out.push({ type: 'hire', role: r, n: Math.min(3, Math.ceil(need[r] - have(r))) });
  return out;
} };
/** Probes for dominant tricks (only with --all). */
export const alleenTarief = { name: 'alleen-tarief', act: (s: GameState, c: Config): Action[] => s.quarter === c.scenario.goal.marathon.quarter ? [{ type: 'setTariff', wijk: 'centrum', level: 'hoog' }] : [] };
export const alleenGarage = { name: 'alleen-garage', act: (s: GameState, c: Config): Action[] => s.quarter === 0 ? [{ type: 'build', asset: 'garage', wijk: 'centrum' }, { type: 'hire', role: 'schoonmaker', n: 1 }, { type: 'hire', role: 'monteur', n: 1 }] : [] };
export const hoogOveral = { name: 'hoog-overal', act: (s: GameState, c: Config): Action[] => s.quarter === 0 ? Object.values(s.wijken).filter(w => w.paid).map(w => ({ type: 'setTariff' as const, wijk: w.id, level: 'hoog' as const })) : [] };
export const J1_BOTS = [...BOTS.filter(b => ['nietsdoen', 'bouwwoede'].includes(b.name)), beheerderJ1, spelerUI, ...(process.argv.includes('--all') ? [alleenTarief, alleenGarage, hoogOveral] : [])];
