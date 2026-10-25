import type { Effect, GameState } from './types';

function resolve(root: any, path: string): [any, string] | null {
  const parts = path.split('.');
  let o = root;
  for (let i = 0; i < parts.length - 1; i++) { o = o?.[parts[i]]; if (o == null || typeof o !== 'object') return null; }
  const k = parts[parts.length - 1];
  return k in o ? [o, k] : null;
}

/** Applies one effect to the state (mutating). Temporary effects register an inverse that expireEffects() applies later. */
export function applyEffect(s: GameState, e: Effect): boolean {
  const r = resolve(s, e.target);
  if (!r) { s.rejected.push(`effect: onbekend pad ${e.target}`); return false; }
  const [o, k] = r;
  const prev = o[k];
  if (e.op !== 'set' && (typeof prev !== 'number' || typeof e.value !== 'number')) { s.rejected.push(`effect: ${e.target} niet numeriek`); return false; }
  o[k] = e.op === 'add' ? prev + (e.value as number) : e.op === 'mul' ? prev * (e.value as number) : e.value;
  if (e.durationQuarters && e.durationQuarters > 0) {
    const undo = e.op === 'add' ? { op: 'add' as const, value: -(e.value as number) }
      : e.op === 'mul' && e.value !== 0 ? { op: 'mul' as const, value: 1 / (e.value as number) }
      : { op: 'set' as const, value: prev };
    s.effects.push({ target: e.target, undo, left: e.durationQuarters });
  }
  return true;
}

/** Counts down temporary effects; reverts the ones that ran out. Call before applying new effects in a tick. */
export function expireEffects(s: GameState) {
  const keep = [];
  for (const a of s.effects) {
    if (--a.left > 0) { keep.push(a); continue; }
    const r = resolve(s, a.target);
    if (r) { const [o, k] = r; o[k] = a.undo.op === 'add' ? o[k] + a.undo.value : a.undo.op === 'mul' ? o[k] * a.undo.value : a.undo.value; }
  }
  s.effects = keep;
}
