import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/sim/load';
import { createState, tick } from '../src/sim/model';
import { goalStatus, explain } from '../src/sim/round';
import { BOTS } from './../tools/bots';
import { beheerderJ1 } from '../tools/jaar1-bots';

const cfg = loadConfig('scenario-jaar1.json');
const play = (act: (s: any, c: any) => any[], seed = 1) => { let s = createState(cfg, seed); for (let q = 0; q < 4; q++) s = tick(s, act(s, cfg), cfg); return s; };

test('jaar1: niets doen haalt het doel niet, bouwwoede ook niet, een verstandige beheerder wel', () => {
  const nd = goalStatus(play(BOTS[0].act), cfg), bw = goalStatus(play(BOTS[1].act), cfg), bh = goalStatus(play(beheerderJ1.act), cfg);
  assert.ok(!(nd.blijOk && nd.fondsOk && nd.marathonOk));
  assert.ok(!(bw.blijOk && bw.fondsOk && bw.marathonOk));
  assert.ok(bh.blij >= 70 && bh.fondsOk && bh.marathonOk);
});

test('jaar1: start = Centrum rood, Rotterdammert rond 52', () => {
  const s = tick(createState(cfg, 1), [], cfg);
  assert.ok(s.wijken.centrum.m.search >= 10 && s.wijken.centrum.m.search <= 16);
  assert.ok(s.history[0].blij > 48 && s.history[0].blij < 58);
});

test('explain: een garage in Centrum is de grootste verklaring voor betere zoektijd', () => {
  const s0 = createState(cfg, 1), base = tick(s0, [], cfg), next = tick(s0, [{ type: 'build', asset: 'garage', wijk: 'centrum' }], cfg);
  const causes = explain(base, next, cfg);
  assert.equal(causes[0].kind, 'zoektijd'); assert.equal(causes[0].wijk, 'centrum'); assert.ok(causes[0].delta > 0);
});
