import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/sim/load';
import { createState, tick, searchTime } from '../src/sim/model';
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
