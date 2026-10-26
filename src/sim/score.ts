import type { Config, GameState, Score } from './types';

export const PERSONAS = ['bewoner', 'ondernemer', 'bezoeker', 'fietser', 'stad', 'wethouder'] as const;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const searchSat = (t: number, c: Config) => 100 * clamp(1 - (t - c.model.search.base) / (c.score.searchBad - c.model.search.base), 0, 1);

export interface GlobalMetrics { malfEff: number; bikeShort: number; newClosures: number; closedCount: number }

/** Persona satisfaction (0-100) for the quarter just simulated, plus the weighted "blije Rotterdammer". */
export function evaluate(s: GameState, c: Config, g: GlobalMetrics) {
  const sc = c.score, W = Object.values(s.wijken);
  const wsum = (f: (w: GameState['wijken'][string]) => number, wt: (w: GameState['wijken'][string]) => number) => {
    let a = 0, b = 0; for (const w of W) { const x = wt(w); a += x * f(w); b += x; } return b > 0 ? a / b : 0;
  };
  const resW = (w: any) => w.pop + w.newPop;
  const intro = W.filter(w => w.introLeft > 0).length;
  const klantPen = Math.min(sc.klantPenaltyMax, s.klantBacklog * sc.klantPenaltyPer);
  const bikeSat = 100 * (1 - Math.min(1, g.bikeShort / sc.bikeBad));

  const p = sc.bewonerParts;
  const waitSat = 100 * (1 - Math.min(1, wsum(w => w.m.waitShare, resW) * sc.waitSens));
  const bewoner = clamp(p.search * searchSat(wsum(w => w.m.search, resW), c) + p.wait * waitSat + p.netheid * s.netheid + p.bike * bikeSat
    - intro * sc.introPenaltyBewoner - klantPen, 0, 100);

  const po = sc.ondernemerParts;
  const shop = (w: any) => sc.shopWeights[w.id] ?? 0;
  const ondernemer = clamp(po.search * searchSat(wsum(w => w.m.search, shop), c)
    + po.tariff * wsum(w => (w.paid ? sc.tariffSat[w.tariff] : 100), shop), 0, 100);

  const pb = sc.bezoekerParts;
  const assets = W.flatMap(w => w.garages);
  const garageSat = assets.length ? assets.reduce((a, x) => a + (x.closed ? 0 : 100 * (1 - Math.min(1, x.backlog / c.model.maintenance.closeAt))), 0) / assets.length : 100;
  const tariffSatV = wsum(w => (w.paid ? sc.tariffSat[w.tariff] : 100), w => sc.visitorWeights[w.id] ?? 0);
  const bezoeker = clamp(pb.search * searchSat(wsum(w => w.m.search, w => sc.visitorWeights[w.id] ?? 0), c) + (pb.tariff ?? 0) * tariffSatV
    + pb.storing * 100 * (1 - Math.min(1, g.malfEff * sc.storingSens)) + pb.garage * garageSat, 0, 100);

  const removed = W.reduce((a, w) => a + w.removedStreet, 0);
  const green = Math.min(100, sc.greenBase + removed * sc.greenPerRemovedSpot);
  const ps = sc.stadParts;
  const stad = clamp(ps.netheid * s.netheid + ps.bike * bikeSat + ps.green * green, 0, 100);

  const pw = sc.wethouderParts;
  const budgetSat = s.fonds >= 0 ? 70 + 30 * Math.min(1, s.fonds / sc.fondsHappy) : 40 * Math.max(0, 1 + s.fonds / sc.fondsNegScale);
  const incidentSat = clamp(100 - sc.incidentPerClosed * g.closedCount - sc.incidentPerNew * g.newClosures, 0, 100);
  const klachtSat = 100 * (1 - Math.min(1, s.klantBacklog / sc.klantBad));
  // "graaitarieven": the council dislikes a city that runs 'hoog' on most paid street spots; penalty grows linearly above graaiFree
  const paidSp = W.filter(w => w.paid).reduce((a, w) => a + w.streetSpots, 0), hoogSp = W.filter(w => w.paid && w.tariff === 'hoog').reduce((a, w) => a + w.streetSpots, 0);
  const hoogShare = paidSp > 0 ? hoogSp / paidSp : 0;
  const graaiPen = sc.graaiMax ? sc.graaiMax * clamp((hoogShare - sc.graaiFree) / (1 - sc.graaiFree), 0, 1) : 0;
  const wethouder = clamp(pw.budget * budgetSat + pw.incident * incidentSat + pw.klacht * klachtSat - intro * sc.introPenaltyWethouder - graaiPen, 0, 100);

  const fietser = bikeSat;
  const persona = { bewoner, ondernemer, bezoeker, fietser, stad, wethouder };
  const blij = PERSONAS.reduce((a, k) => a + persona[k] * sc.weights[k], 0);
  return { ...persona, blij };
}

/** Final score per spec section 7: mean blije Rotterdammer x100, -500 per quarter with fonds < 0, -50 per backlog point at the end. */
export function finalScore(s: GameState, c: Config): Score {
  const h = s.history, sc = c.score;
  const meanBlij = h.reduce((a, r) => a + r.blij, 0) / Math.max(1, h.length);
  const backlogEnd = h.length ? h[h.length - 1].backlog : 0;
  const persona: Record<string, number> = {};
  for (const k of PERSONAS) persona[k] = h.reduce((a, r) => a + r[k], 0) / Math.max(1, h.length);
  const penalties = s.negFondsQuarters * sc.negFondsPenaltyPerQuarter + backlogEnd * sc.backlogPenaltyPerPoint;
  return {
    score: meanBlij * sc.scoreScale - penalties,
    meanBlij, negFondsQuarters: s.negFondsQuarters, backlogEnd, fondsEnd: s.fonds, afgeroomd: s.afgeroomd, penalties, persona,
  };
}
