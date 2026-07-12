// Personalización del personaje y dibujo del avatar en un <canvas> 2D.
// El mismo dibujo se usa para: preview del menú, avatar del panel y textura
// del sprite del jugador en el mundo.

export interface Customization {
  physique: number;
  skin: number;
  hair: number;
  hairColor: number;
  beard: number;
  eyes: number;
  shirt: number;
  pants: number;
  hat: number;
}

export const SKIN_TONES = [0xf2d3a8, 0xe8b98a, 0xc98b5f, 0x9c6b43, 0x6d4a2f, 0xf7e0c0];
export const HAIR_STYLES = ['Ninguno', 'Corto', 'Largo', 'Mohawk', 'Coleta', 'Rizado'];
export const HAIR_COLORS = [0x2b2b2b, 0x5a3a1e, 0x8a5a2b, 0xc9a24b, 0xd9d4cf, 0xa03a2a];
export const BEARDS = ['Ninguna', 'Incipiente', 'Perilla', 'Poblada'];
export const EYE_COLORS = [0x3a2a1a, 0x2b5c86, 0x3a7d4a, 0x6b4aa0];
export const CLOTH_COLORS = [0xe0803a, 0x4a8f5c, 0x3f7ba8, 0xc85a86, 0x6b7280, 0xd8c24b, 0xb5462f, 0x2f2f38];
export const PANTS_COLORS = [0x3a3f4c, 0x5a4632, 0x2f4a5a, 0x6b3a3a, 0x394a2f, 0x4a4a4a];
export const HATS = ['Ninguno', 'Gorra', 'Cinta', 'Sombrero', 'Capucha'];

export const DEFAULT_CUSTOM: Customization = {
  physique: 1, skin: 0, hair: 1, hairColor: 1, beard: 0, eyes: 0, shirt: 0, pants: 0, hat: 0,
};

export interface Category {
  key: keyof Customization;
  label: string;
  options?: string[];
  colors?: number[];
}

export const CATEGORIES: Category[] = [
  { key: 'physique', label: 'Físico', options: ['Delgado', 'Normal', 'Robusto'] },
  { key: 'skin', label: 'Piel', colors: SKIN_TONES },
  { key: 'hair', label: 'Pelo', options: HAIR_STYLES },
  { key: 'hairColor', label: 'Color de pelo', colors: HAIR_COLORS },
  { key: 'beard', label: 'Barba', options: BEARDS },
  { key: 'eyes', label: 'Ojos', colors: EYE_COLORS },
  { key: 'shirt', label: 'Camisa', colors: CLOTH_COLORS },
  { key: 'pants', label: 'Pantalón', colors: PANTS_COLORS },
  { key: 'hat', label: 'Sombrero', options: HATS },
];

export function categoryLen(cat: Category): number {
  return (cat.options ?? cat.colors ?? []).length;
}

function css(n: number): string {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}
function shade(n: number, f: number): number {
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((n & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function circ(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// (cx, cy) = pies del personaje; s = escala.
export function drawAvatar(ctx: CanvasRenderingContext2D, c: Customization, cx: number, cy: number, s: number): void {
  const skin = SKIN_TONES[c.skin];
  const hairC = HAIR_COLORS[c.hairColor];
  const shirt = CLOTH_COLORS[c.shirt];
  const pants = PANTS_COLORS[c.pants];
  const eye = EYE_COLORS[c.eyes];
  const w = [0.82, 1, 1.22][c.physique];

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 12 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  const legH = 15 * s;
  ctx.fillStyle = css(pants);
  rrect(ctx, cx - 6 * w * s, cy - legH, 5 * w * s, legH, 2 * s);
  rrect(ctx, cx + 1 * w * s, cy - legH, 5 * w * s, legH, 2 * s);
  ctx.fillStyle = css(shade(pants, 0.6));
  rrect(ctx, cx - 6 * w * s, cy - 2.5 * s, 5 * w * s, 2.5 * s, 1 * s);
  rrect(ctx, cx + 1 * w * s, cy - 2.5 * s, 5 * w * s, 2.5 * s, 1 * s);

  const bodyW = 20 * w * s;
  const bodyH = 24 * s;
  const bodyY = cy - legH - bodyH + 2 * s;
  ctx.fillStyle = css(shirt);
  rrect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, 5 * s);
  ctx.fillStyle = css(shade(shirt, 0.82));
  rrect(ctx, cx - bodyW / 2 - 4 * s, bodyY + 3 * s, 5 * s, 16 * s, 2.5 * s);
  rrect(ctx, cx + bodyW / 2 - 1 * s, bodyY + 3 * s, 5 * s, 16 * s, 2.5 * s);
  ctx.fillStyle = css(skin);
  circ(ctx, cx - bodyW / 2 - 1.5 * s, bodyY + 19 * s, 2.6 * s);
  circ(ctx, cx + bodyW / 2 + 1.5 * s, bodyY + 19 * s, 2.6 * s);

  const headR = 9 * s;
  const headY = bodyY - headR + 2 * s;
  ctx.fillStyle = css(skin);
  circ(ctx, cx - headR + 1.5 * s, headY, 2 * s);
  circ(ctx, cx + headR - 1.5 * s, headY, 2 * s);
  circ(ctx, cx, headY, headR);

  ctx.fillStyle = css(eye);
  circ(ctx, cx - 3.2 * s, headY - 0.5 * s, 1.5 * s);
  circ(ctx, cx + 3.2 * s, headY - 0.5 * s, 1.5 * s);

  drawBeard(ctx, c.beard, cx, headY, headR, hairC, s);
  drawHair(ctx, c.hair, cx, headY, headR, hairC, s);
  drawHat(ctx, c.hat, cx, headY, headR, s);
}

function drawHair(ctx: CanvasRenderingContext2D, style: number, cx: number, hy: number, hr: number, color: number, s: number) {
  if (style === 0) return;
  ctx.fillStyle = css(color);
  if (style === 1) {
    // corto
    ctx.beginPath();
    ctx.arc(cx, hy - 0.5 * s, hr + 0.5 * s, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(cx + hr, hy - 1 * s);
    ctx.closePath();
    ctx.fill();
  } else if (style === 2) {
    // largo
    rrect(ctx, cx - hr - 1 * s, hy - hr, 3 * s, hr * 2.2, 1.5 * s);
    rrect(ctx, cx + hr - 2 * s, hy - hr, 3 * s, hr * 2.2, 1.5 * s);
    ctx.beginPath();
    ctx.arc(cx, hy - 0.5 * s, hr + 0.5 * s, Math.PI, 0);
    ctx.fill();
  } else if (style === 3) {
    // mohawk
    rrect(ctx, cx - 2 * s, hy - hr - 5 * s, 4 * s, hr + 5 * s, 2 * s);
  } else if (style === 4) {
    // coleta
    ctx.beginPath();
    ctx.arc(cx, hy - 0.5 * s, hr + 0.5 * s, Math.PI, 0);
    ctx.fill();
    circ(ctx, cx + hr + 1 * s, hy + 2 * s, 3 * s);
  } else {
    // rizado
    for (let a = 0; a < 7; a++) {
      const ang = Math.PI + (a / 6) * Math.PI;
      circ(ctx, cx + Math.cos(ang) * hr, hy + Math.sin(ang) * hr, 3 * s);
    }
  }
}

function drawBeard(ctx: CanvasRenderingContext2D, style: number, cx: number, hy: number, hr: number, color: number, s: number) {
  if (style === 0) return;
  ctx.fillStyle = css(color);
  if (style === 1) {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(cx, hy + 1 * s, hr, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (style === 2) {
    rrect(ctx, cx - 2.5 * s, hy + hr - 3 * s, 5 * s, 4 * s, 2 * s);
  } else {
    ctx.beginPath();
    ctx.arc(cx, hy + 1 * s, hr + 0.5 * s, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.fill();
  }
}

function drawHat(ctx: CanvasRenderingContext2D, style: number, cx: number, hy: number, hr: number, s: number) {
  if (style === 0) return;
  if (style === 1) {
    // gorra
    ctx.fillStyle = css(0x2f6b8a);
    ctx.beginPath();
    ctx.arc(cx, hy - 1 * s, hr + 1 * s, Math.PI, 0);
    ctx.fill();
    rrect(ctx, cx - 1 * s, hy - 1 * s, hr + 6 * s, 3 * s, 1.5 * s);
  } else if (style === 2) {
    // cinta
    ctx.fillStyle = css(0xc0392b);
    rrect(ctx, cx - hr, hy - hr + 1 * s, hr * 2, 3 * s, 1 * s);
  } else if (style === 3) {
    // sombrero
    ctx.fillStyle = css(0x6b4a2b);
    rrect(ctx, cx - hr - 4 * s, hy - hr, hr * 2 + 8 * s, 3 * s, 1.5 * s);
    rrect(ctx, cx - hr + 2 * s, hy - hr - 6 * s, hr * 2 - 4 * s, 7 * s, 2 * s);
  } else {
    // capucha
    ctx.fillStyle = css(0x3a4a35);
    ctx.beginPath();
    ctx.arc(cx, hy, hr + 3 * s, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
  }
}

// Crea un <canvas> con el avatar (para textura del sprite en el mundo).
export function avatarCanvas(c: Customization, s: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const w = Math.ceil(60 * s);
  const h = Math.ceil(78 * s);
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  drawAvatar(ctx, c, w / 2, h - 4 * s, s);
  return cv;
}
