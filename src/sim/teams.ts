// Team workload layer ("Jaar 1"): five teams with capacity (FTE), work pool and backlog. Pure and deterministic.
// Everything is gated behind `config.teams.enabled`; the legacy 10-year model never calls into here.
// Units are FTE-equivalents per quarter: a team with 4 FTE can finish 4 FTE of work per quarter.
// Chain (docs/KETENS.md): scanauto -> handhaving -> scans -> backoffice -> bezwaren -> klantcontact;
// automaten/garages -> techniek (storingen); garages/stallingen -> schoonmaak; tariff change / introduction -> klantcontact + bezwaar peak.
import type { Config, GameState, TeamId, TeamUnit, TeamsState } from './types';
import { TEAMS, TEAM_ROLE } from './types';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const teamsOn = (c: Config): boolean => !!c.teams?.enabled;

export interface AssetCounts { garage: number; stalling: number; automaat: number; pr: number; scanauto: number }

const zeroPulse = (): TeamsState['pulse'] => ({ handhaving: {}, backoffice: {}, techniek: {}, schoonmaak: {}, klantcontact: {} });

/** Work that the given assets generate every quarter, per team and per driver (driver keys are used for tooltips). */
export function steadyParts(s: GameState, c: Config, n: AssetCounts, malf: number): Record<TeamId, Record<string, number>> {
  const a = c.assets, t = c.teams, m = c.model;
  const spots = (id: string) => s.wijken[id].streetSpots / 1000;
  const intro = sum(Object.values(s.wijken).filter(w => w.introLeft > 0).map(w => spots(w.id) * t.klantcontact.introPerKSpot));
  return {
    handhaving: { scanautos: n.scanauto * a.scanauto.staff.handhaver },
    backoffice: { scans: n.scanauto * t.backoffice.perScanauto, bezwaren: s.objections / t.backoffice.bezwaarPerFTE },
    techniek: { garages: n.garage * a.garage.staff.monteur, automaten: n.automaat / a.automaat.automatenPerMonteur, storingen: n.automaat * malf * t.techniek.storingPerAutomaat },
    schoonmaak: { garages: n.garage * a.garage.staff.schoonmaker, stallingen: n.stalling * a.stalling.staff.schoonmaker, pr: n.pr * a.pr.staff.schoonmaker },
    klantcontact: { scanautos: n.scanauto * a.scanauto.staff.klantcontact, klachten: s.objections / m.objectionsPerFTE, invoering: intro },
  };
}

/** Steady-state FTE each team needs for the given asset counts (no lag, no backlog). Used for hints, bots and Sap. */
export function teamNeeds(s: GameState, c: Config, n: AssetCounts): Record<TeamId, number> {
  const p = steadyParts(s, c, n, s.teams?.malfPrev ?? 0);
  return Object.fromEntries(TEAMS.map(t => [t, sum(Object.values(p[t]))])) as Record<TeamId, number>;
}

export const teamFte = (s: GameState, t: TeamId): number => { const r = TEAM_ROLE[t]; return r ? s.staff[r] : s.teams!.units.backoffice.fte; };

export function initTeams(s: GameState, c: Config): TeamsState {
  const units = {} as Record<TeamId, TeamUnit>;
  const n = { garage: sum(Object.values(s.wijken).map(w => w.garages.length)), stalling: 0, automaat: sum(Object.values(s.wijken).map(w => w.automaten)), pr: 0, scanauto: s.scanautos };
  const malf = c.model.malfunction.base * (1 - s.appShare);
  const parts = steadyParts(s, c, n, malf);
  for (const t of TEAMS) {
    const demand = sum(Object.values(parts[t]));
    const role = TEAM_ROLE[t];
    const fte = role ? s.staff[role] : c.teams.backoffice.startFte;
    units[t] = { fte, demand, pool: demand, done: demand, achterstand: 0, load: fte > 0 ? demand / fte : 0, parts: parts[t] };
  }
  return { units, pulse: zeroPulse(), malfPrev: malf, moment: null, dilemma: null };
}

/** Called at the start of every tick (after cloning): clears the one-off pulses and the Moment of the previous quarter. */
export function resetPulses(s: GameState, c: Config) {
  const T = s.teams!;
  T.pulse = zeroPulse(); T.moment = null;
  const mc = c.teams.moment;
  if (mc && s.quarter === mc.quarter) T.moment = { id: mc.id, picks: [], eff: {} };
}

/** Adds the workload peak of a policy action (tariff change / introduction of paid parking) in one wijk. */
export function policyPulse(s: GameState, c: Config, wijk: string, introduce: boolean) {
  const k = s.wijken[wijk].streetSpots / 1000, t = c.teams.policyPulse[introduce ? 'introduce' : 'tariff'];
  const T = s.teams!;
  T.pulse.klantcontact[`beleid_${wijk}`] = k * t.klantcontact;
  T.pulse.backoffice[`beleid_${wijk}`] = k * t.backoffice;
}

export interface MomentMods { garageReach: number; errantMult: number; garageRevMult: number; visitorsMult: number; residentsMult: number }
export interface TeamsBegin { rM: number; rS: number; eB: number; scanActive: number; mods: MomentMods; dil: { revMult: Record<string, number>; visitorsMult: Record<string, number> } }

/** Computes the five team units for this quarter (before the model uses staff ratios) and the effects that follow from them. */
export function teamsBegin(s: GameState, c: Config, lagN: AssetCounts): TeamsBegin {
  const T = s.teams!, tc = c.teams;
  // dilemma and moment workload
  const dilCfg = T.dilemma && T.dilemma.left > 0 ? tc.dilemma?.options?.[T.dilemma.choice] : null;
  if (dilCfg?.load) for (const [tm, v] of Object.entries(dilCfg.load)) T.pulse[tm as TeamId][`dilemma`] = v as number;
  const parts = steadyParts(s, c, lagN, T.malfPrev);
  for (const t of TEAMS) {
    const u = T.units[t], role = TEAM_ROLE[t];
    const fte = role ? s.staff[role] : u.fte;
    const all = { ...parts[t], ...T.pulse[t] };
    const demand = sum(Object.values(all));
    const prevBacklog = u.achterstand * (1 - tc.backlogDecay); // overtime, temp staff and people giving up: old backlog shrinks by itself
    const pool = demand + prevBacklog;
    const done = Math.min(pool, fte);
    T.units[t] = { fte, demand, pool, done, achterstand: pool - done, load: pool <= 1e-9 ? 0 : fte > 0.001 ? pool / fte : 9, parts: all };
  }
  const U = T.units;
  const ratio = (t: TeamId) => U[t].pool > 1e-9 ? Math.min(2, U[t].fte / U[t].pool) : 2;
  const eff = (t: TeamId) => U[t].pool > 1e-9 ? clamp(U[t].fte / U[t].pool, 0, 1) : 1;
  // Moment: the partners decide first (always), then Parkeren's own picks work as well as the teams behind them can deliver
  const mods: MomentMods = { garageReach: 1, errantMult: 1, garageRevMult: 1, visitorsMult: 1, residentsMult: 1 };
  if (T.moment) {
    const mc = tc.moment;
    mods.garageReach = mc.partner.garageReach;
    for (const p of T.moment.picks) {
      const spec = mc.picks[p]; if (!spec) continue;
      const e = Object.keys(spec.load ?? {}).length ? Math.min(...Object.keys(spec.load).map(tm => eff(tm as TeamId))) : 1;
      T.moment.eff[p] = e;
      const lerp = (v: number) => 1 + (v - 1) * e;
      mods.errantMult *= lerp(spec.errantMult ?? 1); mods.garageRevMult *= lerp(spec.garageRevMult ?? 1);
      mods.visitorsMult *= lerp(spec.visitorsMult ?? 1); mods.residentsMult *= lerp(spec.residentsMult ?? 1);
      mods.garageReach += (spec.garageReachAdd ?? 0) * e;
    }
  }
  return { rM: ratio('techniek'), rS: ratio('schoonmaak'), eB: eff('backoffice'), scanActive: lagN.scanauto, mods, dil: { revMult: dilCfg?.revMult ?? {}, visitorsMult: dilCfg?.visitorsMult ?? {} } };
}

/** After the klant backlog is known: settle the klantcontact unit and return the persona penalties of overloaded teams. */
export function teamsEnd(s: GameState, c: Config, malfEff: number): { wethouder: number; bewoner: number } {
  const T = s.teams!, tc = c.teams, per = c.model.objectionsPerFTE;
  const k = T.units.klantcontact, back = s.klantBacklog / per;
  T.units.klantcontact = { ...k, achterstand: back, done: Math.max(0, k.pool - back) };
  T.malfPrev = malfEff;
  let w = 0, b = 0;
  for (const t of TEAMS) {
    const sev = clamp((T.units[t].load - tc.penalty.from) / tc.penalty.span, 0, 1);
    w += sev * (tc.penalty.wethouder[t] ?? 0); b += sev * (tc.penalty.bewoner[t] ?? 0);
  }
  if (T.dilemma && T.dilemma.left > 0) T.dilemma.left--;
  return { wethouder: w, bewoner: b };
}
