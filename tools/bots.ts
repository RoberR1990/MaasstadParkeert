import type { Action, Config, GameState, Role } from '../src/sim/types';
import { ROLES } from '../src/sim/types';
import { ovLevel, staffNeeds } from '../src/sim/model';
import { makeRng } from '../src/sim/rng';

export type Bot = { name: string; act: (s: GameState, c: Config) => Action[] };
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
/** Guard log: per bot, how often a purchase was rejected by the budget guard (label -> count). Filled by run.ts consumers. */
export const guardLog: Record<string, Record<string, number>> = {};
let curBot = '';
const queued = (s: GameState, asset: string, wijk?: string) => sum(s.queue.filter(x => x.asset === asset && (!wijk || x.wijk === wijk)).map(x => x.count));

/** Hire so that (FTE + pipeline) covers need (incl. queued builds) x margin. Max 3 per role per quarter is enforced by the sim. */
function keepStaff(s: GameState, c: Config, margin: number): Action[] {
  const need = staffNeeds(s, c, true), out: Action[] = [];
  for (const r of ROLES as Role[]) {
    const have = s.staff[r] + sum(s.hiring.filter(h => h.role === r).map(h => h.n));
    const gap = need[r] * margin - have;
    if (gap > 0.05) out.push({ type: 'hire', role: r, n: Math.min(c.staff.maxHirePerRolePerQuarter, Math.ceil(gap)) });
  }
  return out;
}
/** Budget guard shared by the careful bots: one-off cost must fit in (fonds - reserve), recurring cost must fit in the structural yearly slack. */
function mkSpend(s: GameState, c: Config) {
  const h = s.history[s.history.length - 1];
  const burn = h ? Math.max(0, h.costs - h.revenue) * (c.finance.budgetEvery - (s.quarter % c.finance.budgetEvery)) : 0; // running deficit until the next budget arrives
  let cash = s.fonds - c.bots.reserve - burn, slack = h ? s.yearBudget + 4 * (h.revenue - h.costs) : s.yearBudget;
  return (x: number, yr = 0, label = '?') => {
    if (cash < x || slack - yr < c.bots.minSlack) {
      const g = (guardLog[curBot] ??= {}); const k = `${label} (${cash < x ? 'cash' : 'slack'})`; g[k] = (g[k] ?? 0) + 1;
      return false;
    }
    cash -= x; slack -= yr; return true;
  };
}
const repairs = (s: GameState, c: Config, reserve: number): Action[] => {
  const out: Action[] = []; let budget = s.fonds - reserve;
  for (const w of Object.values(s.wijken)) for (const kind of ['garage', 'stalling'] as const)
    (kind === 'garage' ? w.garages : w.stallings).forEach((x, index) => {
      const cost = c.finance.repairCost[kind];
      if (x.closed && budget >= cost) { out.push({ type: 'repair', wijk: w.id, kind, index }); budget -= cost; }
    });
  return out;
};
const lobbyAll = (s: GameState, c: Config): Action[] =>
  Object.values(s.wijken).filter(w => w.ovBase < c.ov.maxLevel && s.quarter - w.lastLobbyQ >= c.ov.lobbyCooldown).map(w => ({ type: 'lobby' as const, wijk: w.id }));
const bikeShortOf = (w: GameState['wijken'][string], c: Config) =>
  Math.max(0, w.bikeDemand - (w.bikeSpots + w.bikeRacks * c.assets.nietjes.cap + sum(w.stallings.map(x => x.cap))));
const autoTarget = (w: GameState['wijken'][string], s: GameState, c: Config) =>
  Math.ceil(w.streetSpots / c.assets.automaat.spotsPerAutomaat * (1 - s.appShare) / (1 - c.model.appShare.start));

/** Paid parking where pressure is high: machines first, then introduce (one wijk at a time), keep machines and scan cars in line. Pricing is a policy, not a build. */
function paidParking(s: GameState, c: Config, spend: ReturnType<typeof mkSpend>, out: Action[]) {
  let intro = Object.values(s.wijken).some(x => x.introLeft > 0);
  const W = Object.values(s.wijken).sort((a, b) => b.m.bez - a.m.bez);
  for (const w of W) {
    const lack = autoTarget(w, s, c) - w.automaten - queued(s, 'automaat', w.id);
    if ((w.paid || w.m.bez > c.bots.paidBezTrigger) && lack > 0 && spend(lack * c.assets.automaat.capex, 0, 'automaat')) out.push({ type: 'build', asset: 'automaat', wijk: w.id, count: lack });
    else if (!w.paid && w.m.bez > c.bots.paidBezTrigger && lack <= 0 && queued(s, 'automaat', w.id) === 0 && !intro) { out.push({ type: 'introducePaid', wijk: w.id, level: 'midden' }); intro = true; }
  }
  const paidSpots = sum(W.filter(w => w.paid).map(w => w.streetSpots));
  if ((s.scanautos + queued(s, 'scanauto')) * c.assets.scanauto.coverage < paidSpots * 0.9 && spend(c.assets.scanauto.capex, 0, 'scanauto')) out.push({ type: 'build', asset: 'scanauto', count: 1 });
}

export const nietsdoen: Bot = { name: 'nietsdoen', act: () => [] };

/** Builds garages + payment machines as fast as money allows, never hires, never repairs. */
export const bouwwoede: Bot = {
  name: 'bouwwoede',
  act(s, c) {
    const out: Action[] = [];
    const h = s.history[s.history.length - 1]; // keeps only enough cash to cover the running deficit until the next budget moment, nothing more
    let cash = s.fonds - (h ? Math.max(0, h.costs - h.revenue) * (c.finance.budgetEvery - (s.quarter % c.finance.budgetEvery)) : 0);
    const W = Object.values(s.wijken).sort((a, b) => b.m.bez - a.m.bez);
    for (const w of W) { // machines first (cheap), only in paid wijken
      if (!w.paid) continue;
      const lack = w.streetSpots / c.assets.automaat.spotsPerAutomaat - w.automaten - queued(s, 'automaat', w.id);
      if (lack >= 1) { out.push({ type: 'build', asset: 'automaat', wijk: w.id, count: Math.ceil(lack) }); cash -= lack * c.assets.automaat.capex; }
    }
    for (const w of W) {
      if (cash < c.assets.garage.capex) break;
      if (w.garages.length + queued(s, 'garage', w.id) < c.assets.garage.maxPerWijk) { out.push({ type: 'build', asset: 'garage', wijk: w.id }); cash -= c.assets.garage.capex; }
    }
    return out;
  },
};

/** Moderate builder: staffs every asset (ratio >= margin), repairs, enforces, adds capacity only under pressure. */
export const beheerder: Bot = {
  name: 'beheerder',
  act(s, c) {
    const out: Action[] = [...repairs(s, c, 0)], B = c.bots, spend = mkSpend(s, c);
    out.push(...lobbyAll(s, c));
    const W = Object.values(s.wijken);
    let garageThisQ = false, introThisQ = Object.values(s.wijken).some(x => x.introLeft > 0); // introduce paid parking one wijk at a time
    for (const w of W.sort((a, b) => b.m.bez - a.m.bez)) {
      // paid parking where pressure is high (needs machines + enforcement first)
      if (!w.paid && w.m.bez > B.paidBezTrigger) {
        const lack = Math.ceil(w.streetSpots / c.assets.automaat.spotsPerAutomaat * (1 - s.appShare) / (1 - c.model.appShare.start)) - w.automaten - queued(s, 'automaat', w.id);
        if (lack > 0 && spend(lack * c.assets.automaat.capex, 0, 'automaat')) out.push({ type: 'build', asset: 'automaat', wijk: w.id, count: lack });
        else if (lack <= 0 && queued(s, 'automaat', w.id) === 0 && !introThisQ) { out.push({ type: 'introducePaid', wijk: w.id, level: 'midden' }); introThisQ = true; }
      }
      if (w.paid) {
        const lack = autoTarget(w, s, c) - w.automaten - queued(s, 'automaat', w.id);
        if (lack > 0 && spend(lack * c.assets.automaat.capex, 0, 'automaat')) out.push({ type: 'build', asset: 'automaat', wijk: w.id, count: lack });
        if (!garageThisQ && w.m.bez > B.garageBezTrigger && w.garages.length + queued(s, 'garage', w.id) < c.assets.garage.maxPerWijk
          && queued(s, 'garage') === 0 && spend(c.assets.garage.capex, c.assets.garage.opex * 1.2, 'garage')) { out.push({ type: 'build', asset: 'garage', wijk: w.id }); garageThisQ = true; }
      }
      const short = bikeShortOf(w, c);
      if (short > w.bikeDemand * B.bikeShortTrigger && queued(s, 'stalling', w.id) === 0 && spend(c.assets.stalling.capex, c.assets.stalling.opex * 1.5, 'stalling')) out.push({ type: 'build', asset: 'stalling', wijk: w.id });
      else if (short > w.bikeDemand * 0.1 && queued(s, "nietjes", w.id) === 0 && w.bikeRacks < c.assets.nietjes.maxRacksPerWijk) { const n = Math.min(5, Math.ceil(short / c.assets.nietjes.cap), c.assets.nietjes.maxRacksPerWijk - w.bikeRacks - queued(s, "nietjes", w.id)); if (spend(n * c.assets.nietjes.capex, 0, 'nietjes')) out.push({ type: 'build', asset: 'nietjes', wijk: w.id, count: n }); }
    }
    // enforcement: keep scan capacity >= 90% of paid street spots
    const paidSpots = sum(W.filter(w => w.paid).map(w => w.streetSpots));
    const scanHave = s.scanautos + queued(s, 'scanauto');
    if (scanHave * c.assets.scanauto.coverage < paidSpots * 0.9 && spend(c.assets.scanauto.capex, 0, 'scanauto')) out.push({ type: 'build', asset: 'scanauto', count: 1 });
    out.push(...keepStaff(s, c, B.staffMargin));
    return out;
  },
};

/** OV, P+R, bikes and shared mobility first; at most one garage under severe pressure. Staffs its own assets. */
export const ovFirst: Bot = {
  name: 'ov-first',
  act(s, c) {
    const out: Action[] = [...repairs(s, c, 0)], B = c.bots, spend = mkSpend(s, c);
    out.push(...lobbyAll(s, c));
    paidParking(s, c, spend, out);
    const W = Object.values(s.wijken);
    // pay for extra OV frequency: rand first, then the busiest wijken, at most 2 at a time, only when 3 years of payments are in the bank
    const prio = ['rand', 'centrum', 'oudwest', 'pleinzuid', 'kopbrug'];
    let paying = W.filter(w => w.ovPaying).length;
    for (const id of prio) {
      const w = s.wijken[id];
      if (!w.ovPaying && paying < 2 && ovLevel(w, c) < c.ov.maxLevel && spend(c.ov.payPerYear, c.ov.payPerYear, 'ovPay')) { out.push({ type: 'ovPay', wijk: id, on: true }); paying++; }
      if (w.ovPaying && (w.ovBase >= c.ov.maxLevel || s.fonds < B.reserve / 2)) { out.push({ type: 'ovPay', wijk: id, on: false }); paying--; }
    }
    const rand = s.wijken.rand;
    if (ovLevel(rand, c) >= c.assets.pr.minOv && rand.pr + queued(s, 'pr') < 2 && spend(c.assets.pr.capex, c.assets.pr.opex * 1.5, 'pr')) out.push({ type: 'build', asset: 'pr', wijk: 'rand' });
    for (const w of W) {
      const short = bikeShortOf(w, c);
      if (short > w.bikeDemand * B.bikeShortTrigger && queued(s, 'stalling', w.id) === 0 && spend(c.assets.stalling.capex, c.assets.stalling.opex * 1.5, 'stalling')) out.push({ type: 'build', asset: 'stalling', wijk: w.id });
      else if (short > w.bikeDemand * 0.1 && queued(s, "nietjes", w.id) === 0 && w.bikeRacks < c.assets.nietjes.maxRacksPerWijk) { const n = Math.min(5, Math.ceil(short / c.assets.nietjes.cap), c.assets.nietjes.maxRacksPerWijk - w.bikeRacks - queued(s, "nietjes", w.id)); if (spend(n * c.assets.nietjes.capex, 0, 'nietjes')) out.push({ type: 'build', asset: 'nietjes', wijk: w.id, count: n }); }
    }
    for (const id of ['havenkwartier', 'pleinzuid', 'kopbrug']) { // low parking norm + shared hubs where new housing arrives
      const w = s.wijken[id];
      if (w.newPop > 0 && w.hubs + queued(s, 'hub', id) < 2 && spend(c.assets.hub.capex, c.assets.hub.opex, 'hub')) out.push({ type: 'build', asset: 'hub', wijk: id });
      if (w.newPop > 0 && w.hubs > 0 && w.norm !== 'laag') out.push({ type: 'setNorm', wijk: id, level: 'laag' });
    }
    const worst = [...W].sort((a, b) => b.m.bez - a.m.bez)[0];
    if (worst.m.bez > 1.15 && worst.garages.length + queued(s, 'garage', worst.id) < 2 && queued(s, 'garage') === 0 && s.quarter > 8 && spend(c.assets.garage.capex, c.assets.garage.opex * 1.5, 'garage'))
      out.push({ type: 'build', asset: 'garage', wijk: worst.id });
    out.push(...keepStaff(s, c, 1.05));
    return out;
  },
};

/** Max enforcement and high tariffs everywhere; builds only machines and scan cars (and what repairs need). */
export const handhaver: Bot = {
  name: 'handhaver',
  act(s, c) {
    const out: Action[] = [...repairs(s, c, 0)], spend = mkSpend(s, c);
    const W = Object.values(s.wijken);
    for (const w of W) {
      const lack = autoTarget(w, s, c) - w.automaten - queued(s, 'automaat', w.id);
      if (w.paid && lack > 0 && spend(lack * c.assets.automaat.capex, 0, 'automaat')) out.push({ type: 'build', asset: 'automaat', wijk: w.id, count: lack });
      if (!w.paid && w.automaten + queued(s, 'automaat', w.id) >= Math.ceil(w.streetSpots / c.assets.automaat.spotsPerAutomaat * (1 - s.appShare) / (1 - c.model.appShare.start))) out.push({ type: 'introducePaid', wijk: w.id, level: 'hoog' });
      else if (!w.paid && lack > 0 && spend(lack * c.assets.automaat.capex, 0, 'automaat')) out.push({ type: 'build', asset: 'automaat', wijk: w.id, count: lack });
      if (w.paid && w.tariff !== 'hoog' && w.introLeft <= 0) out.push({ type: 'setTariff', wijk: w.id, level: 'hoog' });
    }
    const paidSpots = sum(W.filter(w => w.paid || w.automaten > 0).map(w => w.streetSpots));
    const scanHave = s.scanautos + queued(s, 'scanauto');
    if (scanHave * c.assets.scanauto.coverage < paidSpots * 1.05 && spend(c.assets.scanauto.capex, 0, 'scanauto')) out.push({ type: 'build', asset: 'scanauto', count: 1 });
    out.push(...keepStaff(s, c, c.bots.staffMargin));
    return out;
  },
};

/** Only bike facilities: stallings and racks wherever there is a shortage. Staffs the stallings. */
export const fietser: Bot = {
  name: 'fietser',
  act(s, c) {
    const out: Action[] = [...repairs(s, c, 0)], spend = mkSpend(s, c);
    for (const w of Object.values(s.wijken)) {
      const short = bikeShortOf(w, c) - queued(s, 'stalling', w.id) * c.assets.stalling.cap;
      if (short > c.assets.stalling.cap * 0.5 && spend(c.assets.stalling.capex, c.assets.stalling.opex * 1.5, 'stalling')) out.push({ type: 'build', asset: 'stalling', wijk: w.id });
      else if (short > 0 && w.bikeRacks + queued(s, 'nietjes', w.id) < c.assets.nietjes.maxRacksPerWijk) {
        const n = Math.min(5, Math.ceil(short / c.assets.nietjes.cap), c.assets.nietjes.maxRacksPerWijk - w.bikeRacks - queued(s, 'nietjes', w.id));
        if (n > 0 && spend(n * c.assets.nietjes.capex, 0, 'nietjes')) out.push({ type: 'build', asset: 'nietjes', wijk: w.id, count: n });
      }
    }
    out.push(...keepStaff(s, c, c.bots.staffMargin));
    return out;
  },
};

/** Random legal actions (0-3 per quarter), seeded by game seed + quarter so runs are reproducible. */
export const random: Bot = {
  name: 'random',
  act(s, c) {
    const rng = makeRng(s.seed * 7919 + s.quarter * 104729 + 13);
    const pick = <T,>(a: T[]) => a[Math.floor(rng.next() * a.length)];
    const ids: string[] = c.wijkOrder, out: Action[] = [];
    const n = Math.floor(rng.next() * 4);
    for (let i = 0; i < n; i++) {
      const w = s.wijken[pick(ids)], k = Math.floor(rng.next() * 12);
      switch (k) {
        case 0: out.push({ type: 'build', asset: 'garage', wijk: w.id, removeStreet: rng.next() < 0.3 }); break;
        case 1: out.push({ type: 'build', asset: 'automaat', wijk: w.id, count: 1 + Math.floor(rng.next() * 10) }); break;
        case 2: out.push({ type: 'build', asset: 'scanauto', count: 1 }); break;
        case 3: out.push({ type: 'build', asset: rng.next() < 0.5 ? 'stalling' : 'nietjes', wijk: w.id }); break;
        case 4: out.push(w.paid ? { type: 'setTariff', wijk: w.id, level: pick(['laag', 'midden', 'hoog'] as const) } : { type: 'introducePaid', wijk: w.id, level: pick(['laag', 'midden', 'hoog'] as const) }); break;
        case 5: out.push({ type: 'setPermit', wijk: w.id, level: pick(['ruim', 'normaal', 'krap'] as const) }); break;
        case 6: out.push({ type: 'setNorm', wijk: w.id, level: pick(['hoog', 'midden', 'laag'] as const) }); break;
        case 7: out.push({ type: 'ovPay', wijk: w.id, on: rng.next() < 0.6 }); break;
        case 8: out.push({ type: 'lobby', wijk: w.id }); break;
        case 9: out.push({ type: 'hire', role: pick(ROLES as Role[]), n: 1 + Math.floor(rng.next() * 3) }); break;
        case 10: out.push({ type: 'fire', role: pick(ROLES as Role[]), n: 1 + Math.floor(rng.next() * 2) }); break;
        default: out.push({ type: 'build', asset: pick(['hub', 'pr'] as const), wijk: pick([w.id, 'rand']) }); break;
      }
    }
    return out;
  },
};

export const BOTS: Bot[] = [nietsdoen, bouwwoede, beheerder, ovFirst, handhaver, fietser, random];
/** Run a bot's act() with its name registered for guard logging. */
export const actAs = (bot: Bot, s: GameState, c: Config) => { curBot = bot.name; return bot.act(s, c); };
