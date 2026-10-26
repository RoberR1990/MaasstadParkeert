// Path finding on the road graph (shared by cars, pedestrians and events).
import type { Graph, REdge } from './map';

export function nearestNode(g: Graph, x: number, z: number, filter?: (n: Graph['nodes'][number]) => boolean) {
  let best = -1, bd = 1e12;
  for (const n of g.nodes) {
    if (filter && !filter(n)) continue;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

/** may a vehicle traverse edge `e` when leaving node `from`? */
export const canLeave = (e: REdge, from: number, ignoreOneway = false) => ignoreOneway || !e.oneway || e.a === from;

/** Dijkstra: returns the list of node ids from `a` to `b` (inclusive), or null. */
export function shortestPath(g: Graph, a: number, b: number, o: { ignoreOneway?: boolean; avoid?: (e: REdge) => boolean } = {}): number[] | null {
  const n = g.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[a] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    done[u] = 1;
    for (const eid of g.nodes[u].edges) {
      const e = g.edges[eid];
      if (!canLeave(e, u, o.ignoreOneway)) continue;
      if (o.avoid && o.avoid(e)) continue;
      const v = g.other(e, u);
      const nd = dist[u] + e.len * (e.kind === 'street' ? 1 : 0.9);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  if (!isFinite(dist[b])) return null;
  const out: number[] = [];
  for (let c = b; c >= 0; c = prev[c]) out.push(c);
  return out.reverse();
}

export function edgeBetween(g: Graph, a: number, b: number): REdge | null {
  for (const eid of g.nodes[a].edges) { const e = g.edges[eid]; if (g.other(e, a) === b) return e; }
  return null;
}
