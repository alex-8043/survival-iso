// Minimapa cenital: siempre visible arriba-izquierda y versión grande con M.
// Muestrea el mundo determinista alrededor del jugador.

import { tileAt, caveTile, caveNodeAt, springAt, villageCenterAt, pitDepthAt, pitCenterAt, TERRAIN, type Terrain } from '../shared/worldgen';
import type { Location } from '../shared/protocol';

const TCOL: Record<number, number> = {
  [TERRAIN.DEEP_WATER]: 0x24507a, [TERRAIN.WATER]: 0x3a79a6, [TERRAIN.SAND]: 0xd9c48a,
  [TERRAIN.GRASS]: 0x5a9e4f, [TERRAIN.FOREST]: 0x3f7d3a, [TERRAIN.ROCK]: 0x8f8b7c,
  [TERRAIN.MOUNTAIN]: 0x7c746b, [TERRAIN.SNOW]: 0xe9edf2,
  [TERRAIN.DESERT]: 0xe3cf8a, [TERRAIN.JUNGLE]: 0x2f7d3a, [TERRAIN.SWAMP]: 0x5e6f42,
  [TERRAIN.SWAMP_WATER]: 0x3c4a34,
};
const SMALL_R = 38, SMALL_TP = 2;
const BIG_R = 92, BIG_TP = 3;

let seed = 0;
let lastKey = '';
let bigOpen = false;
// Niebla de guerra en cueva: sólo se muestran las galerías ya exploradas.
let caveVisited = new Set<string>();
let caveVisitedSeed = 0;

function hexStr(n: number): string { return '#' + ('000000' + n.toString(16)).slice(-6); }

function colorAt(wx: number, wy: number, loc: Location, caveSeed: number): number {
  if (loc === 'cave') {
    if (!caveVisited.has(wx + ',' + wy)) return 0x0b0b12; // niebla (sin explorar)
    const c = caveTile(wx, wy, caveSeed);
    if (c.kind === 'wall') return 0x23232c;
    if (c.kind === 'lava') return 0xff6a1a;
    if (c.kind === 'water') return 0x2f6aa0;
    const n = caveNodeAt(wx, wy, caveSeed);
    if (n === 'iron') return 0xc79066;
    if (n === 'coal') return 0x161620;
    if (n === 'rock') return 0x8a9098;
    return 0x3a3a47;
  }
  if (springAt(wx, wy, seed)) return 0x66e0ff;
  const t: Terrain = tileAt(wx, wy, seed).terrain;
  const base = TCOL[t] ?? 0x5a9e4f;
  const pit = pitDepthAt(wx, wy, seed); // los hoyos se ven como depresiones oscuras
  if (pit > 0) { const f = Math.max(0.28, 1 - pit * 0.11); return (((base >> 16 & 0xff) * f) << 16 | ((base >> 8 & 0xff) * f) << 8 | (base & 0xff) * f) & 0xffffff; }
  return base;
}

function draw(cv: HTMLCanvasElement, R: number, tp: number, px: number, py: number, loc: Location, caveSeed: number): void {
  const size = (2 * R + 1) * tp;
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  const cx = Math.round(px), cy = Math.round(py);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const wx = cx + dx, wy = cy + dy;
    ctx.fillStyle = hexStr(colorAt(wx, wy, loc, caveSeed));
    ctx.fillRect((dx + R) * tp, (dy + R) * tp, tp, tp);
    if (loc === 'surface') {
      if (pitCenterAt(wx, wy, seed)) { // marca de cueva-agujero (punto negro con borde)
        ctx.fillStyle = '#0a0a0e';
        ctx.fillRect((dx + R) * tp - 2, (dy + R) * tp - 2, tp + 4, tp + 4);
        ctx.strokeStyle = '#d0d0d0'; ctx.lineWidth = 1;
        ctx.strokeRect((dx + R) * tp - 2, (dy + R) * tp - 2, tp + 4, tp + 4);
      } else if (villageCenterAt(wx, wy, seed)) {
        ctx.fillStyle = '#e07b3a';
        ctx.fillRect((dx + R) * tp - 2, (dy + R) * tp - 2, tp + 4, tp + 4);
      }
    }
  }
  // salida de cueva (0,0)
  if (loc === 'cave') {
    const ex = (0 - cx + R) * tp, ey = (0 - cy + R) * tp;
    ctx.fillStyle = '#7dffb0'; ctx.fillRect(ex - 2, ey - 2, tp + 4, tp + 4);
    ctx.strokeStyle = '#0b3b1f'; ctx.lineWidth = 1; ctx.strokeRect(ex - 2, ey - 2, tp + 4, tp + 4);
  }
  // jugador (centro)
  const c = R * tp + tp / 2;
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(c, c, tp + 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

export function initMinimap(worldSeed: number): void {
  seed = worldSeed;
  if (!document.getElementById('minimap')) {
    const wrap = document.createElement('div');
    wrap.id = 'minimap';
    wrap.innerHTML = '<canvas id="minimap-cv"></canvas><div id="minimap-hint">M</div>';
    document.body.appendChild(wrap);
  }
  if (!document.getElementById('bigmap')) {
    const big = document.createElement('div');
    big.id = 'bigmap';
    big.innerHTML = '<div class="bigmap-card"><button class="panel-close" id="bigmap-close">&times;</button><h3>Mapa</h3><canvas id="bigmap-cv"></canvas></div>';
    document.body.appendChild(big);
    big.addEventListener('click', (e) => { if (e.target === big) toggleBigMap(); });
    document.getElementById('bigmap-close')?.addEventListener('click', () => toggleBigMap());
  }
  lastKey = '';
}

let cur = { px: 0, py: 0, loc: 'surface' as Location, caveSeed: 0 };

export function updateMinimap(px: number, py: number, loc: Location, caveSeed: number): void {
  cur = { px, py, loc, caveSeed };
  if (loc === 'cave') {
    if (caveSeed !== caveVisitedSeed) { caveVisited = new Set(); caveVisitedSeed = caveSeed; }
    const cx = Math.round(px), cy = Math.round(py);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 20) caveVisited.add((cx + dx) + ',' + (cy + dy));
  }
  const key = loc + ':' + Math.round(px) + ',' + Math.round(py) + ':' + caveSeed;
  if (key === lastKey) return;
  lastKey = key;
  const cv = document.getElementById('minimap-cv') as HTMLCanvasElement | null;
  if (cv) draw(cv, SMALL_R, SMALL_TP, px, py, loc, caveSeed);
  if (bigOpen) drawBig();
}

function drawBig(): void {
  const cv = document.getElementById('bigmap-cv') as HTMLCanvasElement | null;
  if (cv) draw(cv, BIG_R, BIG_TP, cur.px, cur.py, cur.loc, cur.caveSeed);
}

export function isBigMapOpen(): boolean { return bigOpen; }
export function toggleBigMap(): void {
  bigOpen = !bigOpen;
  const big = document.getElementById('bigmap');
  if (big) big.style.display = bigOpen ? 'flex' : 'none';
  if (bigOpen) drawBig();
}
