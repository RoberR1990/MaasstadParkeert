// Round helpers for the playable "Jaar 1" mode: config building, goal check, stars, team load and a plain
// "why did the score move" explanation. Pure (no DOM, no Three.js) so the game and the bots share the same code.
import type { Config, GameState, Role } from './types';
import { ROLES } from './types';
import { staffNeeds } from './model';
import { evaluate } from './score';

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
/** Deep-merges `b` into `a` (objects merge, arrays and scalars replace). Mutates and returns `a`. */
export function mergeDeep<T extends Record<string, any>>(a: T, b: Record<string, any>): T {
  for (const k of Object.keys(b)) {
    if (isObj(b[k]) && isObj((a as any)[k])) mergeDeep((a as any)[k], b[k]);
    else (a as any)[k] = structuredClone(b[k]);
  }
  return a;
}

/** base config + scenario (growth/events + optional `overrides` deep-merged over the base). Does not mutate `base`. */
export function buildConfig(base: Config, scenario: Record<string, any>): Config {
  const cfg = structuredClone(base);
  if (isObj(scenario.overrides)) mergeDeep(cfg, scenario.overrides);
  cfg.scenario = scenario;
  return cfg;
}

// ---------------------------------------------------------------- teams
export type TeamLevel = 'groen' | 'oranje' | 'rood';
/** Workload per role: need / available (1 = just enough, above 1 = short-staffed). */
export function teamLoads(s: GameState, c: Config): Record<Role, number> {
  const need = staffNeeds(s, c);
  const out = {} as Record<Role, number>;
  for (const r of ROLES) out[r] = need[r] <= 0 ? 0 : s.staff[r] > 0.001 ? need[r] / s.staff[r] : 9;
  return out;
}
export const teamLevel = (load: number, c: Config): TeamLevel =>
  load >= c.scenario.goal.loadRed ? 'rood' : load >= c.scenario.goal.loadOrange ? 'oranje' : 'groen';

// ---------------------------------------------------------------- goal + stars
export interface GoalStatus {
  blij: number; blijOk: boolean;
  fonds: number; fondsOk: boolean;
  marathonSearch: number | null; marathonOk: boolean | null; // null = not played yet
  anyRed: boolean;
}
/** Goal status after the quarters played so far. `redEver` = some team was in the red at a quarter end. */
export function goalStatus(s: GameState, c: Config, redEver = false): GoalStatus {
  const g = c.scenario.goal, h = s.history, last = h[h.length - 1];
  const mq = g.marathon.quarter;
  const row = h.find(r => r.q === mq);
  const mSearch = row ? row.searchCentrum : null;
  const blij = last ? last.blij : 0;
  return {
    blij, blijOk: blij >= g.blijMin,
    fonds: s.fonds, fondsOk: s.fonds >= g.fondsMin && s.negFondsQuarters === 0,
    marathonSearch: mSearch, marathonOk: mSearch == null ? null : mSearch <= g.marathon.maxSearch,
    anyRed: redEver,
  };
}
/** 1 star = goal reached, +1 with at least `starsFondsOver` left in the fonds, +1 when no team was ever in the red. 0 when the goal is missed. */
export function starsFor(st: GoalStatus, c: Config, fondsEnd: number): number {
  if (!(st.blijOk && st.fondsOk && st.marathonOk === true)) return 0;
  return 1 + (fondsEnd >= c.scenario.goal.starsFondsOver ? 1 : 0) + (st.anyRed ? 0 : 1);
}

// ---------------------------------------------------------------- explanation
export type CauseKind = 'zoektijd' | 'fiets' | 'netheid' | 'tarief' | 'storing' | 'dicht' | 'klachten' | 'fonds' | 'invoering';
export interface Cause { kind: CauseKind; delta: number; wijk?: string; from?: number; to?: number }

const malfOf = (s: GameState, c: Config) => {
  const need = staffNeeds(s, c), rM = need.monteur > 0 ? s.staff.monteur / need.monteur : 2;
  return (c.model.malfunction.base + c.model.malfunction.k * Math.max(0, 1 - rM)) * (1 - s.appShare);
};
const globalsOf = (s: GameState, c: Config, prevClosed = 0) => {
  const r = s.history[s.history.length - 1];
  return { malfEff: malfOf(s, c), bikeShort: r?.bikeShort ?? 0, newClosures: Math.max(0, (r?.closed ?? 0) - prevClosed), closedCount: r?.closed ?? 0 };
};

/**
 * Why did the blije Rotterdammer move between `old` (state as the player saw it) and `next` (after the quarter)?
 * Each factor is reverted to its old value in a copy of `next`; the score difference is that factor's share.
 * Returns the biggest movers first (both directions), at most `n`.
 */
export function explain(old: GameState, next: GameState, c: Config, n = 3): Cause[] {
  const g1 = globalsOf(next, c, old.history[old.history.length - 1]?.closed ?? 0);
  const base = evaluate(next, c, g1).blij;
  const out: Cause[] = [];
  const test = (kind: CauseKind, mod: (s: GameState, g: typeof g1) => void, extra: Partial<Cause> = {}) => {
    const s = structuredClone(next), g = { ...g1 };
    mod(s, g);
    const d = base - evaluate(s, c, g).blij;
    if (Math.abs(d) >= 0.05) out.push({ kind, delta: d, ...extra });
  };
  const ids = Object.keys(next.wijken);
  // search time: report the wijk that moved the most (weighted by who lives / shops / visits there)
  const w = c.score;
  let bw = '', bm = 0;
  for (const id of ids) {
    const ds = next.wijken[id].m.search - old.wijken[id].m.search;
    const wt = (next.wijken[id].pop + next.wijken[id].newPop) / 1e4 + (w.shopWeights[id] ?? 0) * 2 + (w.visitorWeights[id] ?? 0) * 3;
    if (Math.abs(ds) * wt > Math.abs(bm)) { bm = ds * wt; bw = id; }
  }
  test('zoektijd', s => { for (const id of ids) s.wijken[id].m.search = old.wijken[id].m.search; },
    bw ? { wijk: bw, from: old.wijken[bw].m.search, to: next.wijken[bw].m.search } : {});
  test('fiets', (_s, g) => { g.bikeShort = old.history[old.history.length - 1]?.bikeShort ?? 0; },
    { from: (old.history[old.history.length - 1]?.bikeShort ?? 0) * 100, to: (next.history[next.history.length - 1]?.bikeShort ?? 0) * 100 });
  test('netheid', s => { s.netheid = old.netheid; }, { from: old.netheid, to: next.netheid });
  let tw = '';
  for (const id of ids) if (old.wijken[id].paid !== next.wijken[id].paid || old.wijken[id].tariff !== next.wijken[id].tariff) tw = id;
  test('tarief', s => { for (const id of ids) { s.wijken[id].paid = old.wijken[id].paid; s.wijken[id].tariff = old.wijken[id].tariff; } }, tw ? { wijk: tw } : {});
  test('storing', (_s, g) => { g.malfEff = malfOf(old, c); });
  test('dicht', (s, g) => { g.closedCount = old.history[old.history.length - 1]?.closed ?? 0; g.newClosures = 0;
    for (const id of ids) if (s.wijken[id].garages.length === old.wijken[id].garages.length) s.wijken[id].garages = structuredClone(old.wijken[id].garages); });
  test('klachten', s => { s.klantBacklog = old.klantBacklog; });
  test('fonds', s => { s.fonds = old.fonds; }, { from: old.fonds, to: next.fonds });
  test('invoering', s => { for (const id of ids) s.wijken[id].introLeft = old.wijken[id].introLeft; });
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out.slice(0, n);
}

