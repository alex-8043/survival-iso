// Matemática isométrica: conversión cuadrícula <-> pantalla y profundidad.
// El punto de pantalla devuelto es el CENTRO del rombo de la tile.

import { TILE_W, TILE_H } from './constants';

export interface Vec2 {
  x: number;
  y: number;
}

export function gridToScreen(gx: number, gy: number): Vec2 {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

export function screenToGrid(sx: number, sy: number): Vec2 {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

// Orden de dibujo isométrico: cuanto mayor (x+y), más "adelante" está.
export function depthOf(gx: number, gy: number): number {
  return gx + gy;
}
