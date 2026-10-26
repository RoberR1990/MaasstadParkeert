// Look-ahead for the plan screen: runs the (pure, seeded) model on cloned state, once with and once without a candidate action.
// Quarter 1 gives the direct effect (search time, Rotterdammert, money now); quarter 2 shows the steady work the new asset hands to the teams.
import type { Action, Config, GameState, TeamId } from './types';
import { TEAMS } from './types';
import { tick } from './model';

export interface Forecast {
  wijk: string | null;
  searchOld: number; searchNew: number;
  blijOld: number; blijNew: number;
  /** extra money out this quarter (build cost, moment cost), euro; negative = it earns money */
  costNow: number;
  /** extra running cost per year (people, upkeep), euro */
  costPerYear: number;
  /** extra revenue per year, euro */
  revPerYear: number;
  /** change of each team's work, as percentage points of its capacity (+12 = twelve percent busier) */
  teamDelta: Record<TeamId, number>;
  /** the load each team would have afterwards (pool / capacity) */
  teamLoad: Record<TeamId, number>;
}

const two = (s: GameState, actions: Action[], c: Config) => { const a = tick(s, actions, c); return [a, tick(a, [], c)] as const; };

export function forecast(s: GameState, plan: Action[], extra: Action[], c: Config, wijk: string | null = null): Forecast {
  const [b1, b2] = two(s, plan, c), [w1, w2] = two(s, [...plan, ...extra], c);
  const hb = b1.history[b1.history.length - 1], hw = w1.history[w1.history.length - 1];
  const rb = b2.history[b2.history.length - 1], rw = w2.history[w2.history.length - 1];
  const teamDelta = {} as Record<TeamId, number>, teamLoad = {} as Record<TeamId, number>;
  for (const t of TEAMS) {
    if (w2.teams && b2.teams) {
      const ub = b2.teams.units[t], uw = w2.teams.units[t];
      teamDelta[t] = ((uw.pool - ub.pool) / Math.max(0.5, ub.fte)) * 100;
      teamLoad[t] = uw.load;
    } else { teamDelta[t] = 0; teamLoad[t] = 0; }
  }
  return {
    wijk,
    searchOld: wijk ? b1.wijken[wijk].m.search : hb.avgSearch, searchNew: wijk ? w1.wijken[wijk].m.search : hw.avgSearch,
    blijOld: hb.blij, blijNew: hw.blij,
    costNow: (b1.fonds + b1.afgeroomd) - (w1.fonds + w1.afgeroomd), // afgeroomd: add back what year-end under-spending took away
    costPerYear: (rw.costs - rb.costs) * 4,
    revPerYear: (rw.revenue - rb.revenue) * 4,
    teamDelta, teamLoad,
  };
}
