// Bots for the 4-quarter Jaar 1 round (shared by tools/jaar1.ts and the tests).
import { BOTS } from './bots';
import type { GameState, TeamId } from '../src/sim/types';
import type { Action, Config } from '../src/sim/types';
import { TEAMS, TEAM_ROLE } from '../src/sim/types';
import { counts } from '../src/sim/model';
import { teamNeeds, teamFte } from '../src/sim/teams';

/** asset counts including the queue and what these actions would add */
const countsAfter = (s: GameState, acts: Action[]) => {
  const n = counts(s, true);
  for (const a of acts) if (a.type === 'build' && a.asset in n) (n as any)[a.asset] += a.count ?? 1;
  return n;
};
/** Hires so that every team has (need x margin) people once the work starts. Hires ordered now are in place next quarter, when new assets start to generate work. */
export function hiresFor(s: GameState, c: Config, planned: Action[], margin = 1.1, maxPer = 3): Action[] {
  const need = teamNeeds(s, c, countsAfter(s, planned)), out: Action[] = [];
  for (const t of TEAMS) {
    const role = TEAM_ROLE[t] ?? 'backoffice';
    const pending = s.hiring.filter(h => h.role === role).reduce((a, h) => a + h.n, 0);
    const gap = need[t] * margin - (teamFte(s, t) + pending);
    if (gap > 0.3) out.push({ type: 'hire', role, n: Math.min(maxPer, Math.ceil(gap)) });
  }
  return out;
}

/** A sensible Jaar-1 manager: fixes the red wijk with a garage + enforcement, staffs what it builds (before the work starts), adds bike places, keeps cash. */
export const beheerderJ1 = { name: 'beheerder', act(s: GameState, c: Config): Action[] {
  const out: Action[] = [], q = s.quarter, A = c.assets;
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
  // one quarter ahead of a policy change: more hands for the call and objection peak
  if (q === 1 || q === 2) out.push({ type: 'hire', role: 'klantcontact', n: 1 }, { type: 'hire', role: 'backoffice', n: 1 });
  out.push(...hiresFor(s, c, out));
  return out;
} };
/** A player who only uses what the Jaar-1 screen offers (garage, sets of 5 automaten, scanauto, stalling, hires, tarief) and plans one quarter ahead. */
export const spelerUI = { name: 'speler-ui', act(s: GameState, c: Config): Action[] {
  const out: Action[] = [], q = s.quarter;
  if (q === 0) out.push({ type: 'build', asset: 'garage', wijk: 'centrum' }, { type: 'build', asset: 'scanauto', count: 1 }, { type: 'build', asset: 'stalling', wijk: 'centrum' }, { type: 'build', asset: 'stalling', wijk: 'kopbrug' }, { type: 'build', asset: 'stalling', wijk: 'kuipwijk' });
  if (q === 1) out.push({ type: 'build', asset: 'stalling', wijk: 'noord' });
  if (q === 1) out.push({ type: 'hire', role: 'klantcontact', n: 1 }, { type: 'hire', role: 'backoffice', n: 1 });
  if (q === 2) out.push({ type: 'introducePaid', wijk: 'kuipwijk', level: 'midden' });
  if (q === 2) out.push({ type: 'hire', role: 'klantcontact', n: 1 }, { type: 'hire', role: 'backoffice', n: 1 });
  if (q === c.scenario.goal.marathon.quarter) out.push({ type: 'setTariff', wijk: 'centrum', level: 'hoog' });
  out.push(...hiresFor(s, c, out, 1.15));
  return out;
} };
/** Plays the scenario's Moment and dilemma. Hires one quarter ahead for the extra work the chosen measures bring. */
export const withMoment = (bot: { name: string; act: (s: GameState, c: Config) => Action[] }, picks: string[], choice = 'nee', name = bot.name) => ({ name, act(s: GameState, c: Config): Action[] {
  const out = bot.act(s, c), tc = c.teams;
  if (tc?.moment && s.quarter === tc.moment.quarter - 1) {
    for (const p of picks) for (const [tm, v] of Object.entries(tc.moment.picks[p].load ?? {})) {
      const role = TEAM_ROLE[tm as TeamId] ?? 'backoffice', spare = teamFte(s, tm as TeamId) + s.hiring.filter(h => h.role === role).reduce((a, h) => a + h.n, 0) - s.teams!.units[tm as TeamId].demand;
      if (spare < (v as number) + 0.3) out.push({ type: 'hire', role, n: 1 });
    }
  }
  if (tc?.moment && s.quarter === tc.moment.quarter) out.push({ type: 'moment', id: tc.moment.id, picks });
  if (tc?.dilemma && s.quarter === tc.dilemma.quarter) out.push({ type: 'dilemma', id: tc.dilemma.id, choice });
  return out;
} });
/** Probes for dominant tricks (only with --all). */
export const alleenTarief = { name: 'alleen-tarief', act: (s: GameState, c: Config): Action[] => s.quarter === c.scenario.goal.marathon.quarter ? [{ type: 'setTariff', wijk: 'centrum', level: 'hoog' }] : [] };
export const alleenGarage = { name: 'alleen-garage', act: (s: GameState, c: Config): Action[] => s.quarter === 0 ? [{ type: 'build', asset: 'garage', wijk: 'centrum' }, { type: 'hire', role: 'schoonmaker', n: 1 }, { type: 'hire', role: 'monteur', n: 1 }] : [] };
export const hoogOveral = { name: 'hoog-overal', act: (s: GameState, c: Config): Action[] => s.quarter === 0 ? Object.values(s.wijken).filter(w => w.paid).map(w => ({ type: 'setTariff' as const, wijk: w.id, level: 'hoog' as const })) : [] };
export const J1_BOTS = [...BOTS.filter(b => ['nietsdoen', 'bouwwoede'].includes(b.name)), beheerderJ1, spelerUI, withMoment(beheerderJ1, ['handhaving', 'evenementtarief'], 'nee', 'beheerder+moment'), withMoment(spelerUI, ['evenementtarief', 'brief'], 'nee', 'speler-ui+moment'), ...(process.argv.includes('--all') ? [alleenTarief, alleenGarage, hoogOveral] : [])];
