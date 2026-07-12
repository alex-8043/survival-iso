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

export type NodeKind = 'tree' | 'rock' | 'coal' | 'iron';

export function nodeAt(x: number, y: number, seed: number): NodeKind | null {
  const t = tileAt(x, y, seed);
  const r = hash2(x, y, (seed ^ 0x777) | 0);
  if (t.terrain === TERRAIN.FOREST && r < 0.22) return 'tree';
  if (t.terrain === TERRAIN.GRASS && r < 0.03) return 'tree';
  if ((t.terrain === TERRAIN.ROCK || t.terrain === TERRAIN.MOUNTAIN) && r < 0.08) return 'rock';
  return null;
}

export function isWater(terrain: Terrain): boolean {
  return terrain === TERRAIN.DEEP_WATER || terrain === TERRAIN.WATER;
}

// El jugador puede entrar al agua (lento); solo la nieve/pico es intransitable.
export function playerBlocked(terrain: Terrain): boolean {
  return terrain === TERRAIN.SNOW;
}

// ---------------------------------------------------------------------------
// Cuevas: entradas en la superficie (montaña/roca) y un nivel interior propio.
// El interior es una sala acotada, determinista a partir de la semilla de cueva.
// ---------------------------------------------------------------------------

export const CAVE_R = 54; // radio máximo posible (bound para bucles)

// Entradas de cueva: rarísimas, en montaña o roca.
export function caveEntranceAt(x: number, y: number, seed: number): boolean {
  const t = tileAt(x, y, seed).terrain;
  if (t !== TERRAIN.MOUNTAIN && t !== TERRAIN.ROCK) return false;
  return hash2(x, y, (seed ^ 0x5eed) | 0) < 0.003;
}

// Semilla determinista de la cueva a partir de las coordenadas de su entrada.
export function caveSeedFor(ex: number, ey: number, seed: number): number {
  return (Math.imul(ex | 0, 73856093) ^ Math.imul(ey | 0, 19349663) ^ (seed | 0)) | 0;
}

// Tamaño (radio aproximado) de una cueva: aleatorio, de enana a grande.
export function caveSizeFor(cseed: number): number {
  return 10 + Math.floor(hash2(1, 2, cseed | 0) * 42); // 10..51
}

export type CaveKind = 'floor' | 'wall' | 'lava' | 'water';
export interface CaveTile { kind: CaveKind; terrain: Terrain; elevation: number; passable: boolean; wall: boolean; }

const CAVE_WALL: CaveTile = { kind: 'wall', terrain: 1, elevation: 0.55, passable: false, wall: true };
function caveFloor(elev: number): CaveTile { return { kind: 'floor', terrain: 0, elevation: elev, passable: true, wall: false }; }

// Interior de cueva: cavernas y pasillos orgánicos con desniveles, lava y agua.
// El núcleo (alrededor de la salida) siempre es suelo abierto y conectado.
export function caveTile(x: number, y: number, cseed: number): CaveTile {
  const size = caveSizeFor(cseed);
  const d = Math.hypot(x, y);
  const clearR = Math.min(7, size * 0.45);
  if (d < clearR) return caveFloor(0.04); // núcleo despejado
  const edge = size + fbm((x + 12) * 0.05, (y - 12) * 0.05, (cseed ^ 0x99) | 0, 2) * 8 - 4;
  if (d >= edge) return CAVE_WALL;
  const o = fbm(x * 0.085, y * 0.085, cseed, 4);
  // umbral de muro más bajo cerca del núcleo: garantiza conexión hacia fuera
  const thr = 0.44 - Math.max(0, clearR + 6 - d) * 0.035;
  if (o <= thr) return CAVE_WALL;
  if (d > clearR + 3 && size > 16) {
    const lv = fbm((x + 300) * 0.12, (y - 200) * 0.12, (cseed ^ 0x77) | 0, 3);
    if (lv > 0.8) return { kind: 'lava', terrain: 0, elevation: 0, passable: false, wall: false };
    const wt = fbm((x - 260) * 0.11, (y + 170) * 0.11, (cseed ^ 0x33) | 0, 3);
    if (wt > 0.81) return { kind: 'water', terrain: 0, elevation: 0, passable: false, wall: false };
  }
  const e = fbm(x * 0.06, y * 0.06, (cseed ^ 0x9) | 0, 3);
  return caveFloor(Math.max(0, e - 0.42) * 0.7);
}

// Nodos minables (muy escasos), sólo en suelo.
export function caveNodeAt(x: number, y: number, cseed: number): NodeKind | null {
  if (caveTile(x, y, cseed).kind !== 'floor') return null;
  if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return null;
  const r = hash2(x, y, (cseed ^ 0x1f7) | 0);
  if (r < 0.012) return 'iron';
  if (r < 0.03) return 'coal';
  if (r < 0.075) return 'rock';
  return null;
}

export type CaveDecor = 'stalagmite' | 'crystal' | 'mushroom' | 'bones' | 'rubble';

// Decoración no interactiva del suelo de la cueva.
export function caveDecorAt(x: number, y: number, cseed: number): CaveDecor | null {
  if (caveTile(x, y, cseed).kind !== 'floor') return null;
  if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return null;
  if (caveNodeAt(x, y, cseed)) return null;
  const r = hash2(x, y, (cseed ^ 0x2ac) | 0);
  if (r > 0.1) return null;
  const s = hash2(x + 7, y - 3, (cseed ^ 0x51) | 0);
  if (s < 0.34) return 'stalagmite';
  if (s < 0.56) return 'crystal';
  if (s < 0.76) return 'mushroom';
  if (s < 0.9) return 'rubble';
  return 'bones';
}

// Manantiales: pequeñas fuentes de agua dulce (potable) en tierra firme. Raros.
export function springAt(x: number, y: number, seed: number): boolean {
  const t = tileAt(x, y, seed).terrain;
  if (t !== TERRAIN.GRASS && t !== TERRAIN.FOREST) return false;
  return hash2(x, y, (seed ^ 0x5b1e) | 0) < 0.0015;
}
