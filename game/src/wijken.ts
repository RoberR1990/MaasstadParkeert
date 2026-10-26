// The four wijken of Jaar 1 on the diorama. Sim ids are reused from the 10-year model:
// centrum, kopbrug (Kop van Zuid & Noordereiland), kuipwijk (Feijenoord & De Kuip), noord (Noord & Blijdorp).
import { LAND_I, LAND_N, LAND_S, pointInPoly } from './map';

export type WijkId = 'centrum' | 'kopbrug' | 'kuipwijk' | 'noord';
export interface WijkMeta { id: WijkId; name: string; short: string; sub: string; focus: [number, number]; color: string }

export const WIJKEN: WijkMeta[] = [
  { id: 'centrum', name: 'Centrum', short: 'Centrum', sub: 'Coolsingel · Blaak · Hofplein · CS', focus: [16, -30], color: '#e2735a' },
  { id: 'kopbrug', name: 'Kop van Zuid & Noordereiland', short: 'Kop van Zuid', sub: 'Erasmusbrug · Wilhelminapier · Noordereiland', focus: [-12, 70], color: '#5aa9cb' },
  { id: 'kuipwijk', name: 'Feijenoord & De Kuip', short: 'Feijenoord', sub: 'De Kuip · Feijenoord', focus: [84, 84], color: '#f0b640' },
  { id: 'noord', name: 'Noord & Blijdorp', short: 'Noord', sub: 'Blijdorp · Euromast · Noord', focus: [30, -76], color: '#5fb596' },
];
export const WIJK_BY_ID = Object.fromEntries(WIJKEN.map((w) => [w.id, w])) as Record<WijkId, WijkMeta>;

/** Which wijk does a ground point belong to? null = water / outside the map. */
export function wijkAt(x: number, z: number): WijkId | null {
  if (z > 12 && z < 44) { // the Maas: only the Noordereiland is land
    return pointInPoly(x, z, LAND_I) ? 'kopbrug' : null;
  }
  if (z >= 44) {
    if (!pointInPoly(x, z, LAND_S)) return null;
    return x < 36 ? 'kopbrug' : 'kuipwijk';
  }
  if (!pointInPoly(x, z, LAND_N)) return null;
  if (x >= -50 && x <= 100 && z >= -58) return 'centrum';
  if (x >= -28 && x <= 28 && z < -58) return 'centrum'; // Centraal Station
  return 'noord';
}

