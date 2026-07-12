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
  DESERT: 8,
  JUNGLE: 9,
  SWAMP: 10,
  SWAMP_WATER: 11,
} as const;

export type Terrain = number;

const SCALE = 0.045;
const CLIMATE_SCALE = SCALE * 0.13; // clima de baja frecuencia -> biomas GRANDES

// Clima a gran escala para delimitar biomas amplios (no microbiomas).
export function climTemp(x: number, y: number, seed: number): number {
  return fbm((x + 3000) * CLIMATE_SCALE, (y - 1500) * CLIMATE_SCALE, seed ^ 0x77aa, 3);
}
export function climMoist(x: number, y: number, seed: number): number {
  return fbm((x - 2200) * CLIMATE_SCALE, (y + 2600) * CLIMATE_SCALE, seed ^ 0x1234, 3);
}
export const MAX_BLOCK = 16; // altura máxima en bloques (para bucles/render)

export interface TileInfo {
  terrain: Terrain;
  level: number; // altura en bloques (entero); 0 = nivel del mar / agua
  water: boolean;
  elevation: number; // = level (compat)
  passable: boolean; // tierra caminable (para spawns)
}

export function heightAt(x: number, y: number, seed: number): number {
  return fbm(x * SCALE, y * SCALE, seed, 5);
}
export function moistureAt(x: number, y: number, seed: number): number {
  return fbm((x + 1000) * SCALE * 1.7, (y - 1000) * SCALE * 1.7, seed ^ 0x1234, 3);
}
export function temperatureAt(x: number, y: number, seed: number): number {
  return fbm((x - 2000) * SCALE * 1.3, (y + 2000) * SCALE * 1.3, seed ^ 0x77aa, 3);
}

export function tileAt(x: number, y: number, seed: number): TileInfo {
  const h = heightAt(x, y, seed);
  if (h < 0.34) {
    return { terrain: h < 0.29 ? TERRAIN.DEEP_WATER : TERRAIN.WATER, level: 0, water: true, elevation: 0, passable: false };
  }
  // Montaña por altura (elemento de terreno por encima del clima).
  if (h > 0.7) {
    const mh = Math.min(1, (h - 0.7) / 0.3);
    const level = 3 + Math.floor(Math.pow(mh, 1.5) * 13); // 3..16
    const terrain = h > 0.86 ? TERRAIN.SNOW : (climMoist(x, y, seed) > 0.5 ? TERRAIN.MOUNTAIN : TERRAIN.ROCK);
    return { terrain, level, water: false, elevation: level, passable: true };
  }
  if (h < 0.37) return { terrain: TERRAIN.SAND, level: 1, water: false, elevation: 1, passable: true }; // playa
  // Bioma por clima de baja frecuencia (regiones grandes y delimitadas).
  const T = climTemp(x, y, seed), M = climMoist(x, y, seed);
  let terrain: Terrain;
  if (T > 0.6 && M < 0.4) terrain = TERRAIN.DESERT;
  else if (T > 0.55 && M > 0.58) terrain = TERRAIN.JUNGLE;
  else if (M > 0.6 && T <= 0.55) terrain = TERRAIN.SWAMP;
  else if (M > 0.48) terrain = TERRAIN.FOREST;
  else terrain = TERRAIN.GRASS;
  const land = (h - 0.37) / 0.33; // 0..1
  let level = 1 + Math.floor(land * 2.99); // 1..3
  if (terrain === TERRAIN.DESERT) level = 1 + Math.floor(land * 1.6);
  if (terrain === TERRAIN.SWAMP) {
    level = 1;
    // Charcas de agua turbia en las zonas bajas del pantano.
    if (h < 0.41 || fbm((x + 7) * 0.1, (y - 7) * 0.1, (seed ^ 0x5a) | 0, 2) > 0.62) {
      return { terrain: TERRAIN.SWAMP_WATER, level: 0, water: true, elevation: 0, passable: false };
    }
  }
  return { terrain, level, water: false, elevation: level, passable: true };
}

export function levelAt(x: number, y: number, seed: number): number {
  return tileAt(x, y, seed).level;
}

// --- Edición de terreno (excavar/rellenar) ---
export const BEDROCK_LEVEL = -6; // fondo excavable (roca madre)
export const WATER_SURFACE = 0; // el mar/fluido se estabiliza a este nivel

// Material del bloque superior sin editar (para color y desglose).
export function terrainTopMaterial(terrain: Terrain): string {
  if (terrain === TERRAIN.DESERT || terrain === TERRAIN.SAND) return 'sand';
  if (terrain === TERRAIN.ROCK || terrain === TERRAIN.MOUNTAIN) return 'stone';
  if (terrain === TERRAIN.SNOW) return 'snow';
  if (terrain === TERRAIN.SWAMP) return 'dirt';
  return 'grass'; // grass / forest / jungle
}
// Objeto que sueltas al romper un material (la hierba da tierra).
export function materialItem(mat: string): string {
  return mat === 'grass' ? 'dirt' : mat;
}
// Material expuesto tras excavar, según la profundidad bajo la superficie base.
export function subsurfaceMaterial(terrain: Terrain, depthBelow: number): string {
  if (terrain === TERRAIN.ROCK || terrain === TERRAIN.MOUNTAIN || terrain === TERRAIN.SNOW) return 'stone';
  if (terrain === TERRAIN.DESERT || terrain === TERRAIN.SAND) return depthBelow <= 2 ? 'sand' : 'stone';
  return depthBelow <= 1 ? 'dirt' : 'stone';
}

export type NodeKind = 'tree' | 'rock' | 'coal' | 'iron' | 'gold' | 'diamond';

export function nodeAt(x: number, y: number, seed: number): NodeKind | null {
  const t = tileAt(x, y, seed).terrain;
  const r = hash2(x, y, (seed ^ 0x777) | 0);
  if (t === TERRAIN.JUNGLE && r < 0.42) return 'tree';
  if (t === TERRAIN.FOREST && r < 0.22) return 'tree';
  if (t === TERRAIN.SWAMP && r < 0.08) return 'tree';
  if (t === TERRAIN.GRASS && r < 0.03) return 'tree';
  if ((t === TERRAIN.ROCK || t === TERRAIN.MOUNTAIN || t === TERRAIN.SNOW) && r < 0.08) return 'rock';
  return null;
}

// Decoración de superficie no interactiva por bioma.
export type SurfaceDecor = 'cactus' | 'reed' | 'deadbush' | 'fern' | 'lily' | 'vine';
export function surfaceDecorAt(x: number, y: number, seed: number): SurfaceDecor | null {
  const t = tileAt(x, y, seed);
  const r = hash2(x, y, (seed ^ 0x2de) | 0);
  if (t.terrain === TERRAIN.SWAMP_WATER) return r < 0.16 ? 'lily' : null; // nenúfares
  if (t.water || nodeAt(x, y, seed)) return null;
  if (t.terrain === TERRAIN.DESERT) { if (r < 0.05) return 'cactus'; if (r < 0.09) return 'deadbush'; return null; }
  if (t.terrain === TERRAIN.SWAMP) { if (r < 0.14) return 'reed'; return null; }
  if (t.terrain === TERRAIN.JUNGLE) { if (r < 0.13) return 'vine'; if (r < 0.19) return 'fern'; return null; }
  return null;
}

export function isWater(terrain: Terrain): boolean {
  return terrain === TERRAIN.DEEP_WATER || terrain === TERRAIN.WATER || terrain === TERRAIN.SWAMP_WATER;
}
export function isSea(terrain: Terrain): boolean {
  return terrain === TERRAIN.DEEP_WATER || terrain === TERRAIN.WATER;
}

// Compat: ya no se bloquea por tipo de terreno (la colisión es por altura).
export function playerBlocked(_terrain: Terrain): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// Cuevas: entradas en la superficie (montaña/roca) y un nivel interior propio.
// El interior es una sala acotada, determinista a partir de la semilla de cueva.
// ---------------------------------------------------------------------------

export const CAVE_R = 54; // radio máximo posible (bound para bucles)

// Entradas de cueva: raras, en cualquier tierra (no en el agua).
export function caveEntranceAt(x: number, y: number, seed: number): boolean {
  if (tileAt(x, y, seed).water) return false;
  return hash2(x, y, (seed ^ 0x5eed) | 0) < 0.0016;
}

// Aldeas: raras (más que antes), en llano de hierba/bosque.
export function villageCenterAt(x: number, y: number, seed: number): boolean {
  const t = tileAt(x, y, seed);
  if (t.water || t.level > 2) return false;
  if (t.terrain !== TERRAIN.GRASS && t.terrain !== TERRAIN.FOREST) return false;
  return hash2(x, y, (seed ^ 0x1a1d) | 0) < 0.0002;
}
export function villageSeed(cx: number, cy: number, seed: number): number {
  return (Math.imul(cx | 0, 668265263) ^ Math.imul(cy | 0, 374761393) ^ (seed | 0)) | 0;
}

// Casas GRANDES y habitables: rectángulo con muros de perímetro, una puerta,
// interior con cama; una casa por aldea lleva cofre (loot).
export interface VillageHouse {
  x0: number; y0: number; w: number; h: number;
  door: { x: number; y: number };
  bed: { x: number; y: number };
  chest: { x: number; y: number } | null; // sólo la casa de loot
}
export interface VillageLayout {
  cx: number; cy: number;
  houses: VillageHouse[];
  spawns: { x: number; y: number; home: number }[];
  farm: { x0: number; y0: number; w: number; h: number };
}
export const VILLAGE_SCAN = 22; // radio máximo de una aldea respecto a su centro

function houseDoor(x0: number, y0: number, w: number, h: number, cx: number, cy: number): { x: number; y: number } {
  const hcx = x0 + (w - 1) / 2, hcy = y0 + (h - 1) / 2;
  const dx = cx - hcx, dy = cy - hcy;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? x0 + w - 1 : x0, y: y0 + Math.floor(h / 2) };
  return { x: x0 + Math.floor(w / 2), y: dy >= 0 ? y0 + h - 1 : y0 };
}

export function villageLayoutAt(cx: number, cy: number, seed: number): VillageLayout {
  const vs = villageSeed(cx, cy, seed);
  const count = 4 + Math.floor(hash2(0, 0, vs) * 3); // 4..6 casas
  const lootIdx = Math.floor(hash2(9, 9, vs) * count) % count;
  const houses: VillageHouse[] = [];
  const spawns: { x: number; y: number; home: number }[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (hash2(i, 1, vs) - 0.5) * 0.4;
    const rad = 10 + Math.floor(hash2(i, 2, vs) * 5); // 10..14 (lejos: casas grandes)
    const w = 6 + Math.floor(hash2(i, 3, vs) * 3); // 6..8
    const h = 6 + Math.floor(hash2(i, 4, vs) * 3);
    const x0 = cx + Math.round(Math.cos(ang) * rad) - Math.floor(w / 2);
    const y0 = cy + Math.round(Math.sin(ang) * rad) - Math.floor(h / 2);
    const door = houseDoor(x0, y0, w, h, cx, cy);
    const bed = { x: x0 + 1, y: y0 + 1 };
    const chest = i === lootIdx ? { x: x0 + w - 2, y: y0 + 1 } : null;
    houses.push({ x0, y0, w, h, door, bed, chest });
    // aldeano: aparece junto a la puerta (luego deambula por la aldea)
    spawns.push({ x: door.x + Math.sign(cx - door.x || 1), y: door.y + Math.sign(cy - door.y || 1), home: i });
  }
  const farm = { x0: cx + 2, y0: cy - 2, w: 5, h: 4 };
  return { cx, cy, houses, spawns, farm };
}

// ¿Es (x,y) un muro macizo de la casa (perímetro salvo la puerta)?
export function isHouseWall(h: VillageHouse, x: number, y: number): boolean {
  if (x < h.x0 || x >= h.x0 + h.w || y < h.y0 || y >= h.y0 + h.h) return false;
  const perimeter = x === h.x0 || x === h.x0 + h.w - 1 || y === h.y0 || y === h.y0 + h.h - 1;
  if (!perimeter) return false;
  return !(x === h.door.x && y === h.door.y); // la puerta se cruza
}
// ¿Está (x,y) en el interior (dentro de los muros)?
export function isHouseInterior(h: VillageHouse, x: number, y: number): boolean {
  return x > h.x0 && x < h.x0 + h.w - 1 && y > h.y0 && y < h.y0 + h.h - 1;
}
// Centro de aldea más cercano a (px,py), o null.
export function nearestVillage(px: number, py: number, seed: number): { cx: number; cy: number } | null {
  const rx = Math.round(px), ry = Math.round(py);
  let best: { cx: number; cy: number } | null = null, bestD = Infinity;
  for (let dy = -VILLAGE_SCAN; dy <= VILLAGE_SCAN; dy++) for (let dx = -VILLAGE_SCAN; dx <= VILLAGE_SCAN; dx++) {
    const cx = rx + dx, cy = ry + dy;
    if (!villageCenterAt(cx, cy, seed)) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = { cx, cy }; }
  }
  return best;
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
  const d = Math.hypot(x, y); // profundidad = distancia a la salida (centro)
  // Cuanto MÁS PROFUNDO, mejores minerales: carbón (cerca) -> hierro -> oro -> diamante (lo más hondo).
  if (d > 26 && r < 0.01) return 'diamond';  // el más preciado, sólo en lo más profundo
  if (d > 17 && r < 0.024) return 'gold';
  if (d > 9 && r < 0.042) return 'iron';
  if (r < 0.045) return 'coal';               // carbón, sobre todo cerca de la entrada
  if (r < 0.08) return 'rock';
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
