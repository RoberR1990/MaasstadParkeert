import type { Action, Asset, AssetKind, Config, Effect, GameState, Role, Wijk } from './types';
import { ROLES } from './types';
import { makeRng, type Rng } from './rng';
import { applyEffect, expireEffects } from './effects';
import { evaluate } from './score';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export const ovLevel = (w: Wijk, c: Config) => Math.min(c.ov.maxLevel, w.ovBase + (w.ovPaying && w.ovPayQuarters >= c.ov.payDelay ? 1 : 0));
/** Rule 3: search time in minutes. */
export const searchTime = (bez: number, c: Config) => {
  const s = c.model.search;
  return bez <= s.threshold ? s.base : Math.min(s.max, s.base + s.k * (bez - s.threshold) ** 2);
};

export function counts(s: GameState, includeQueue = false) {
  const W = Object.values(s.wijken);
  const n = { garage: sum(W.map(w => w.garages.length)), stalling: sum(W.map(w => w.stallings.length)), automaat: sum(W.map(w => w.automaten)), pr: sum(W.map(w => w.pr)), scanauto: s.scanautos };
  if (includeQueue) for (const q of s.queue) if (q.asset in n) (n as any)[q.asset] += q.count;
  return n;
}

/** FTE needed per role (rule: asset staff demand). klantcontact includes workload from last quarter's objections. */
export function staffNeeds(s: GameState, c: Config, includeQueue = false): Record<Role, number> {
  const n = counts(s, includeQueue), a = c.assets;
  return {
    monteur: n.garage * a.garage.staff.monteur + n.automaat / a.automaat.automatenPerMonteur,
    schoonmaker: n.garage * a.garage.staff.schoonmaker + n.stalling * a.stalling.staff.schoonmaker + n.pr * a.pr.staff.schoonmaker,
    handhaver: n.scanauto * a.scanauto.staff.handhaver,
    klantcontact: n.scanauto * a.scanauto.staff.klantcontact + s.objections / c.model.objectionsPerFTE,
  };
}

const blankMetrics = () => ({ demand: 0, supply: 0, bez: 0, search: 2, revenue: 0, visShare: 0, waitShare: 0, naleving: 1, ov: 0 });

export function createState(c: Config, seed: number): GameState {
  const wijken: Record<string, Wijk> = {};
  for (const id of c.wijkOrder) {
    const d = c.start.wijken[id];
    wijken[id] = {
      id, pop: d.pop, carOwn: d.carOwn, newPop: 0, visitors: d.visitors, streetSpots: d.streetSpots, removedStreet: 0,
      garages: d.garages.map((cap: number, i: number): Asset => ({ cap, backlog: d.garageBacklog?.[i] ?? 0, closed: false })), stallings: [],
      bikeSpots: d.bikeSpots, bikeRacks: 0, bikeDemand: d.bikeDemand, paid: d.paid, introLeft: 0, tariff: d.tariff, permit: d.permit, norm: d.norm,
      ovBase: d.ov, ovPaying: false, ovPayQuarters: 0, automaten: d.automaten, pr: 0, hubs: 0, lastPolicyQ: -99, lastLobbyQ: -99, m: blankMetrics(),
    };
  }
  const s: GameState = {
    quarter: 0, rngState: seed >>> 0, seed, fonds: c.finance.startFonds, yearBudget: c.finance.yearBudget, wageIndex: 1,
    appShare: c.model.appShare.start, teamMood: c.start.teamMood, staff: { monteur: 0, schoonmaker: 0, handhaver: 0, klantcontact: 0 },
    hiring: [], queue: [], scanautos: c.start.scanautos, wijken, effects: [], objections: c.model.startObjections, klantBacklog: 0,
    netheid: 80, schoonRatioPrev: 1.1, firstClosureQuarter: null, negFondsQuarters: 0, afgeroomd: 0, rejected: [], messages: [], history: [],
  };
  const need = staffNeeds(s, c);
  for (const r of ROLES) s.staff[r] = Math.round(need[r] * c.staff.startBuffer * 10) / 10;
  return s;
}

/** One quarter. Pure: returns a new state. `events` use the generic effect format and are applied this quarter. */
export function tick(prev: GameState, actions: Action[], c: Config, events: Effect[] = []): GameState {
  const s: GameState = structuredClone(prev);
  s.rejected = []; s.messages = [];
  const rng = makeRng(s.rngState), q = s.quarter;
  expireEffects(s);
  for (const g of [...(c.scenario?.growth ?? []), ...(c.scenario?.events ?? [])])
    if (g.quarter === q) { s.messages.push(g.label); for (const e of g.effects) applyEffect(s, e); }
  for (const e of events) applyEffect(s, e);
  if (q % c.finance.budgetEvery === 0) s.fonds += s.yearBudget;
  for (const a of actions) applyAction(s, a, c, rng);
  simulate(s, c, rng);
  advanceQueues(s, c);
  if ((q + 1) % c.finance.budgetEvery === 0) onderuitputting(s, c);
  s.rngState = rng.state; s.quarter++;
  return s;
}

/** Onderuitputting at year close (= the next budget moment, so also after the last quarter): fonds above the reserve cap flows back to algemene middelen and is lost. */
export function onderuitputting(s: GameState, c: Config) {
  const cap = c.finance.reserveCap;
  if (cap == null || s.fonds <= cap) return;
  const out = s.fonds - cap;
  s.fonds = cap; s.afgeroomd += out;
  const row = s.history[s.history.length - 1];
  if (row) { row.fonds = s.fonds; row.afgeroomd = s.afgeroomd; }
  s.messages.push(`Onderuitputting: ${(out / 1e6).toFixed(1)} M€ terug naar algemene middelen`);
}

function applyAction(s: GameState, a: Action, c: Config, rng: Rng) {
  const rej = (m: string) => s.rejected.push(`${a.type}: ${m}`);
  const w = 'wijk' in a && a.wijk ? s.wijken[a.wijk] : undefined;
  if ('wijk' in a && a.wijk && !w) return rej(`onbekende wijk ${a.wijk}`);
  const free = () => (w && s.quarter - w.lastPolicyQ >= c.policy.cooldownQuarters) ? true : (rej(`max 1 beleidswijziging per wijk per jaar (${w?.id})`), false);
  switch (a.type) {
    case 'build': {
      const spec = c.assets[a.asset]; if (!spec) return rej('onbekend type');
      const n = Math.max(1, Math.floor(a.count ?? 1));
      if (a.asset !== 'scanauto' && !w) return rej('wijk vereist');
      if (a.asset === 'pr') { if (w!.id !== spec.onlyIn) return rej(`alleen in ${spec.onlyIn}`); if (ovLevel(w!, c) < spec.minOv) return rej('OV-niveau te laag'); }
      if (a.asset === 'garage') {
        const have = w!.garages.length + sum(s.queue.filter(x => x.asset === 'garage' && x.wijk === w!.id).map(x => x.count));
        if (have + n > spec.maxPerWijk) return rej('maximum garages in wijk');
      }
      if (a.asset === 'nietjes' && w!.bikeRacks + sum(s.queue.filter(x => x.asset === 'nietjes' && x.wijk === w!.id).map(x => x.count)) + n > spec.maxRacksPerWijk) return rej('maximum fietsnietjes in wijk');
      const cost = spec.capex * n;
      if (!c.finance.allowDebtBuild && s.fonds < cost) return rej('onvoldoende fonds');
      s.fonds -= cost;
      s.queue.push({ asset: a.asset, wijk: w?.id ?? null, count: n, left: spec.time, removeStreet: !!a.removeStreet && a.asset === 'garage' });
      return;
    }
    case 'introducePaid':
      if (!free()) return;
      if (w!.paid) return rej('al betaald');
      Object.assign(w!, { paid: true, tariff: a.level ?? 'midden', introLeft: c.policy.introQuarters, lastPolicyQ: s.quarter });
      return;
    case 'setTariff': if (!free()) return; if (!w!.paid) return rej('wijk is niet betaald'); w!.tariff = a.level; w!.lastPolicyQ = s.quarter; return;
    case 'setPermit': if (!free()) return; w!.permit = a.level; w!.lastPolicyQ = s.quarter; return;
    case 'setNorm': if (!free()) return; w!.norm = a.level; w!.lastPolicyQ = s.quarter; return;
    case 'ovPay': if (a.on) w!.ovPaying = true; else { w!.ovPaying = false; w!.ovPayQuarters = 0; } return;
    case 'lobby':
      if (s.quarter - w!.lastLobbyQ < c.ov.lobbyCooldown) return rej('lobby max 1x per jaar per wijk');
      w!.lastLobbyQ = s.quarter;
      if (rng.next() < c.ov.lobbyChance && w!.ovBase < c.ov.maxLevel) { w!.ovBase++; s.messages.push(`Lobby geslaagd: OV in ${w!.id} +1`); }
      return;
    case 'hire': {
      const already = sum(s.hiring.filter(h => h.role === a.role && h.orderedQ === s.quarter).map(h => h.n));
      const n = Math.min(Math.floor(a.n), c.staff.maxHirePerRolePerQuarter - already);
      if (n <= 0) return rej(`max ${c.staff.maxHirePerRolePerQuarter} FTE per rol per kwartaal`);
      s.hiring.push({ role: a.role, n, left: c.staff.hireDelay, orderedQ: s.quarter });
      return;
    }
    case 'fire': {
      const n = Math.min(Math.floor(a.n), s.staff[a.role]); if (n <= 0) return;
      s.staff[a.role] -= n; s.teamMood = Math.max(0, s.teamMood - c.staff.fireMoodHit * n);
      return;
    }
    case 'repair': {
      const list = a.kind === 'garage' ? w!.garages : w!.stallings, x = list[a.index];
      if (!x) return rej('bestaat niet');
      const cost = c.finance.repairCost[a.kind];
      if (s.fonds < cost) return rej('onvoldoende fonds');
      s.fonds -= cost; x.backlog = 0; x.closed = false;
      return;
    }
  }
}

function complete(s: GameState, item: GameState['queue'][number], c: Config) {
  const w = item.wijk ? s.wijken[item.wijk] : null, n = item.count;
  switch (item.asset) {
    case 'garage': for (let i = 0; i < n; i++) w!.garages.push({ cap: c.assets.garage.cap, backlog: 0, closed: false });
      if (item.removeStreet) { const r = Math.min(w!.streetSpots, c.assets.garage.removeStreetSpots * n); w!.streetSpots -= r; w!.removedStreet += r; } break;
    case 'stalling': for (let i = 0; i < n; i++) w!.stallings.push({ cap: c.assets.stalling.cap, backlog: 0, closed: false }); break;
    case 'automaat': w!.automaten += n; break;
    case 'scanauto': s.scanautos += n; break;
    case 'nietjes': w!.bikeRacks += n; break;
    case 'pr': w!.pr += n; break;
    case 'hub': w!.hubs += n; break;
  }
}

function advanceQueues(s: GameState, c: Config) {
  for (const h of s.hiring) if (--h.left <= 0) s.staff[h.role] += h.n;
  s.hiring = s.hiring.filter(h => h.left > 0);
  for (const it of s.queue) if (--it.left <= 0) complete(s, it, c);
  s.queue = s.queue.filter(it => it.left > 0);
}

function simulate(s: GameState, c: Config, rng: Rng) {
  const m = c.model, ids: string[] = c.wijkOrder, q = s.quarter, W = ids.map(id => s.wijken[id]);

  // staff drift, wages, app share
  for (const r of ROLES) s.staff[r] *= 1 - c.staff.attritionPerQuarter * (1 + c.staff.moodAttritionK * (1 - s.teamMood / 100));
  s.teamMood = Math.min(100, s.teamMood + c.staff.moodRecover);
  s.wageIndex *= (1 + c.finance.wageInflation) ** 0.25;
  s.appShare = Math.min(m.appShare.max, s.appShare + (m.appShare.end - m.appShare.start) / c.quarters);
  const need = staffNeeds(s, c);
  const ratio = (r: Role) => need[r] > 0 ? s.staff[r] / need[r] : 2;
  const rM = ratio('monteur'), rS = ratio('schoonmaker');

  // rule 4: compliance from scan coverage
  const paidSpots = sum(W.filter(w => w.paid).map(w => w.streetSpots));
  const scanEff = Math.min(s.scanautos, s.staff.handhaver); // no enforcers => scan car does nothing
  const dekking = paidSpots > 0 ? scanEff * c.assets.scanauto.coverage / paidSpots : 1;
  const nalevingPaid = m.compliance.base + m.compliance.gain * Math.min(1, dekking);
  // rule 5: malfunctions (automaten matter less as app share grows)
  const malf = m.malfunction.base + m.malfunction.k * Math.max(0, 1 - rM);
  const malfEff = malf * (1 - s.appShare);

  // pass 1: demand per wijk (rule 1) and displaced demand
  const incoming: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]));
  const prW = s.wijken[c.assets.pr.onlyIn];
  const prOk = ovLevel(prW, c) >= c.assets.pr.minOv;
  const D: Record<string, { res: number; vis: number; wait: number }> = {};
  const season = m.seasonal[q % m.seasonal.length];
  for (const w of W) {
    const lvl = ovLevel(w, c);
    const tf = !w.paid || w.introLeft > 0 ? 1 : c.policy.tariffDemand[w.tariff];
    const pf = w.paid ? c.policy.permitFactor[w.permit] : 1;
    const prEff = prOk ? Math.min(m.prEffectCap, m.prEffectPerSpot * prW.pr * c.assets.pr.cap * (m.prTargets[w.id] ?? 0)) : 0;
    const noise = 1 + m.noise * rng.normal();
    const rawVis = w.visitors * season * noise;
    const vis = rawVis * tf * Math.max(m.minVisitorFactor, 1 - c.ov.effectPerLevel * lvl - prEff);
    // new-build cars: parking norm, shared-mobility hubs; low norm only works with OV/hub support
    const supported = lvl >= c.policy.normLowNeedsOv || w.hubs > 0;
    const nf = w.norm === 'laag' && !supported ? c.policy.normCar.midden : c.policy.normCar[w.norm];
    const hubMult = 1 - c.assets.hub.newCarReduction * Math.min(w.hubs, c.assets.hub.maxEffective);
    const nominal = w.newPop * w.carOwn;
    let newStreet = Math.max(0, nominal * nf * hubMult - nominal * c.policy.normPrivate[w.norm]);
    if (w.norm === 'laag' && !supported && newStreet > 0) {
      const out = newStreet * c.policy.normLowSpillShare; newStreet -= out;
      const nb = c.neighbors[w.id] as string[]; nb.forEach(n => incoming[n] += out / nb.length);
    }
    const resAll = w.pop * w.carOwn + newStreet;
    if (w.paid && w.introLeft <= 0) { // waterbed: priced-out visitors go to unpaid neighbours
      const nb = (c.neighbors[w.id] as string[]).filter(n => !s.wijken[n].paid);
      nb.forEach(n => incoming[n] += rawVis * (1 - tf) * m.waterbedShare / nb.length);
    }
    D[w.id] = { res: resAll * pf, vis, wait: resAll * (1 - pf) };
    w.m.ov = lvl; w.m.waitShare = w.paid ? 1 - pf : 0;
  }

  // pass 2: occupancy, search time, revenue (rules 2,3,9)
  let revenue = 0, violating = 0, naSum = 0, naW = 0;
  for (const w of W) {
    const d = D[w.id];
    const nal = w.paid ? nalevingPaid : 1;
    const streetEff = w.streetSpots * (1 - (1 - nal) * m.errantShare);
    const garageCap = sum(w.garages.map(g => g.cap * (g.closed ? m.maintenance.closedCapFactor : 1)));
    const supply = Math.max(1, streetEff + garageCap);
    const demand = d.res + d.vis + incoming[w.id];
    const bez = demand / supply, occ = Math.min(1, bez);
    const streetOcc = occ * streetEff, visShare = demand > 0 ? d.vis / demand : 0;
    const visOnStreet = streetOcc * visShare;
    const payable = s.appShare + (1 - s.appShare) * clamp(w.automaten * c.assets.automaat.spotsPerAutomaat / Math.max(1, w.streetSpots), 0, 1);
    let rev = occ * garageCap * m.garageRevenuePerSpotQuarter;
    if (w.paid) {
      rev += visOnStreet * m.paidHoursPerSpotQuarter * c.policy.tariffEur[w.tariff] * nal * payable * (1 - malfEff);
      rev += Math.min(d.res, streetEff) * m.permitFeePerQuarter;
      violating += visOnStreet * (1 - nal);
      naSum += nal * w.streetSpots; naW += w.streetSpots;
    }
    Object.assign(w.m, { demand, supply, bez, search: searchTime(bez, c), revenue: rev, visShare, naleving: nal });
    revenue += rev;
  }

  // rule 10: objections and customer-contact backlog
  const fines = violating * Math.min(1, dekking) * m.finesPerViolatingSpot;
  s.objections = fines * m.objectionRate;
  const avail = Math.max(0, s.staff.klantcontact - s.scanautos * c.assets.scanauto.staff.klantcontact);
  s.klantBacklog = Math.max(0, s.klantBacklog + s.objections - avail * m.objectionsPerFTE);

  // rule 6: maintenance backlog + closures
  let newClosures = 0, closedCount = 0, backlog = 0;
  const mt = m.maintenance;
  for (const w of W) for (const [list, r] of [[w.garages, rM], [w.stallings, rS]] as [Asset[], number][]) for (const x of list) {
    x.backlog = r < 1 ? x.backlog + (1 - r) * mt.gain : Math.max(0, x.backlog - mt.decay);
    if (x.backlog >= mt.closeAt && !x.closed) { x.closed = true; newClosures++; s.messages.push(`Garage/stalling in ${w.id} (deels) dicht`); if (s.firstClosureQuarter === null) s.firstClosureQuarter = q; }
    if (x.closed) closedCount++;
    backlog += x.backlog;
  }

  // rule 7: netheid follows last quarter's cleaning ratio; rule 8: bike shortage
  const netheidTarget = clamp(m.netheidPerRatio * s.schoonRatioPrev, 0, 100);
  s.netheid = clamp(s.netheid + (netheidTarget - s.netheid) * (m.netheidSpeed ?? 1), 0, 100); // dirt builds up (and gets cleaned) gradually
  s.schoonRatioPrev = Math.min(m.netheidRatioCap, rS);
  let short = 0, bd = 0;
  for (const w of W) {
    w.bikeDemand *= (1 + m.bikeGrowthPerYear) ** 0.25;
    const st = sum(w.stallings.map(x => x.cap * (x.closed ? mt.closedCapFactor : 1)));
    const sp = w.bikeSpots + w.bikeRacks * c.assets.nietjes.cap + st;
    short += Math.max(0, w.bikeDemand - sp); bd += w.bikeDemand;
  }
  const bikeShort = bd > 0 ? short / bd : 0;

  // finance (rule 9): everything flows into the parking fund
  const a = c.assets, n = counts(s);
  const opex = (n.garage * a.garage.opex + n.automaat * a.automaat.opex + n.scanauto * a.scanauto.opex + n.stalling * a.stalling.opex
    + sum(W.map(w => w.bikeRacks)) * a.nietjes.opex + n.pr * a.pr.opex + sum(W.map(w => w.hubs)) * a.hub.opex) / 4;
  const staffCost = sum(ROLES.map(r => s.staff[r] * c.staff.salary[r])) * s.wageIndex / 4;
  let ovCost = 0;
  for (const w of W) if (w.ovPaying) { ovCost += c.ov.payPerYear / 4; w.ovPayQuarters++; }
  const costs = opex + staffCost + ovCost + c.finance.fixedOverheadPerYear * s.wageIndex / 4;
  s.fonds += revenue - costs;
  if (s.fonds < 0) s.negFondsQuarters++;

  // personas, history; intro phase counts down afterwards
  const ev = evaluate(s, c, { malfEff, bikeShort, newClosures, closedCount });
  const wsr = (k: 'search') => sum(W.map(w => w.m[k] * (w.pop + w.newPop))) / sum(W.map(w => w.pop + w.newPop));
  s.history.push({
    q, year: c.startYear + Math.floor(q / 4), ...ev, fonds: s.fonds, revenue, costs, backlog, closed: closedCount, netheid: s.netheid,
    avgSearch: wsr('search'), searchCentrum: s.wijken.centrum.m.search, dekking, naleving: naW > 0 ? naSum / naW : 1,
    klantBacklog: s.klantBacklog, bikeShort, appShare: s.appShare, afgeroomd: s.afgeroomd,
  });
  for (const w of W) if (w.introLeft > 0) w.introLeft--;
}
