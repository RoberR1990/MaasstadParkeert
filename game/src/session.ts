// The Jaar 1 round: wraps the pure simulation (src/sim) with a plan (this quarter's choices), previews and results.
// No DOM, no Three.js: everything the UI needs is returned as plain data.
import baseConfig from '@data/config.json';
import scenario from '@data/scenario-jaar1.json';
import { createState, tick, counts } from '@sim/model';
import { compare, forecast, type Forecast } from '@sim/forecast';
import { teamNeeds } from '@sim/teams';
import { buildConfig, explain, goalStatus, starsFor, teamLevel, teamLoadsT, type Cause, type GoalStatus, type TeamLevel } from '@sim/round';
import { PERSONAS } from '@sim/score';
import type { Action, Config, GameState, HireRole, TeamId, Tariff } from '@sim/types';
import { TEAMS, TEAM_ROLE } from '@sim/types';
import type { WijkId } from './wijken';

export type ItemKind = 'garage' | 'automaat' | 'scanauto' | 'stalling' | 'hire' | 'tariff' | 'intro';
export interface PlanItem {
  id: number; kind: ItemKind; action: Action; wijk?: WijkId; role?: HireRole; team?: TeamId; level?: Tariff; n?: number;
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
  loads: Record<TeamId, number>; levels: Record<TeamId, TeamLevel>;
  /** what the player chose for the Moment (Q4) and the dilemma (Q2) in this quarter's plan */
  moment: string[] | null; dilemma: string | null;
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
export const TC = cfg.teams as {
  backoffice: { salary: number };
  moment: { id: string; quarter: number; maxPicks: number; partner: { garageReach: number; text: string }; picks: Record<string, { label: string; cost: number; load?: Partial<Record<TeamId, number>>; [k: string]: unknown }> };
  dilemma: { id: string; quarter: number; duration: number; options: Record<string, { revMult?: Record<string, number>; persona?: Record<string, number>; load?: Partial<Record<TeamId, number>> }> };
};
/** numbers used only to explain things on screen (heat colours, complaint index, meter scale) */
export const UI_CFG = (cfg.scenario.ui ?? {}) as { heat: { green: number; red: number }; meterMax: number; klachten: { perMinPerKResident: number; intro: number; hoog: number; floor: number } };
export const salaryOf = (team: TeamId): number => { const r = TEAM_ROLE[team]; return r ? cfg.staff.salary[r] : TC.backoffice.salary; };
export const hireRoleOf = (team: TeamId): HireRole => TEAM_ROLE[team] ?? 'backoffice';
export interface TeamView { id: TeamId; fte: number; coming: number; need: number; demand: number; load: number; level: TeamLevel; parts: Record<string, number>; backlog: number }
export interface WijkDetail { id: WijkId; bez: number; search: number; revenue: number; revenuePerYear: number; paid: boolean; tariff: Tariff; garages: number; naleving: number; introLeft: number; klachten: number; klachtenLevel: 'laag' | 'middel' | 'hoog'; overvolOneIn: number | null }

/** how many units one placement builds (scenario: assets.<kind>.batch; automaten come in sets) */
export const batchOf = (kind: string): number => (cfg.assets as unknown as Record<string, { batch?: number }>)[kind]?.batch ?? 1;

let uid = 1;
export class Session {
  state: GameState;
  /** what the player saw at the start of this quarter (last played quarter, or the do-nothing baseline in Q1) */
  shown: GameState;
  baseline: GameState;
  plan: PlanItem[] = [];
  /** Moment picks (Q4) and dilemma answer (Q2) of the current plan; they travel with the plan as actions */
  momentPicks: string[] = [];
  dilemmaChoice: string | null = null;
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
  actions(): Action[] {
    const a = this.plan.map((p) => p.action);
    if (this.isMomentQuarter() && this.momentPicks.length) a.push({ type: 'moment', id: TC.moment.id, picks: this.momentPicks });
    if (this.dilemmaChoice && this.isDilemmaQuarter()) a.push({ type: 'dilemma', id: TC.dilemma.id, choice: this.dilemmaChoice });
    return a;
  }
  /** marginal effect of toggling one Moment measure, on top of the rest of the plan and the other picks */
  forecastPick(id: string): Forecast {
    const base = this.plan.map((p) => p.action), mk = (picks: string[]): Action[] => (picks.length ? [{ type: 'moment', id: TC.moment.id, picks }] : []);
    const cur = this.momentPicks, withP = cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id];
    const k = 'pick' + this.key() + id;
    let f = this.fcCache.get(k);
    if (!f) { f = compare(this.state, [...base, ...mk(cur)], [...base, ...mk(withP)], cfg, TC.moment.picks ? 'centrum' : null); this.fcCache.set(k, f); }
    return cur.includes(id) ? { ...f, searchOld: f.searchNew, searchNew: f.searchOld, blijOld: f.blijNew, blijNew: f.blijOld } : f;
  }
  /** the state one quarter after the plan (new hires have arrived, new assets generate work): this is what the team meters show */
  upcoming(): GameState {
    const k = this.key();
    if (k !== this.cacheUpK || !this.cacheUp) { this.cacheUpK = k; this.cacheUp = tick(this.preview(), [], cfg); }
    return this.cacheUp;
  }
  private cacheUpK = ''; private cacheUp: GameState | null = null;
  /** team views as the player should read them while planning: people now (+coming), work and load after the plan has settled */
  upcomingViews(): Record<TeamId, TeamView> {
    const now = this.teamViews(this.state), up = this.upcoming(), out = {} as Record<TeamId, TeamView>;
    for (const t of TEAMS) { const u = up.teams!.units[t]; out[t] = { ...now[t], demand: u.demand, load: u.load, level: teamLevel(u.load, cfg), parts: u.parts, backlog: u.achterstand }; }
    return out;
  }
  isMomentQuarter() { return this.quarter === TC.moment.quarter; }
  isDilemmaQuarter() { return this.quarter === TC.dilemma.quarter; }
  momentCost() { return this.isMomentQuarter() ? this.momentPicks.reduce((a, p) => a + TC.moment.picks[p].cost, 0) : 0; }
  setMomentPick(id: string, on: boolean): string | null {
    const has = this.momentPicks.includes(id);
    if (on && !has) {
      if (this.momentPicks.length >= TC.moment.maxPicks) return `Je mag maximaal ${TC.moment.maxPicks} maatregelen kiezen.`;
      if (this.state.fonds - this.planCapex() < TC.moment.picks[id].cost) return 'Daar is nu te weinig geld in het fonds voor.';
      this.momentPicks.push(id);
    } else if (!on && has) this.momentPicks = this.momentPicks.filter((p) => p !== id);
    return null;
  }
  private key() { return JSON.stringify(this.actions()) + this.quarter; }
  private fcCache = new Map<string, Forecast>();
  /** what one extra action would do on top of the current plan (pure look-ahead, cached) */
  forecast(extra: Action[], wijk: WijkId | null = null): Forecast {
    const k = this.key() + JSON.stringify(extra) + wijk;
    let f = this.fcCache.get(k);
    if (!f) { if (this.fcCache.size > 200) this.fcCache.clear(); f = forecast(this.state, this.actions(), extra, cfg, wijk); this.fcCache.set(k, f); }
    return f;
  }
  /** exactly what would happen if the player pressed "Volgend kwartaal" now (the sim is deterministic) */
  preview(): GameState {
    const k = this.key();
    if (k !== this.cachePlan || !this.cachePreview) { this.cachePlan = k; this.cachePreview = tick(this.state, this.actions(), cfg); }
    return this.cachePreview;
  }
  planCapex() { return this.plan.reduce((a, p) => a + p.cost, 0) + this.momentCost(); }
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
  has(kind: ItemKind, wijk?: WijkId, role?: HireRole) { return this.plan.filter((p) => p.kind === kind && (!wijk || p.wijk === wijk) && (!role || p.role === role)).length; }

  // ---------------------------------------------------------------- build helpers
  buildItem(kind: 'garage' | 'automaat' | 'scanauto' | 'stalling', wijk: WijkId, lot?: { id: number; sub: number }): Omit<PlanItem, 'id'> {
    const a = cfg.assets[kind], n = batchOf(kind);
    const action: Action = kind === 'scanauto' ? { type: 'build', asset: 'scanauto', count: 1 } : { type: 'build', asset: kind, wijk, count: n };
    return { kind, action, wijk, cost: a.capex * n, perYear: a.opex * n, lot, n };
  }
  hireItem(team: TeamId): Omit<PlanItem, 'id'> { const role = hireRoleOf(team); return { kind: 'hire', role, team, action: { type: 'hire', role, n: 1 }, cost: 0, perYear: salaryOf(team) }; }
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
  loads(s: GameState = this.state) { const l = teamLoadsT(s, cfg); return { loads: l, levels: Object.fromEntries(TEAMS.map((r) => [r, teamLevel(l[r], cfg)])) as Record<TeamId, TeamLevel> }; }
  /** per team: people now, hires on their way (incl. this plan), steady need, and the load in the state `s` */
  teamViews(s: GameState = this.state): Record<TeamId, TeamView> {
    const need = teamNeeds(s, cfg, counts(s, true)), out = {} as Record<TeamId, TeamView>;
    for (const t of TEAMS) {
      const u = s.teams!.units[t], role = hireRoleOf(t);
      const coming = s.hiring.filter((h) => h.role === role).reduce((a, h) => a + h.n, 0) + this.plan.filter((p) => p.role === role).length;
      out[t] = { id: t, fte: u.fte, coming, need: need[t], demand: u.demand, load: u.load, level: teamLevel(u.load, cfg), parts: u.parts, backlog: u.achterstand };
    }
    return out;
  }
  wijkDetail(id: WijkId, s: GameState = this.shown): WijkDetail {
    const w = s.wijken[id], k = UI_CFG.klachten;
    const raw = Math.max(0, w.m.search - k.floor) * ((w.pop + w.newPop) / 1000) * k.perMinPerKResident + (w.introLeft > 0 ? k.intro : 0) + (w.paid && w.tariff === 'hoog' ? k.hoog : 0);
    const klachten = Math.round(raw);
    return {
      id, bez: w.m.bez, search: w.m.search, revenue: w.m.revenue, revenuePerYear: w.m.revenue * 4, paid: w.paid, tariff: w.tariff, garages: w.garages.length, naleving: w.m.naleving, introLeft: w.introLeft,
      klachten, klachtenLevel: klachten >= 40 ? 'hoog' : klachten >= 15 ? 'middel' : 'laag', overvolOneIn: w.m.bez > 1.005 ? Math.max(2, Math.round(w.m.bez / (w.m.bez - 1))) : null,
    };
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
    const L = teamLoadsT(next, cfg);
    const levels = Object.fromEntries(TEAMS.map((x) => [x, teamLevel(L[x], cfg)])) as Record<TeamId, TeamLevel>;
    if (TEAMS.some((x) => levels[x] === 'rood')) this.redEver = true;
    const res: QuarterResult = {
      q: before.quarter, year: this.year,
      blijOld: rOld.blij, blijNew: r.blij,
      personaOld: Object.fromEntries(PERSONAS.map((p) => [p, (rOld as any)[p]])), personaNew: Object.fromEntries(PERSONAS.map((p) => [p, (r as any)[p]])),
      money,
      wijken: (cfg.wijkOrder as WijkId[]).map((id) => ({ id, bezOld: old.wijken[id].m.bez, bezNew: next.wijken[id].m.bez, searchOld: old.wijken[id].m.search, searchNew: next.wijken[id].m.search, revenueNew: next.wijken[id].m.revenue })),
      causes: explain(old, next, cfg, 3), loads: L, levels, moment: this.isMomentQuarter() ? [...this.momentPicks] : null, dilemma: this.dilemmaChoice, items, messages: next.messages, next, old,
    };
    this.prev = before;
    this.state = next; this.shown = next; this.plan = []; this.momentPicks = []; this.dilemmaChoice = null;
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
