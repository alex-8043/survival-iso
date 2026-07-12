// Iconos 2D (canvas) para los colocables/barca de la hotbar.

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, c: string): void {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function darker(hex: number, f: number): string {
  const r = Math.round(((hex >> 16) & 0xff) * f), g = Math.round(((hex >> 8) & 0xff) * f), b = Math.round((hex & 0xff) * f);
  return `rgb(${r},${g},${b})`;
}
function poly(ctx: CanvasRenderingContext2D, pts: number[], c: string): void {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}

// Cubo isométrico centrado.
function isoCube(ctx: CanvasRenderingContext2D, base: number): void {
  const cx = 15, ty = 5, mh = 11;
  poly(ctx, [cx, ty, cx + 11, ty + 6, cx, ty + 12, cx - 11, ty + 6], '#' + base.toString(16).padStart(6, '0'));
  poly(ctx, [cx - 11, ty + 6, cx, ty + 12, cx, ty + 12 + mh, cx - 11, ty + 6 + mh], darker(base, 0.58));
  poly(ctx, [cx + 11, ty + 6, cx, ty + 12, cx, ty + 12 + mh, cx + 11, ty + 6 + mh], darker(base, 0.42));
}

export const DRAW: Record<string, (ctx: CanvasRenderingContext2D) => void> = {
  crafting_table(ctx) {
    rr(ctx, 6, 9, 3, 15, 1, '#5a3a1e');
    rr(ctx, 21, 9, 3, 15, 1, '#5a3a1e');
    rr(ctx, 4, 5, 22, 7, 2, '#9a6a34');
    rr(ctx, 4, 5, 22, 2.5, 2, '#b57e42');
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(15, 5); ctx.lineTo(15, 12); ctx.stroke();
    rr(ctx, 8, 6.5, 5, 3, 1, '#9aa0ab');
    rr(ctx, 17, 7, 3, 2.5, 1, '#c0392b');
  },
  furnace(ctx) {
    rr(ctx, 5, 4, 20, 22, 3, '#5c5c66');
    rr(ctx, 5, 4, 20, 5, 3, '#71717b');
    rr(ctx, 9, 12, 12, 11, 2, '#211e1d');
    rr(ctx, 10.5, 15, 9, 7, 2, '#ff7a2a');
    rr(ctx, 10.5, 18.5, 9, 3.5, 1, '#ffd05a');
  },
  forge(ctx) {
    rr(ctx, 8, 20, 14, 5, 1.5, '#33333c');
    rr(ctx, 12, 13, 6, 8, 1, '#2b2b33');
    poly(ctx, [4, 6, 24, 6, 27, 10, 20, 12, 8, 12, 3, 10], '#565660');
    rr(ctx, 4, 6, 20, 3, 2, '#6b6b75');
  },
  wood_block(ctx) { isoCube(ctx, 0x9c6b3f); },
  stone_block(ctx) { isoCube(ctx, 0x9aa0ab); },
  boat(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.beginPath(); ctx.ellipse(15, 24, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
    poly(ctx, [3, 12, 27, 12, 22, 23, 8, 23], '#8a5a2b');
    poly(ctx, [3, 12, 27, 12, 24, 9, 6, 9], '#a06a34');
    rr(ctx, 14, 4, 2, 10, 1, '#6a4a28');
  },
};

export function hasItemIcon(item: string): boolean {
  return item in DRAW;
}

export function itemIconCanvas(item: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 30; cv.height = 30;
  const ctx = cv.getContext('2d')!;
  DRAW[item]?.(ctx);
  return cv;
}
