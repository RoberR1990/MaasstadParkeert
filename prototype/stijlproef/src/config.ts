// World constants. One grid unit is roughly "half a car length".
export const P = 9; // pitch: block + street
export const STREET = 3.4;
export const BLOCK = 5.6;
export const NB = 8; // blocks per side
export const PAD_H = 0.16; // block pad (sidewalk) height
export const ROAD_Y = 0.03;
export const TILE_X = 44; // half width of the diorama
export const TILE_Z0 = -44;
export const TILE_Z1 = 66;
export const RIVER_Z0 = 42;
export const RIVER_Z1 = 56;
export const RIVER_X = 38; // half width of the river channel
export const WATER_Y = -1.8;
export const BRIDGE_X = -18; // street line index 2 -> x = -18

export const lineCoord = (k: number) => (k - 4) * P; // k = 0..8
export const blockCenter = (i: number) => (i - 3.5) * P; // i = 0..7
