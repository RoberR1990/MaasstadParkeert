// The Jaar 1 round: wraps the pure simulation (src/sim) with a plan (this quarter's choices), previews and results.
// No DOM, no Three.js: everything the UI needs is returned as plain data.
import baseConfig from '@data/config.json';
import scenario from '@data/scenario-jaar1.json';
import { createState, tick, staffNeeds, counts } from '@sim/model';
import { buildConfig, explain, goalStatus, starsFor, teamLevel, teamLoads, type Cause, type GoalStatus, type TeamLevel } from '@sim/round';
import { PERSONAS } from '@sim/score';
import type { Action, Config, GameState, Role, Tariff } from '@sim/types';
import { ROLES } from '@sim/types';
import type { WijkId } from './wijken';

export type ItemKind = 'garage' | 'automaat' | 'scanauto' | 'stalling' | 'hire' | 'tariff' | 'intro';
export interface PlanItem {
  id: number; kind: ItemKind; action: Action; wijk?: WijkId; role?: Role; level?: Tariff; n?: number;
  /** paid now (capex) / running cost per year, in euro */
  cost: number; perYear: number;
  /** where it was placed on the diorama (build spots) */
  lot?: { id: number; sub: number };
}
export interface WijkView { id: WijkId; bez: number; search: number; revenue: number; paid: boolean; tariff: Tariff; garages: number; naleving: number }
export interface MoneyLines {
  revStreet: number; revGarage: number; revPermit: number; revenue: number;
  capex: number; staff: number; opex: number; overhead: number; ovCost: number; costs: number;
  saldo: number; fondsOld: number; fondsNew: number; afgeroomd: number;
}
export interface QuarterResult {
  q: number; year: number;
  blijOld: number; blijNew: number;
  personaOld: Record<string, number>; personaNew: Record<string, number>;
  money: MoneyLines;
  wijken: { id: WijkId; bezOld: number; bezNew: number; searchOld: number; searchNew: number; revenueNew: number }[];
  causes: Cause[];
  loads: Record<Role, number>; levels: Record<Role, TeamLevel>;
  items: PlanItem[];
  messages: string[];
  next: GameState; old: GameState;
}
export interface Ending { status: GoalStatus; stars: number; blij: number; fonds: number; marathonSearch: number | null; chaos: boolean }

export const cfg: Config = buildConfig(baseConfig as unknown as Config, scenario as unknown as Record<string, any>);
export const GOAL = cfg.scenario.goal as {
  blijMin: number; fondsMin: number; marathon: { quarter: number; announceQuarter: number; wijk: WijkId; maxSearch: number };
  starsFondsOver: number; loadOrange: number; loadRed: number;
};
export const QUARTERS = 4;
export const ROLE_TEAM: Record<Role, { team: string; short: string }> = {
  handhaver: { team: 'Handhaving', short: 'handhavers' },
  monteur: { team: 'Techniek', short: 'monteurs' },
  schoonmaker: { team: 'Schoonmaak & Garagebeheer', short: 'schoonmakers' },
  klantcontact: { team: 'Klantcontact', short: 'medewerkers' },
};

/** how many units one placement builds (scenario: assets.<kind>.batch; automaten come in sets) */
export const batchOf = (kind: string): number => (cfg.assets as unknown as Record<string, { batch?: number }>)[kind]?.batch ?? 1;

let uid = 1;
export class Session {
  state: GameState;
  /** what the player saw at the start of this quarter (last played quarter, or the do-nothing baseline in Q1) */
  shown: GameState;
  baseline: GameState;
  plan: PlanItem[] = [];
  results: QuarterResult[] = [];
  redEver = false;
  private prev: GameState | null = null;
  private cachePlan = '';
  private cachePreview: GameState | null = null;
  readonly seed: number;

  constructor(seed = (scenario as any).seed as number) {
    this.seed = seed;
    this.state = createState(cfg, seed);
    this.baseline = tick(this.state, [], cfg);
    this.shown = this.baseline;
  }
  reset() { Object.assign(this, new Session(this.seed)); }

  get quarter() { return this.state.quarter; }
  get done() { return this.state.quarter >= QUARTERS; }
  get year() { return cfg.startYear + 1 + Math.floor(this.state.quarter / 4); }
  /** what the HUD shows as "now" */
  get blijNow() { return this.shown.history[this.shown.history.length - 1].blij; }

  // ---------------------------------------------------------------- plan
  actions(): Action[] { return this.plan.map((p) => p.action); }
  private key() { return JSON.stringify(this.actions()) + this.quarter; }
  /** exactly what would happen if the player pressed "Volgend kwartaal" now (the sim is deterministic) */
  preview(): GameState {
    const k = this.key();
    if (k !== this.cachePlan || !this.cachePreview) { this.cachePlan = k; this.cachePreview = tick(this.state, this.actions(), cfg); }
    return this.cachePreview;
  }
  planCapex() { return this.plan.reduce((a, p) => a + p.cost, 0); }
  planPerYear() { return this.plan.reduce((a, p) => a + p.perYear, 0); }
  fondsAfterPlan() { return this.state.fonds - this.planCapex(); }

  /** Dutch reason if the sim would reject this action on top of the current plan, else null. */
  check(a: Action): string | null {
    const r = tick(this.state, [...this.actions(), a], cfg).rejected;
    return r.length ? reasonNl(r[r.length - 1], a) : null;
  }
  add(item: Omit<PlanItem, 'id'>): { ok: true; item: PlanItem } | { ok: false; reason: string } {
    const why = this.check(item.action);
    if (why) return { ok: false, reason: why };
    const it = { ...item, id: uid++ };
    this.plan.push(it);
    return { ok: true, item: it };
  }
  /** Removes an item; later items that no longer fit (e.g. money) are dropped too and returned. */
  remove(id: number): PlanItem[] {
    const i = this.plan.findIndex((p) => p.id === id);
    if (i < 0) return [];
    const gone = [this.plan[i]];
    const rest = this.plan.filter((p) => p.id !== id), kept: PlanItem[] = [];
    for (const p of rest) {
      if (tick(this.state, [...kept.map((x) => x.action), p.action], cfg).rejected.length) gone.push(p); else kept.push(p);
    }
    this.plan = kept;
    return gone;
  }
  has(kind: ItemKind, wijk?: WijkId, role?: Role) { return this.plan.filter((p) => p.kind === kind && (!wijk || p.wijk === wijk) && (!role || p.role === role)).length; }

  // ---------------------------------------------------------------- build helpers
  buildItem(kind: 'garage' | 'automaat' | 'scanauto' | 'stalling', wijk: WijkId, lot?: { id: number; sub: number }): Omit<PlanItem, 'id'> {
    const a = cfg.assets[kind], n = batchOf(kind);
    const action: Action = kind === 'scanauto' ? { type: 'build', asset: 'scanauto', count: 1 } : { type: 'build', asset: kind, wijk, count: n };
    return { kind, action, wijk, cost: a.capex * n, perYear: a.opex * n, lot, n };
  }
  hireItem(role: Role): Omit<PlanItem, 'id'> { return { kind: 'hire', role, action: { type: 'hire', role, n: 1 }, cost: 0, perYear: cfg.staff.salary[role] }; }
  tariffItem(wijk: WijkId, level: Tariff, intro: boolean): Omit<PlanItem, 'id'> {
    return { kind: intro ? 'intro' : 'tariff', wijk, level, action: intro ? { type: 'introducePaid', wijk, level } : { type: 'setTariff', wijk, level }, cost: 0, perYear: 0 };
  }

  // ---------------------------------------------------------------- readouts
  wijkViews(s: GameState = this.shown): Record<WijkId, WijkView> {
    const out = {} as Record<WijkId, WijkView>;
    for (const id of cfg.wijkOrder as WijkId[]) {
      const w = s.wijken[id];
      out[id] = { id, bez: w.m.bez, search: w.m.search, revenue: w.m.revenue, paid: w.paid, tariff: w.tariff, garages: w.garages.length, naleving: w.m.naleving };
    }
    return out;
  }
  loads(s: GameState = this.state) { const l = teamLoads(s, cfg); return { loads: l, levels: Object.fromEntries(ROLES.map((r) => [r, teamLevel(l[r], cfg)])) as Record<Role, TeamLevel> }; }
  /** FTE on the payroll, plus hires that are on their way */
  staffInfo(role: Role) {
    const s = this.state;
    return { have: s.staff[role], coming: s.hiring.filter((h) => h.role === role).reduce((a, h) => a + h.n, 0) + this.plan.filter((p) => p.role === role).length, need: staffNeeds(s, cfg, true)[role] };
  }
  goal(): GoalStatus { return goalStatus(this.state, cfg, this.redEver); }
  /** news for the plan screen of the current quarter */
  news(): { label: string; kind: 'groei' | 'marathon-aankondiging' | 'marathon' }[] {
    const q = this.quarter, out: { label: string; kind: any }[] = [];
    for (const g of (cfg.scenario.growth ?? []) as any[]) if (g.quarter === q) out.push({ label: g.label, kind: 'groei' });
    if (GOAL.marathon.announceQuarter === q) out.push({ label: 'Marathon Rotterdam', kind: 'marathon-aankondiging' });
    if (GOAL.marathon.quarter === q) out.push({ label: 'Marathon Rotterdam', kind: 'marathon' });
    return out;
  }
  marathonThisQuarter() { return this.quarter === GOAL.marathon.quarter; }

  // ---------------------------------------------------------------- play a quarter
  commit(): QuarterResult {
    const old = this.shown, before = this.state, items = [...this.plan], capex = this.planCapex();
    const next = tick(before, this.actions(), cfg);
    const r = next.history[next.history.length - 1], rOld = old.history[old.history.length - 1];
    const money: MoneyLines = {
      revStreet: sumW(next, 'revStreet'), revGarage: sumW(next, 'revGarage'), revPermit: sumW(next, 'revPermit'), revenue: r.revenue,
      capex, staff: r.staffCost, opex: r.opex, overhead: r.overhead, ovCost: r.costs - r.opex - r.staffCost - r.overhead, costs: r.costs,
      saldo: r.revenue - r.costs - capex, fondsOld: before.fonds, fondsNew: next.fonds, afgeroomd: next.afgeroomd - before.afgeroomd,
    };
    const L = teamLoads(next, cfg);
    const levels = Object.fromEntries(ROLES.map((x) => [x, teamLevel(L[x], cfg)])) as Record<Role, TeamLevel>;
    if (ROLES.some((x) => levels[x] === 'rood')) this.redEver = true;
    const res: QuarterResult = {
      q: before.quarter, year: this.year,
      blijOld: rOld.blij, blijNew: r.blij,
      personaOld: Object.fromEntries(PERSONAS.map((p) => [p, (rOld as any)[p]])), personaNew: Object.fromEntries(PERSONAS.map((p) => [p, (r as any)[p]])),
      money,
      wijken: (cfg.wijkOrder as WijkId[]).map((id) => ({ id, bezOld: old.wijken[id].m.bez, bezNew: next.wijken[id].m.bez, searchOld: old.wijken[id].m.search, searchNew: next.wijken[id].m.search, revenueNew: next.wijken[id].m.revenue })),
      causes: explain(old, next, cfg, 3), loads: L, levels, items, messages: next.messages, next, old,
    };
    this.prev = before;
    this.state = next; this.shown = next; this.plan = [];
    this.results.push(res);
    this.cachePlan = '';
    return res;
  }
  get previous() { return this.prev; }

  ending(): Ending {
    const st = this.goal(), s = this.state;
    const row = s.history.find((h) => h.q === GOAL.marathon.quarter);
    const search = row ? row.searchCentrum : null;
    return { status: st, stars: starsFor(st, cfg, s.fonds), blij: st.blij, fonds: s.fonds, marathonSearch: search, chaos: search != null && search > GOAL.marathon.maxSearch };
  }
  totals() { return counts(this.state); }
}

const sumW = (s: GameState, k: 'revStreet' | 'revGarage' | 'revPermit') => Object.values(s.wijken).reduce((a, w) => a + w.m[k], 0);

/** Sim rejection text -> plain Dutch for the player. */
export function reasonNl(msg: string, a: Action): string {
  if (/onvoldoende fonds/.test(msg)) return 'Daar is nu te weinig geld in het fonds voor.';
  if (/maximum garages/.test(msg)) return 'In deze wijk passen niet meer garages.';
  if (/max \d+ FTE/.test(msg)) return 'Per kwartaal kun je maximaal 3 mensen per team aannemen.';
  if (/beleidswijziging/.test(msg)) return 'Je hebt het beleid in deze wijk net aangepast. Wacht een kwartaal.';
  if (/al betaald/.test(msg)) return 'Hier betaal je al voor parkeren.';
  if (/niet betaald/.test(msg)) return 'Hier is parkeren nog gratis. Voer eerst betaald parkeren in.';
  void a;
  return 'Dat kan nu niet.';
}
