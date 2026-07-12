// Generación de mundo infinito determinista a partir de la semilla.
// La usan por igual la simulación (colisión, spawns) y el cliente (render).

import { fbm, hash2 } from './noise';

export const TERRAIN = {
  DEEP_WATER: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  ROCK: 5,
  MOUNTAIN: 6,
  SNOW: 7,
} as const;

export type Terrain = number;

const SCALE = 0.045;

export interface TileInfo {
  terrain: Terrain;
  elevation: number; // 0..1 (relieve visual)
  passable: boolean; // tierra caminable (para spawns de animales)
}

export function heightAt(x: number, y: number, seed: number): number {
  return fbm(x * SCALE, y * SCALE, seed, 5);
}

export function moistureAt(x: number, y: number, seed: number): number {
  return fbm((x + 1000) * SCALE * 1.7, (y - 1000) * SCALE * 1.7, seed ^ 0x1234, 3);
}

export function tileAt(x: number, y: number, seed: number): TileInfo {
  const h = heightAt(x, y, seed);
  const m = moistureAt(x, y, seed);
  let terrain: Terrain;
  if (h < 0.32) terrain = TERRAIN.DEEP_WATER;
  else if (h < 0.38) terrain = TERRAIN.WATER;
  else if (h < 0.43) terrain = TERRAIN.SAND;
  else if (h < 0.6) terrain = m > 0.5 ? TERRAIN.FOREST : TERRAIN.GRASS;
  else if (h < 0.72) terrain = m > 0.58 ? TERRAIN.GRASS : TERRAIN.ROCK;
  else if (h < 0.83) terrain = TERRAIN.MOUNTAIN;
  else terrain = TERRAIN.SNOW;

  // relieve: llanuras planas, montañas mucho más marcadas (curva)
  const e0 = h < 0.38 ? 0 : Math.min(1, (h - 0.38) / 0.5);
  const elevation = Math.pow(e0, 1.35);
  const passable =
    terrain !== TERRAIN.DEEP_WATER && terrain !== TERRAIN.WATER && terrain !== TERRAIN.SNOW;
  return { terrain, elevation, passable };
}

export type NodeKind = 'tree' | 'rock';

export function nodeAt(x: number, y: number, seed: number): NodeKind | null {
  const t = tileAt(x, y, seed);
  const r = hash2(x, y, (seed ^ 0x777) | 0);
  if (t.terrain === TERRAIN.FOREST && r < 0.4) return 'tree';
  if (t.terrain === TERRAIN.GRASS && r < 0.07) return 'tree';
  if ((t.terrain === TERRAIN.ROCK || t.terrain === TERRAIN.MOUNTAIN) && r < 0.16) return 'rock';
  return null;
}

export function isWater(terrain: Terrain): boolean {
  return terrain === TERRAIN.DEEP_WATER || terrain === TERRAIN.WATER;
}

// El jugador puede entrar al agua (lento); solo la nieve/pico es intransitable.
export function playerBlocked(terrain: Terrain): boolean {
  return terrain === TERRAIN.SNOW;
}
