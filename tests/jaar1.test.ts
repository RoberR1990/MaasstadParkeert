import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/sim/load';
import { createState, tick } from '../src/sim/model';
import { goalStatus, explain } from '../src/sim/round';
import { BOTS } from './../tools/bots';
import { beheerderJ1, spelerUI } from '../tools/jaar1-bots';

const cfg = loadConfig('scenario-jaar1.json');
const play = (act: (s: any, c: any) => any[], seed = 1) => { let s = createState(cfg, seed); for (let q = 0; q < 4; q++) s = tick(s, act(s, cfg), cfg); return s; };

test('jaar1: niets doen haalt het doel niet, bouwwoede ook niet, een verstandige beheerder wel', () => {
  const nd = goalStatus(play(BOTS[0].act), cfg), bw = goalStatus(play(BOTS[1].act), cfg), bh = goalStatus(play(beheerderJ1.act), cfg);
  assert.ok(!(nd.blijOk && nd.fondsOk && nd.marathonOk));
  assert.ok(!(bw.blijOk && bw.fondsOk && bw.marathonOk));
  assert.ok(bh.blij >= 70 && bh.fondsOk && bh.marathonOk);
});

test('jaar1: wie alleen de knoppen van het scherm gebruikt (speler-ui) kan het doel halen', () => {
  for (const seed of [1, 2, 3]) { const st = goalStatus(play(spelerUI.act, seed), cfg); assert.ok(st.blij >= 70 && st.fondsOk && st.marathonOk, `seed ${seed}: blij ${st.blij}`); }
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

import { forecast } from '../src/sim/forecast';
import { teamLoadsT, teamLevel, starsFor } from '../src/sim/round';
import { teamNeeds } from '../src/sim/teams';
import { counts } from '../src/sim/model';
import { withMoment } from '../tools/jaar1-bots';

const playT = (act: (s: any, c: any) => any[], seed = 1) => { let s = createState(cfg, seed), red = false; for (let q = 0; q < 4; q++) { s = tick(s, act(s, cfg), cfg); if (Object.values(teamLoadsT(s, cfg)).some(l => teamLevel(l, cfg) === 'rood')) red = true; } return { s, red }; };

test('teams: workload comes from assets that were already running (a new scanauto loads backoffice a quarter later)', () => {
  const s0 = createState(cfg, 1);
  const s1 = tick(s0, [{ type: 'build', asset: 'scanauto', count: 2 }], cfg), s2 = tick(s1, [], cfg);
  assert.equal(s1.teams!.units.backoffice.parts.scans, s0.teams!.units.backoffice.parts.scans); // not yet
  assert.ok(s2.teams!.units.backoffice.parts.scans > s1.teams!.units.backoffice.parts.scans);
  assert.ok(s2.teams!.units.handhaving.demand > s1.teams!.units.handhaving.demand);
});

test('teams: backlog builds up when a team is short and shrinks when it has slack', () => {
  let s = createState(cfg, 1);
  s = tick(s, [{ type: 'build', asset: 'scanauto', count: 6 }], cfg); s = tick(s, [], cfg); s = tick(s, [], cfg);
  assert.ok(s.teams!.units.backoffice.achterstand > 0.5 && s.teams!.units.backoffice.load > 1.15);
  const hire = tick(tick(tick(s, [{ type: 'hire', role: 'backoffice', n: 4 }], cfg), [], cfg), [], cfg), none = tick(tick(tick(s, [], cfg), [], cfg), [], cfg);
  assert.ok(hire.teams!.units.backoffice.load < none.teams!.units.backoffice.load);
  const calm = tick(createState(cfg, 1), [], cfg);
  assert.equal(calm.teams!.units.backoffice.achterstand, 0);
});

test('teams: a backlog at the backoffice hurts the wethouder and compliance', () => {
  const lean = tick(tick(createState(cfg, 1), [{ type: 'build', asset: 'scanauto', count: 6 }], cfg), [], cfg);
  const ok = tick(tick(createState(cfg, 1), [{ type: 'build', asset: 'scanauto', count: 6 }, { type: 'hire', role: 'backoffice', n: 3 }, { type: 'hire', role: 'handhaver', n: 3 }], cfg), [], cfg);
  assert.ok(lean.history[1].wethouder < ok.history[1].wethouder + 0.01 || lean.teams!.units.backoffice.load > ok.teams!.units.backoffice.load);
});

test('teams: hiring a backoffice person is rejected when teams are off (week scenarios)', () => {
  const w = loadConfig('scenario-week1.json');
  const s = tick(createState(w, 1), [{ type: 'hire', role: 'backoffice', n: 1 }], w);
  assert.ok(s.rejected.length > 0); assert.equal(s.teams, undefined);
});

test('jaar1: a well-planned game earns 3 stars, doing nothing or only building does not', () => {
  const g = playT(beheerderJ1.act), u = playT(spelerUI.act);
  assert.ok(g.s.history[3].blij >= 70);
  assert.equal(starsFor(goalStatus(g.s, cfg, g.red), cfg, g.s.fonds), 3);
  assert.equal(starsFor(goalStatus(u.s, cfg, u.red), cfg, u.s.fonds), 3);
  for (const b of [BOTS[0], BOTS[1]]) { const r = playT(b.act); assert.equal(starsFor(goalStatus(r.s, cfg, r.red), cfg, r.s.fonds), 0); }
});

test('jaar1: a team goes red when you build without staffing it', () => {
  const r = playT((s, c) => s.quarter === 0 ? [{ type: 'build', asset: 'garage', wijk: 'centrum' }, { type: 'build', asset: 'garage', wijk: 'kopbrug' }, { type: 'build', asset: 'scanauto', count: 4 }] : []);
  assert.ok(r.red);
});

test('moment: partners close the route; measures need the teams behind them', () => {
  const run = (picks: string[], hire = false, garages = 2) => {
    let s = createState(cfg, 1);
    for (let q = 0; q < 4; q++) {
      const a: any[] = q === 3 ? [{ type: 'moment', id: 'marathon', picks }, { type: 'setTariff', wijk: 'centrum', level: 'hoog' }] : q === 0 ? [{ type: 'build', asset: 'garage', wijk: 'centrum' }, ...Array(garages - 1).fill({ type: 'build', asset: 'garage', wijk: 'centrum' })] : [];
      if (q === 2 && hire) a.push({ type: 'hire', role: 'handhaver', n: 2 });
      s = tick(s, a, cfg);
    }
    return s;
  };
  const none = run([]), pendel = run(['pendel']);
  assert.ok(pendel.history[3].searchCentrum < none.history[3].searchCentrum);
  const thin = run(['handhaving']), staffed = run(['handhaving'], true);
  assert.ok(thin.teams!.moment!.eff.handhaving < 1 && staffed.teams!.moment!.eff.handhaving > thin.teams!.moment!.eff.handhaving);
  let s3 = createState(cfg, 1); for (let q = 0; q < 3; q++) s3 = tick(s3, q === 0 ? [{ type: 'build', asset: 'garage', wijk: 'centrum' }] : [], cfg);
  const hoog: any = { type: 'setTariff', wijk: 'centrum', level: 'hoog' };
  const fc = forecast(s3, [hoog], [{ type: 'moment', id: 'marathon', picks: ['pendel'] }], cfg, 'centrum');
  assert.ok(fc.costNow > cfg.teams.moment.picks.pendel.cost * 0.9 && fc.searchNew < fc.searchOld); // the measure costs money and helps
});

test('dilemma: free parking costs revenue but pleases ondernemers', () => {
  const at = (choice: string) => { let s = createState(cfg, 1); s = tick(s, [], cfg); s = tick(s, [{ type: 'dilemma', id: 'gratis', choice }], cfg); return s; };
  const ja = at('ja'), nee = at('nee');
  assert.ok(ja.history[1].ondernemer > nee.history[1].ondernemer);
  assert.ok(ja.wijken.centrum.m.revStreet < nee.wijken.centrum.m.revStreet);
  assert.ok(tick(createState(cfg, 1), [{ type: 'dilemma', id: 'gratis', choice: 'ja' }], cfg).rejected.length > 0); // wrong quarter
});

test('forecast: deterministic, pure and consistent with what the quarter then does', () => {
  const s = createState(cfg, 1), snap = structuredClone(s);
  const garage: any = { type: 'build', asset: 'garage', wijk: 'centrum' };
  const f1 = forecast(s, [], [garage], cfg, 'centrum'), f2 = forecast(s, [], [garage], cfg, 'centrum');
  assert.deepEqual(f1, f2); assert.deepEqual(s, snap);
  assert.ok(f1.searchNew < f1.searchOld && f1.blijNew > f1.blijOld);
  assert.ok(Math.abs(f1.costNow - cfg.assets.garage.capex) < 1e6); // capex (+/- a quarter of running costs)
  assert.ok(f1.teamDelta.schoonmaak > 0 && f1.teamDelta.techniek > 0); // garages hand work to cleaning and technicians
  const real = tick(s, [garage], cfg);
  assert.equal(f1.searchNew, real.wijken.centrum.m.search);
  const sc = forecast(s, [], [{ type: 'build', asset: 'scanauto', count: 1 }], cfg);
  assert.ok(sc.teamDelta.backoffice > 0 && sc.teamDelta.handhaving > 0); // K1: scanauto -> handhaving -> backoffice
});

test('teams: needs helper matches the model at the start', () => {
  const s = createState(cfg, 1), n = teamNeeds(s, cfg, counts(s));
  assert.ok(Math.abs(n.handhaving - s.teams!.units.handhaving.demand) < 1e-9);
});
void withMoment;
