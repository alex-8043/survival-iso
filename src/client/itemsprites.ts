// Sprite dibujado (canvas 32x32) para cada ítem del juego. Fuente única de
// iconos para hotbar, inventario, feed y paneles de crafteo.

import { ITEMS } from '../shared/items';
import { drawTool } from './avatar';
import { DRAW as STATION_DRAW } from './itemicons';

const S = 32;

function hex(n: number): string { return '#' + ('000000' + n.toString(16)).slice(-6); }
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, col: string): void {
  c.fillStyle = col; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
function circ(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}
function elli(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string): void {
  c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
function poly(c: CanvasRenderingContext2D, pts: number[], col: string): void {
  c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); c.fill();
}

function helmet(c: CanvasRenderingContext2D, col: number): void {
  elli(c, 16, 15, 11, 10, hex(col));
  rr(c, 5, 15, 22, 6, 2, hex(col));
  poly(c, [5, 21, 12, 21, 12, 26, 8, 26], hex(col));
  poly(c, [27, 21, 20, 21, 20, 26, 24, 26], hex(col));
  rr(c, 12, 18, 8, 5, 1, 'rgba(0,0,0,.45)');
  elli(c, 12, 11, 4, 3, 'rgba(255,255,255,.25)');
}
function chest(c: CanvasRenderingContext2D, col: number): void {
  poly(c, [7, 8, 25, 8, 27, 12, 24, 26, 8, 26, 5, 12], hex(col));
  poly(c, [7, 8, 12, 8, 11, 14, 7, 13], 'rgba(255,255,255,.18)');
  rr(c, 13, 7, 6, 4, 2, hex(col));
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(16, 11); c.lineTo(16, 25); c.stroke();
}

const MAT: Record<string, (c: CanvasRenderingContext2D) => void> = {
  wood(c) {
    rr(c, 5, 12, 22, 9, 4, '#9c6b3f');
    rr(c, 5, 12, 22, 3, 3, '#b58150');
    elli(c, 8, 16.5, 3, 4.4, '#7a5230');
    elli(c, 8, 16.5, 1.5, 2.6, '#ad7c49');
    c.strokeStyle = '#7a5230'; c.lineWidth = 1; c.beginPath(); c.moveTo(14, 13); c.lineTo(14, 20); c.moveTo(20, 13); c.lineTo(20, 20); c.stroke();
  },
  stone(c) {
    elli(c, 17, 19, 10, 7, '#7f858e');
    elli(c, 13, 15, 8, 6.5, '#9aa0ab');
    elli(c, 20, 17, 5, 4, '#8a9098');
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(13, 14); c.lineTo(17, 19); c.lineTo(22, 16); c.stroke();
  },
  meat(c) {
    elli(c, 18, 18, 9, 7, '#d05a4a');
    elli(c, 16, 16, 5.5, 4, '#e37564');
    circ(c, 8, 10, 3.2, '#efe6d2');
    rr(c, 8, 9, 8, 3, 1.5, '#efe6d2');
    circ(c, 16, 12, 3, '#efe6d2');
  },
  cooked_meat(c) {
    elli(c, 18, 18, 9, 7, '#9a5a2f');
    elli(c, 16, 16, 5.5, 4, '#b3703c');
    c.strokeStyle = 'rgba(60,30,10,.5)'; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(13, 15); c.lineTo(20, 21); c.moveTo(17, 13); c.lineTo(23, 18); c.stroke();
    circ(c, 8, 10, 3.2, '#efe6d2');
    rr(c, 8, 9, 8, 3, 1.5, '#efe6d2');
  },
  leather(c) {
    poly(c, [7, 9, 25, 8, 26, 22, 16, 26, 6, 22], '#8a6038');
    poly(c, [7, 9, 16, 9, 15, 17, 7, 16], 'rgba(255,255,255,.12)');
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.setLineDash([2, 2]);
    c.strokeRect(9, 11, 14, 11); c.setLineDash([]);
  },
  wool(c) {
    for (const [x, y, r] of [[12, 16, 6], [20, 15, 6], [16, 19, 6], [11, 20, 4.5], [22, 20, 4.5], [16, 13, 5]] as const)
      circ(c, x, y, r, '#eef0ea');
    circ(c, 13, 15, 2, '#d6d8d0'); circ(c, 20, 17, 2, '#d6d8d0');
  },
  feather(c) {
    c.strokeStyle = '#c9b57a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(22, 7); c.lineTo(10, 25); c.stroke();
    c.fillStyle = '#f4f1e8'; c.beginPath();
    c.moveTo(21, 8); c.quadraticCurveTo(11, 10, 11, 22); c.quadraticCurveTo(20, 18, 21, 8); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = .8;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(19 - i * 2.2, 10 + i * 3); c.lineTo(14 - i * 1.5, 13 + i * 3); c.stroke(); }
  },
  coal(c) {
    poly(c, [9, 16, 14, 9, 22, 11, 25, 18, 20, 25, 11, 24], '#2b2b32');
    poly(c, [14, 9, 22, 11, 18, 16, 13, 15], '#3c3c45');
    circ(c, 19, 19, 1.6, '#4a4a54');
  },
  iron_ore(c) {
    elli(c, 17, 19, 10, 7, '#7f858e');
    elli(c, 13, 15, 8, 6.5, '#9aa0ab');
    circ(c, 19, 18, 2.4, '#c79066'); circ(c, 12, 17, 1.8, '#b37c4c'); circ(c, 16, 13, 1.5, '#d8a86e');
  },
  iron_ingot(c) {
    poly(c, [7, 20, 25, 20, 22, 26, 10, 26], '#b9c2cd');
    poly(c, [9, 15, 23, 15, 25, 20, 7, 20], '#d2d9e2');
    poly(c, [9, 15, 23, 15, 22, 17, 10, 17], '#eef2f6');
  },
  leather_helmet(c) { helmet(c, 0x8a6b45); },
  iron_helmet(c) { helmet(c, 0xc9d2dc); },
  leather_chest(c) { chest(c, 0x8a6b45); },
  iron_chest(c) { chest(c, 0xc9d2dc); },
  bone(c) {
    c.save(); c.translate(16, 16); c.rotate(-Math.PI / 4); c.translate(-16, -16);
    rr(c, 10, 14, 12, 4, 2, '#e8e4d2');
    for (const cx of [10, 22]) { circ(c, cx, 14.5, 3, '#f2eee0'); circ(c, cx, 17.5, 3, '#f2eee0'); }
    c.restore();
  },
  string(c) {
    c.strokeStyle = '#dcd6c4'; c.lineWidth = 2; c.beginPath();
    c.moveTo(7, 22); c.bezierCurveTo(12, 8, 20, 26, 25, 11); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1; c.stroke();
  },
  arrow(c) {
    c.strokeStyle = '#6b5334'; c.lineWidth = 2; c.beginPath(); c.moveTo(7, 25); c.lineTo(23, 9); c.stroke();
    poly(c, [23, 9, 25, 15, 18, 12], '#cfc6b4'); // punta
    poly(c, [7, 25, 11, 22, 12, 27], '#e7e2d4'); // plumas
    poly(c, [8, 24, 11, 23, 11, 26], '#e7e2d4');
  },
  bow(c) {
    c.strokeStyle = '#8a5a2b'; c.lineWidth = 2.4; c.beginPath(); c.arc(20, 16, 11, Math.PI * 0.62, Math.PI * 1.38); c.stroke();
    c.strokeStyle = '#d8d2c0'; c.lineWidth = 1; c.beginPath(); c.moveTo(12.2, 7.6); c.lineTo(12.2, 24.4); c.stroke();
    c.fillStyle = '#6b4420'; circ(c, 20, 5.5, 1.4, '#6b4420'); circ(c, 20, 26.5, 1.4, '#6b4420');
  },
  fishing_rod(c) {
    c.strokeStyle = '#8a5a2b'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(6, 26); c.lineTo(24, 6); c.stroke();
    c.strokeStyle = '#cfd6dc'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(24, 6); c.lineTo(20, 22); c.stroke();
    c.strokeStyle = '#9a9a9a'; c.lineWidth = 1.2; c.beginPath(); c.arc(20, 24, 2, Math.PI, Math.PI * 2.2); c.stroke();
  },
  raw_fish(c) {
    elli(c, 15, 17, 8, 5, '#7fa8c0');
    poly(c, [22, 17, 28, 12, 28, 22], '#5f88a0'); // cola
    elli(c, 13, 15, 4, 2.4, '#a6cade'); circ(c, 10, 16, 1.2, '#12303f'); // ojo
  },
  cooked_fish(c) {
    elli(c, 15, 17, 8, 5, '#c79a5a');
    poly(c, [22, 17, 28, 12, 28, 22], '#a97e42');
    c.strokeStyle = 'rgba(80,40,10,.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(11, 15); c.lineTo(18, 20); c.moveTo(14, 13); c.lineTo(20, 18); c.stroke();
    circ(c, 10, 16, 1.1, '#3a2410');
  },
  rotten_flesh(c) {
    elli(c, 17, 18, 9, 6.5, '#6f7a3a');
    elli(c, 15, 16, 5, 3.5, '#88924a');
    circ(c, 19, 20, 1.6, '#4c5326'); circ(c, 13, 19, 1.2, '#565f2c');
  },
  slimeball(c) {
    elli(c, 16, 18, 9, 7, 'rgba(95,184,90,.85)');
    elli(c, 13, 15, 3.5, 2.6, 'rgba(166,231,159,.8)');
    circ(c, 14, 18, 1.3, '#173d15'); circ(c, 19, 18, 1.3, '#173d15');
  },
};

function drawToolIcon(c: CanvasRenderingContext2D, kind: string, tier: number): void {
  c.save(); c.translate(17, 22); c.rotate(-Math.PI / 5); drawTool(c, kind, tier, 1.3); c.restore();
}

export function itemSpriteCanvas(id: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = cv.getContext('2d')!;
  const def = ITEMS[id];
  if (def?.tool) { drawToolIcon(c, def.tool.kind, def.tool.tier); return cv; }
  if (STATION_DRAW[id]) { c.save(); c.scale(S / 30, S / 30); STATION_DRAW[id](c); c.restore(); return cv; }
  const fn = MAT[id];
  if (fn) { fn(c); return cv; }
  rr(c, 8, 8, 16, 16, 4, def ? hex(def.color) : '#888');
  return cv;
}

const urlCache: Record<string, string> = {};
export function itemSpriteURL(id: string): string {
  if (!urlCache[id]) urlCache[id] = itemSpriteCanvas(id).toDataURL();
  return urlCache[id];
}
