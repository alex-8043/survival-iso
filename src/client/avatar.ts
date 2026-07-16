// Personalización del personaje y dibujo animado del avatar en un <canvas> 2D.
// Acciones: idle, walk, run, swing (picar/talar/atacar), swim. Puede llevar una
// herramienta en la mano.

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
export const DEFAULT_CUSTOM: Customization = { physique: 1, skin: 0, hair: 1, hairColor: 1, beard: 0, eyes: 0, shirt: 0, pants: 0, hat: 0 };

export type AvatarAction = 'idle' | 'walk' | 'run' | 'swing' | 'swim';
export interface HeldTool { kind: string; tier: number; }

export interface Category { key: keyof Customization; label: string; options?: string[]; colors?: number[]; }
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

const TIER_COLORS = [0x8a5a2b, 0x8a5a2b, 0x9aa0ab, 0xcfd6de]; // idx por tier (1=madera,2=piedra,3=hierro)
function tierColor(t: number): number { return TIER_COLORS[Math.min(3, Math.max(1, t))]; }

function css(n: number): string { return '#' + ('000000' + n.toString(16)).slice(-6); }
function shade(n: number, f: number): number {
  return (Math.min(255, ((n >> 16) & 0xff) * f) << 16) | (Math.min(255, ((n >> 8) & 0xff) * f) << 8) | Math.min(255, (n & 0xff) * f);
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, Math.max(1, h), r); ctx.fill(); }
function circ(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: number) {
  ctx.strokeStyle = css(color); ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

// Dibuja una herramienta centrada en (0,0) apuntando "hacia arriba" (mango abajo).
export function drawTool(ctx: CanvasRenderingContext2D, kind: string, tier: number, s: number): void {
  const head = tierColor(tier);
  const handle = 0x7a5230;
  if (kind === 'axe') {
    ctx.fillStyle = css(handle); rr(ctx, -1.2 * s, -2 * s, 2.4 * s, 15 * s, 1 * s);
    ctx.fillStyle = css(head);
    ctx.beginPath();
    ctx.moveTo(0, -12 * s); ctx.lineTo(7 * s, -13 * s); ctx.lineTo(8 * s, -6 * s); ctx.lineTo(0, -6 * s); ctx.closePath(); ctx.fill();
  } else if (kind === 'pickaxe') {
    ctx.fillStyle = css(handle); rr(ctx, -1.2 * s, -2 * s, 2.4 * s, 15 * s, 1 * s);
    ctx.strokeStyle = css(head); ctx.lineWidth = 2.4 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8 * s, -8 * s); ctx.quadraticCurveTo(0, -14 * s, 8 * s, -8 * s); ctx.stroke();
  } else {
    ctx.fillStyle = css(head); rr(ctx, -1.3 * s, -14 * s, 2.6 * s, 15 * s, 1 * s);
    ctx.fillStyle = css(0x6a4a2a); rr(ctx, -3.5 * s, -1 * s, 7 * s, 2.2 * s, 1 * s);
    ctx.fillStyle = css(handle); rr(ctx, -1.2 * s, 1 * s, 2.4 * s, 5 * s, 1 * s);
  }
}

export function toolIconCanvas(kind: string, tier: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 30; cv.height = 30;
  const ctx = cv.getContext('2d')!;
  ctx.translate(15, 20);
  ctx.rotate(-Math.PI / 5);
  drawTool(ctx, kind, tier, 1.15);
  return cv;
}

// (cx, cy) = pies; s = escala.
export interface ArmorColors { helmet?: number; chest?: number; legs?: number; boots?: number; }

export function drawAvatar(ctx: CanvasRenderingContext2D, c: Customization, cx: number, cy: number, s: number, action: AvatarAction = 'idle', t = 0, held: HeldTool | null = null, armor: ArmorColors | null = null): void {
  const skin = SKIN_TONES[c.skin], hairC = HAIR_COLORS[c.hairColor], shirt = CLOTH_COLORS[c.shirt], pants = PANTS_COLORS[c.pants], eye = EYE_COLORS[c.eyes];
  const w = [0.82, 1, 1.22][c.physique];
  const ph = t * Math.PI * 2;

  let bob = 0, bodyDown = 0, lean = 0, toolAngle = 0.5;
  const legLift = [0, 0];
  const hand = [{ x: -1, y: 17 }, { x: 1, y: 17 }];
  if (action === 'walk' || action === 'run') {
    const amp = action === 'run' ? 5 : 3;
    legLift[0] = Math.max(0, Math.sin(ph)) * amp; legLift[1] = Math.max(0, Math.sin(ph + Math.PI)) * amp;
    bob = -Math.abs(Math.sin(ph)) * 1.6;
    hand[0].x = -3 - Math.sin(ph) * amp * 0.6; hand[1].x = 3 + Math.sin(ph) * amp * 0.6;
    if (action === 'run') lean = 2;
  } else if (action === 'swing') {
    const c2 = Math.sin(ph * 1.7) * 0.5 + 0.5;
    hand[1] = { x: 6 + c2 * 3, y: -13 + c2 * 28 };
    toolAngle = -1.5 + c2 * 2.4;
  } else if (action === 'swim') {
    bodyDown = 7;
    hand[0] = { x: -8 - Math.sin(ph) * 3, y: 2 }; hand[1] = { x: 8 + Math.sin(ph + Math.PI) * 3, y: 2 };
    legLift[0] = 1 + Math.sin(ph) * 2; legLift[1] = 1 + Math.sin(ph + Math.PI) * 2;
  } else { bob = Math.sin(ph) * 0.6; }

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy, 12 * s, 4.5 * s, 0, 0, Math.PI * 2); ctx.fill();

  const legH = 15;
  const hipY = cy - legH * s + (bob + bodyDown) * s;
  const bodyBottom = hipY + 2 * s;
  const bodyY = bodyBottom - 24 * s;
  const bodyW = 20 * w;
  const headR = 9 * s;
  const headX = cx + lean * s;
  const headY = bodyY - headR + 2 * s;

  ctx.fillStyle = css(pants);
  for (let i = 0; i < 2; i++) {
    const lx = cx + (i === 0 ? -6 * w : 1 * w) * s;
    const footY = cy - legLift[i] * s;
    rr(ctx, lx, hipY, 5 * w * s, footY - hipY, 2 * s);
    ctx.fillStyle = css(shade(pants, 0.6)); rr(ctx, lx, footY - 2.5 * s, 5 * w * s, 2.5 * s, 1 * s); ctx.fillStyle = css(pants);
  }
  // Armadura: perneras y botas (sobre los pantalones).
  if (armor?.legs || armor?.boots) for (let i = 0; i < 2; i++) {
    const lx = cx + (i === 0 ? -6 * w : 1 * w) * s;
    const footY = cy - legLift[i] * s;
    if (armor.legs) { ctx.fillStyle = css(armor.legs); rr(ctx, lx - 0.5 * s, hipY, (5 * w + 1) * s, (footY - hipY) * 0.55, 2 * s); ctx.fillStyle = css(shade(armor.legs, 0.75)); rr(ctx, lx - 0.5 * s, hipY, (5 * w + 1) * s, 2 * s, 1 * s); }
    if (armor.boots) { ctx.fillStyle = css(armor.boots); rr(ctx, lx - 0.8 * s, footY - 4.5 * s, (5 * w + 1.6) * s, 4.5 * s, 1.5 * s); }
  }
  ctx.fillStyle = css(pants);

  // brazo trasero
  limb(ctx, headX - (bodyW / 2) * s, bodyY + 5 * s, cx + hand[0].x * s, bodyY + hand[0].y * s, 4.5 * s, shade(shirt, 0.82));
  ctx.fillStyle = css(skin); circ(ctx, cx + hand[0].x * s, bodyY + hand[0].y * s, 2.6 * s);

  ctx.fillStyle = css(shirt); rr(ctx, headX - (bodyW / 2) * s, bodyY, bodyW * s, 24 * s, 5 * s);

  // Armadura: peto (sobre la camiseta) con hombreras y brillo.
  if (armor?.chest) {
    ctx.fillStyle = css(armor.chest);
    rr(ctx, headX - (bodyW / 2 + 1) * s, bodyY - 1 * s, (bodyW + 2) * s, 16 * s, 4 * s);
    circ(ctx, headX - (bodyW / 2) * s, bodyY + 3 * s, 3.6 * s); circ(ctx, headX + (bodyW / 2) * s, bodyY + 3 * s, 3.6 * s);
    ctx.fillStyle = css(shade(armor.chest, 1.25)); rr(ctx, headX - (bodyW / 2 - 1) * s, bodyY + 1 * s, 2.5 * s, 12 * s, 1 * s);
    ctx.fillStyle = css(shade(armor.chest, 0.7)); rr(ctx, headX - (bodyW / 2 + 1) * s, bodyY + 12 * s, (bodyW + 2) * s, 3 * s, 2 * s);
  }

  ctx.fillStyle = css(skin);
  circ(ctx, headX - headR + 1.5 * s, headY, 2 * s); circ(ctx, headX + headR - 1.5 * s, headY, 2 * s); circ(ctx, headX, headY, headR);
  ctx.fillStyle = css(eye);
  circ(ctx, headX - 3.2 * s, headY - 0.5 * s, 1.5 * s); circ(ctx, headX + 3.2 * s, headY - 0.5 * s, 1.5 * s);
  drawBeard(ctx, c.beard, headX, headY, headR, hairC, s);
  drawHair(ctx, c.hair, headX, headY, headR, hairC, s);
  drawHat(ctx, c.hat, headX, headY, headR, s);
  // Armadura: casco (cubre la parte superior de la cabeza).
  if (armor?.helmet) {
    ctx.fillStyle = css(armor.helmet);
    ctx.beginPath(); ctx.arc(headX, headY - 0.5 * s, headR + 1.5 * s, Math.PI * 0.92, Math.PI * 2.08); ctx.fill();
    rr(ctx, headX - headR - 1 * s, headY - 1.5 * s, (headR * 2 + 2), 3 * s, 1 * s);
    ctx.fillStyle = css(shade(armor.helmet, 0.68)); rr(ctx, headX - headR + 1 * s, headY + 1 * s, headR * 2 - 2 * s, 2 * s, 1 * s); // ranura visor
    ctx.fillStyle = css(shade(armor.helmet, 1.3)); circ(ctx, headX - headR * 0.4, headY - headR * 0.5, 1.3 * s); // brillo
  }

  // brazo delantero
  const hpx = cx + hand[1].x * s, hpy = bodyY + hand[1].y * s;
  limb(ctx, headX + (bodyW / 2) * s, bodyY + 5 * s, hpx, hpy, 4.5 * s, shirt);
  ctx.fillStyle = css(skin); circ(ctx, hpx, hpy, 2.6 * s);
  if (held) {
    ctx.save();
    ctx.translate(hpx, hpy);
    ctx.rotate(toolAngle);
    drawTool(ctx, held.kind, held.tier, s * 0.9);
    ctx.restore();
  }
}

function drawHair(ctx: CanvasRenderingContext2D, style: number, cx: number, hy: number, hr: number, color: number, s: number) {
  if (style === 0) return;
  ctx.fillStyle = css(color);
  if (style === 1) { ctx.beginPath(); ctx.arc(cx, hy - 0.5 * s, hr + 0.5 * s, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(cx + hr, hy - 1 * s); ctx.closePath(); ctx.fill(); }
  else if (style === 2) { rr(ctx, cx - hr - 1 * s, hy - hr, 3 * s, hr * 2.2, 1.5 * s); rr(ctx, cx + hr - 2 * s, hy - hr, 3 * s, hr * 2.2, 1.5 * s); ctx.beginPath(); ctx.arc(cx, hy - 0.5 * s, hr + 0.5 * s, Math.PI, 0); ctx.fill(); }
  else if (style === 3) { rr(ctx, cx - 2 * s, hy - hr - 5 * s, 4 * s, hr + 5 * s, 2 * s); }
  else if (style === 4) { ctx.beginPath(); ctx.arc(cx, hy - 0.5 * s, hr + 0.5 * s, Math.PI, 0); ctx.fill(); circ(ctx, cx + hr + 1 * s, hy + 2 * s, 3 * s); }
  else { for (let a = 0; a < 7; a++) { const ang = Math.PI + (a / 6) * Math.PI; circ(ctx, cx + Math.cos(ang) * hr, hy + Math.sin(ang) * hr, 3 * s); } }
}
function drawBeard(ctx: CanvasRenderingContext2D, style: number, cx: number, hy: number, hr: number, color: number, s: number) {
  if (style === 0) return;
  ctx.fillStyle = css(color);
  if (style === 1) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx, hy + 1 * s, hr, 0.15 * Math.PI, 0.85 * Math.PI); ctx.fill(); ctx.globalAlpha = 1; }
  else if (style === 2) { rr(ctx, cx - 2.5 * s, hy + hr - 3 * s, 5 * s, 4 * s, 2 * s); }
  else { ctx.beginPath(); ctx.arc(cx, hy + 1 * s, hr + 0.5 * s, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill(); }
}
function drawHat(ctx: CanvasRenderingContext2D, style: number, cx: number, hy: number, hr: number, s: number) {
  if (style === 0) return;
  if (style === 1) { ctx.fillStyle = css(0x2f6b8a); ctx.beginPath(); ctx.arc(cx, hy - 1 * s, hr + 1 * s, Math.PI, 0); ctx.fill(); rr(ctx, cx - 1 * s, hy - 1 * s, hr + 6 * s, 3 * s, 1.5 * s); }
  else if (style === 2) { ctx.fillStyle = css(0xc0392b); rr(ctx, cx - hr, hy - hr + 1 * s, hr * 2, 3 * s, 1 * s); }
  else if (style === 3) { ctx.fillStyle = css(0x6b4a2b); rr(ctx, cx - hr - 4 * s, hy - hr, hr * 2 + 8 * s, 3 * s, 1.5 * s); rr(ctx, cx - hr + 2 * s, hy - hr - 6 * s, hr * 2 - 4 * s, 7 * s, 2 * s); }
  else { ctx.fillStyle = css(0x3a4a35); ctx.beginPath(); ctx.arc(cx, hy, hr + 3 * s, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); }
}

export function avatarCanvas(c: Customization, s: number, action: AvatarAction = 'idle', t = 0, held: HeldTool | null = null, armor: ArmorColors | null = null): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(70 * s); cv.height = Math.ceil(80 * s);
  const ctx = cv.getContext('2d')!;
  drawAvatar(ctx, c, cv.width / 2, cv.height - 5 * s, s, action, t, held, armor);
  return cv;
}

// Color representativo de una pieza de armadura por su id (cuero/hierro/oro/diamante).
export function armorColor(itemId: string | undefined): number | undefined {
  if (!itemId) return undefined;
  if (itemId.startsWith('leather')) return 0x8a6b45;
  if (itemId.startsWith('iron')) return 0xc9d2dc;
  if (itemId.startsWith('gold')) return 0xf2cf5a;
  if (itemId.startsWith('diamond')) return 0x6fe6e0;
  return 0xb0b0b0;
}
