import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/sim/load';
import { createState, tick, searchTime, onderuitputting } from '../src/sim/model';
import { finalScore } from '../src/sim/score';
import { applyEffect, expireEffects } from '../src/sim/effects';
import { BOTS } from '../tools/bots';

const cfg = loadConfig();
const play = (botIdx: number, seed: number, quarters = 40) => {
  let s = createState(cfg, seed);
  for (let q = 0; q < quarters; q++) s = tick(s, BOTS[botIdx].act(s, cfg), cfg);
  return s;
};

test('determinism: same seed => identical state, different seed => different', () => {
  for (let b = 0; b < BOTS.length; b++) {
    assert.deepEqual(play(b, 7), play(b, 7));
    assert.notDeepEqual(finalScore(play(b, 7), cfg).meanBlij, finalScore(play(b, 8), cfg).meanBlij);
  }
});

test('tick is pure (input state not mutated)', () => {
  const s = createState(cfg, 3), copy = structuredClone(s);
  tick(s, [{ type: 'hire', role: 'monteur', n: 2 }], cfg);
  assert.deepEqual(s, copy);
});

test('zoektijd curve (rule 3)', () => {
  assert.equal(searchTime(0.5, cfg), 2);
  assert.equal(searchTime(0.8, cfg), 2);
  assert.ok(Math.abs(searchTime(1.0, cfg) - 3.6) < 1e-9);   // 2 + 40 * 0.2^2
  assert.ok(Math.abs(searchTime(1.3, cfg) - 12) < 1e-9);    // 2 + 40 * 0.5^2
  assert.equal(searchTime(3, cfg), 20);                     // capped
  let prev = 0; for (let b = 0.5; b < 2; b += 0.05) { const t = searchTime(b, cfg); assert.ok(t >= prev); prev = t; }
});

test('effects: add/mul/set and temporary expiry', () => {
  const s = createState(cfg, 1);
  applyEffect(s, { target: 'wijken.centrum.visitors', op: 'mul', value: 2, durationQuarters: 2 });
  applyEffect(s, { target: 'fonds', op: 'add', value: 100 });
  applyEffect(s, { target: 'wijken.centrum.tariff', op: 'set', value: 'laag', durationQuarters: 1 });
  const v0 = cfg.start.wijken.centrum.visitors;
  assert.equal(s.wijken.centrum.visitors, v0 * 2);
  expireEffects(s); assert.equal(s.wijken.centrum.tariff, 'hoog'); assert.equal(s.wijken.centrum.visitors, v0 * 2);
  expireEffects(s); assert.equal(s.wijken.centrum.visitors, v0);
  applyEffect(s, { target: 'wijken.nope.x', op: 'add', value: 1 }); assert.equal(s.rejected.length, 1);
});

test('build queue, hiring delay and hire cap', () => {
  let s = createState(cfg, 1);
  const m0 = s.staff.monteur;
  s = tick(s, [{ type: 'hire', role: 'monteur', n: 5 }, { type: 'build', asset: 'garage', wijk: 'noord' }], cfg);
  assert.equal(s.hiring[0].n, 3);                                        // capped at 3 FTE per role per quarter
  assert.ok(s.staff.monteur < m0 + 0.5);                                 // vacancy open, not arrived
  s = tick(s, [], cfg); assert.ok(s.staff.monteur > m0 + 2);             // arrived after 2 quarters
  assert.equal(s.wijken.noord.garages.length, 0);
  s = tick(s, [], cfg); assert.equal(s.wijken.noord.garages.length, 0);
  s = tick(s, [], cfg); assert.equal(s.wijken.noord.garages.length, 1);  // 4 quarters build time
});

test('policy cooldown: max 1 change per wijk per year', () => {
  let s = createState(cfg, 1);
  s = tick(s, [{ type: 'setTariff', wijk: 'centrum', level: 'laag' }, { type: 'setPermit', wijk: 'centrum', level: 'krap' }], cfg);
  assert.equal(s.wijken.centrum.tariff, 'laag'); assert.equal(s.wijken.centrum.permit, 'normaal'); assert.equal(s.rejected.length, 1);
});

test('onderuitputting: fonds above reserve cap flows back at year close and is counted', () => {
  let s = createState(cfg, 1);
  s.fonds = 50e6;
  for (let q = 0; q < 3; q++) { s = tick(s, [], cfg); assert.equal(s.afgeroomd, 0); assert.ok(s.fonds > cfg.finance.reserveCap); }
  s = tick(s, [], cfg);                                   // 4th quarter closes the budget year
  assert.equal(s.fonds, cfg.finance.reserveCap);
  assert.ok(s.afgeroomd > 20e6);
  assert.equal(s.history[3].fonds, cfg.finance.reserveCap);
  const before = s.afgeroomd; s = tick(s, [], cfg);       // no further sweep mid-year
  assert.equal(s.afgeroomd, before);
  const low = createState(cfg, 1); low.fonds = 1e6; onderuitputting(low, cfg);
  assert.equal(low.fonds, 1e6); assert.equal(low.afgeroomd, 0);   // below the cap nothing is lost
});

test('scan coverage above 100% gives no extra naleving or revenue', () => {
  const at = (mult: number) => {
    const s = createState(cfg, 5);
    const paid = Object.values(s.wijken).filter(w => w.paid).reduce((a, w) => a + w.streetSpots, 0);
    s.scanautos = (paid / cfg.assets.scanauto.coverage) * mult;
    s.staff.handhaver = s.scanautos * cfg.assets.scanauto.staff.handhaver * 2;   // staff never the limit
    return tick(s, [], cfg).history[0];
  };
  const full = at(1), double = at(2), half = at(0.5);
  assert.ok(Math.abs(full.dekking - 1) < 1e-9);
  assert.equal(double.naleving, full.naleving);
  assert.equal(double.revenue, full.revenue);
  assert.ok(half.naleving < full.naleving);                                   // below 100% coverage does matter
});

test('revenue sanity: doing nothing and the beheerder stay within 8-25 M€/yr in year 1', () => {
  for (const b of [0, 2]) {
    let s = createState(cfg, 2);
    for (let q = 0; q < 4; q++) s = tick(s, BOTS[b].act(s, cfg), cfg);
    const rev = s.history.reduce((a, r) => a + r.revenue, 0) / 1e6;
    assert.ok(rev > 8 && rev < 25, `${BOTS[b].name} year-1 revenue ${rev.toFixed(1)} M€`);
  }
});

test('exploit check: handhaver-beheerder (max scan cars + high tariffs) does not beat beheerder by more than 3%', () => {
  const bi = BOTS.findIndex(b => b.name === 'beheerder'), hi = BOTS.findIndex(b => b.name === 'handhaver-beheerder');
  for (const seed of [1, 2, 3]) {
    const a = finalScore(play(bi, seed), cfg).score, b = finalScore(play(hi, seed), cfg).score;
    assert.ok(b <= a * 1.03, `seed ${seed}: ${b.toFixed(0)} vs ${a.toFixed(0)}`);
  }
});

test('high tariff is not a money machine: hoog yields less revenue than midden per wijk', () => {
  const rev = (level: 'midden' | 'hoog') => {
    const s = createState(cfg, 4); s.wijken.kopbrug.tariff = level; s.wijken.kopbrug.lastPolicyQ = -99;
    return tick(s, [], cfg).wijken.kopbrug.m.revenue;
  };
  assert.ok(rev('hoog') < rev('midden'));
});
