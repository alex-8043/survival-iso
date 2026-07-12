// Render con PixiJS v8: mundo infinito con relieve, nodos, animales, jugador
// (con avatar personalizado), oscurecimiento nocturno y selección con el ratón
// corregida para el terreno con elevación.

import { Application, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { TILE_W, TILE_H, MAX_ELEV_PX, INTERACT_RANGE, NIGHT_MAX_DARK } from '../shared/constants';
import { gridToScreen, screenToGrid, depthOf } from '../shared/iso';
import { tileAt, nodeAt, TERRAIN } from '../shared/worldgen';
import { avatarCanvas, type Customization } from './avatar';
import type { InteractTarget, Snapshot } from '../shared/protocol';
import type { AnimalType } from '../shared/items';

const TERRAIN_COLORS: Record<number, number> = {
  [TERRAIN.DEEP_WATER]: 0x24507a,
  [TERRAIN.WATER]: 0x3a79a6,
  [TERRAIN.SAND]: 0xd9c48a,
  [TERRAIN.GRASS]: 0x5a9e4f,
  [TERRAIN.FOREST]: 0x468a41,
  [TERRAIN.ROCK]: 0x8f8b7c,
  [TERRAIN.MOUNTAIN]: 0x7c746b,
  [TERRAIN.SNOW]: 0xe9edf2,
};

function darker(color: number, f: number): number {
  const r = ((color >> 16) & 0xff) * f;
  const g = ((color >> 8) & 0xff) * f;
  const b = (color & 0xff) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

interface RenderNode {
  sprite: Container;
  pulse: number;
}
interface RenderAnimal {
  sprite: Container;
  rx: number;
  ry: number;
  tx: number;
  ty: number;
}
interface FloatText {
  text: Text;
  life: number;
}

function elevAt(x: number, y: number, seed: number): number {
  return tileAt(Math.round(x), Math.round(y), seed).elevation;
}

export class GameRenderer {
  app!: Application;
  readonly world = new Container();
  readonly ground = new Graphics();
  readonly highlight = new Graphics();
  readonly entities = new Container();
  readonly darkness = new Graphics();

  readonly nodes = new Map<string, RenderNode>();
  readonly animals = new Map<number, RenderAnimal>();
  readonly floats: FloatText[] = [];
  readonly depleted = new Set<string>();

  seed = 0;
  player: Container | null = null;
  prx = 0;
  pry = 0;
  ptile = '';
  tod = 0.35;

  mouseX = -1;
  mouseY = -1;
  active = false;
  target: InteractTarget = null;
  private lastSentKey = 'x';
  onInteract: (active: boolean, target: InteractTarget) => void = () => {};

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({ background: 0x1a2b1a, antialias: false, resizeTo: window, preference: 'webgl' });
    parent.appendChild(this.app.canvas);

    this.entities.sortableChildren = true;
    this.world.addChild(this.ground);
    this.world.addChild(this.highlight);
    this.world.addChild(this.entities);
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.darkness);

    const canvas = this.app.canvas;
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('pointerdown', () => {
      this.active = true;
      this.emitInteract();
    });
    window.addEventListener('pointerup', () => {
      this.active = false;
      this.emitInteract();
    });

    this.app.ticker.add((t) => this.update(t.deltaMS));
    // eslint-disable-next-line no-console
    console.log('[client] pixi listo');
  }

  start(seed: number, custom: Customization, px = 0, py = 0): void {
    this.seed = seed;
    this.prx = px;
    this.pry = py;
    this.player = this.makePlayerSprite(custom);
    this.entities.addChild(this.player);
    this.ptile = '';
    // eslint-disable-next-line no-console
    console.log('[client] mundo iniciado, seed', seed);
  }

  applySnapshot(snap: Snapshot): void {
    this.prx = snap.px;
    this.pry = snap.py;
    this.tod = snap.time.tod;
    const seen = new Set<number>();
    for (const a of snap.animals) {
      if (!a.alive) continue;
      seen.add(a.id);
      let ra = this.animals.get(a.id);
      if (!ra) {
        const sprite = this.makeAnimal(a.type);
        this.entities.addChild(sprite);
        ra = { sprite, rx: a.x, ry: a.y, tx: a.x, ty: a.y };
        this.animals.set(a.id, ra);
      }
      ra.tx = a.x;
      ra.ty = a.y;
    }
    for (const [id, ra] of this.animals) {
      if (!seen.has(id)) {
        this.entities.removeChild(ra.sprite);
        ra.sprite.destroy();
        this.animals.delete(id);
      }
    }
  }

  onHarvest(x: number, y: number, depleted: boolean): void {
    const key = x + ',' + y;
    const rn = this.nodes.get(key);
    if (rn) rn.pulse = 1;
    if (depleted) {
      this.depleted.add(key);
      if (rn) {
        this.entities.removeChild(rn.sprite);
        rn.sprite.destroy();
        this.nodes.delete(key);
      }
    }
  }

  spawnFloat(label: string, color: number, gx: number, gy: number): void {
    const t = new Text({
      text: label,
      style: { fill: color, fontSize: 15, fontFamily: 'system-ui, sans-serif', fontWeight: '700', stroke: { color: 0x0a0a12, width: 3 } },
    });
    t.anchor.set(0.5);
    const s = gridToScreen(gx, gy);
    t.x = s.x;
    t.y = s.y - elevAt(gx, gy, this.seed) * MAX_ELEV_PX - 34;
    t.zIndex = 2_000_000;
    this.entities.addChild(t);
    this.floats.push({ text: t, life: 0 });
  }

  private refreshWindow(ptx: number, pty: number): void {
    this.drawTerrain(ptx, pty);
    const R = this.viewRadius();
    const want = new Set<string>();
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = ptx + dx;
        const y = pty + dy;
        const key = x + ',' + y;
        if (!this.depleted.has(key) && nodeAt(x, y, this.seed)) {
          want.add(key);
          if (!this.nodes.has(key)) {
            const kind = nodeAt(x, y, this.seed)!;
            const sprite = this.makeNode(kind);
            const s = gridToScreen(x, y);
            sprite.x = s.x;
            sprite.y = s.y - tileAt(x, y, this.seed).elevation * MAX_ELEV_PX;
            sprite.zIndex = depthOf(x, y);
            this.entities.addChild(sprite);
            this.nodes.set(key, { sprite, pulse: 0 });
          }
        }
      }
    }
    for (const [key, rn] of this.nodes) {
      if (!want.has(key)) {
        this.entities.removeChild(rn.sprite);
        rn.sprite.destroy();
        this.nodes.delete(key);
      }
    }
  }

  private viewRadius(): number {
    return Math.ceil((this.app.screen.width / TILE_W + this.app.screen.height / TILE_H) / 2) + 6;
  }

  private drawTerrain(ptx: number, pty: number): void {
    const g = this.ground;
    g.clear();
    const R = this.viewRadius();
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const halfW = this.app.screen.width / 2 + TILE_W;
    const halfH = this.app.screen.height / 2 + TILE_H + MAX_ELEV_PX;
    for (let d = -2 * R; d <= 2 * R; d++) {
      const dxMin = Math.max(-R, d - R);
      const dxMax = Math.min(R, d + R);
      for (let dx = dxMin; dx <= dxMax; dx++) {
        const dy = d - dx;
        const relX = (dx - dy) * hw;
        const relY = (dx + dy) * hh;
        if (relX < -halfW || relX > halfW || relY < -halfH || relY > halfH) continue;
        const x = ptx + dx;
        const y = pty + dy;
        const info = tileAt(x, y, this.seed);
        const base = TERRAIN_COLORS[info.terrain] ?? 0x5a9e4f;
        const s = gridToScreen(x, y);
        const lift = info.elevation * MAX_ELEV_PX;
        const topY = s.y - lift;
        if (lift > 3) {
          g.poly([s.x - hw, topY, s.x, topY + hh, s.x, s.y + hh, s.x - hw, s.y]).fill({ color: darker(base, 0.6) });
          g.poly([s.x, topY + hh, s.x + hw, topY, s.x + hw, s.y, s.x, s.y + hh]).fill({ color: darker(base, 0.45) });
        }
        g.poly([s.x, topY - hh, s.x + hw, topY, s.x, topY + hh, s.x - hw, topY]).fill({ color: base });
      }
    }
  }

  private makeNode(kind: string): Container {
    const c = new Graphics();
    if (kind === 'tree') {
      c.ellipse(0, -2, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.rect(-3, -20, 6, 20).fill({ color: 0x6b4a2b });
      c.ellipse(0, -28, 16, 18).fill({ color: 0x2f7d3a });
      c.ellipse(-6, -34, 10, 11).fill({ color: 0x3a9247 });
    } else {
      c.ellipse(0, -1, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.ellipse(0, -6, 14, 10).fill({ color: 0x7a7f8a });
      c.ellipse(-4, -10, 8, 7).fill({ color: 0x9aa0ab });
    }
    return c;
  }

  private makePlayerSprite(custom: Customization): Container {
    const cv = avatarCanvas(custom, 0.85);
    const sp = new Sprite(Texture.from(cv));
    sp.anchor.set(0.5, 1 - (4 * 0.85) / cv.height);
    return sp;
  }

  private makeAnimal(type: AnimalType): Container {
    const g = new Graphics();
    g.ellipse(0, -1, 14, 5).fill({ color: 0x000000, alpha: 0.2 });
    if (type === 'cow') {
      for (const lx of [-8, -3, 4, 9]) g.rect(lx, -6, 2.6, 6).fill({ color: 0x2b2620 });
      g.roundRect(-13, -18, 26, 13, 6).fill({ color: 0xf4f1ec });
      g.ellipse(-4, -12, 5, 4).fill({ color: 0x3a352f });
      g.ellipse(6, -15, 4, 3).fill({ color: 0x3a352f });
      g.rect(-14, -16, 2, 9).fill({ color: 0xf4f1ec });
      g.circle(-13, -6, 2).fill({ color: 0x3a352f });
      g.roundRect(9, -20, 11, 11, 4).fill({ color: 0xf4f1ec });
      g.rect(12, -22, 1.6, 3).fill({ color: 0xd9cbb0 });
      g.rect(16, -22, 1.6, 3).fill({ color: 0xd9cbb0 });
      g.ellipse(8, -19, 3, 2).fill({ color: 0xf4f1ec });
      g.roundRect(15, -15, 6, 5, 2).fill({ color: 0xd98a9a });
      g.circle(17, -12.5, 0.8).fill({ color: 0x6a3a44 });
      g.circle(13, -16, 1.3).fill({ color: 0x231f1b });
    } else if (type === 'pig') {
      for (const lx of [-7, -2, 3, 7]) g.rect(lx, -5, 2.4, 5).fill({ color: 0xa8637a });
      g.roundRect(-11, -16, 22, 12, 7).fill({ color: 0xe79ab0 });
      g.poly([9, -18, 13, -20, 12, -15]).fill({ color: 0xd97e97 });
      g.roundRect(8, -16, 9, 9, 4).fill({ color: 0xe79ab0 });
      g.ellipse(16, -11, 3, 2.4).fill({ color: 0xd06e88 });
      g.circle(15.4, -11, 0.6).fill({ color: 0x8a4a5e });
      g.circle(16.8, -11, 0.6).fill({ color: 0x8a4a5e });
      g.circle(12, -13, 1.2).fill({ color: 0x3a2028 });
      g.circle(-12, -12, 1.6).stroke({ width: 1.4, color: 0xd06e88 });
    } else if (type === 'chicken') {
      for (const lx of [-1, 3]) g.rect(lx, -4, 1.5, 4).fill({ color: 0xe8a13a });
      g.ellipse(-3, -8, 6, 6).fill({ color: 0xece6d6 });
      g.ellipse(1, -9, 8, 7).fill({ color: 0xf7f3e8 });
      g.poly([-9, -10, -13, -13, -13, -8]).fill({ color: 0xf1ead9 });
      g.circle(6, -15, 4).fill({ color: 0xf7f3e8 });
      g.circle(5, -18, 1.4).fill({ color: 0xd8433a });
      g.circle(7, -18.5, 1.4).fill({ color: 0xd8433a });
      g.poly([10, -15, 14, -14, 10, -12.5]).fill({ color: 0xe8a13a });
      g.circle(8, -13, 1.2).fill({ color: 0xd8433a });
      g.circle(6.5, -15.5, 1).fill({ color: 0x241f1b });
    } else {
      for (const lx of [-8, -3, 4, 9]) g.rect(lx, -6, 2.4, 6).fill({ color: 0x3a342c });
      for (const [ox, oy, rr] of [[-8, -12, 6], [-2, -15, 7], [5, -13, 6], [9, -10, 5], [-4, -9, 6], [3, -8, 6]] as const)
        g.circle(ox, oy, rr).fill({ color: 0xece7dc });
      g.roundRect(9, -16, 9, 9, 3).fill({ color: 0x4a423a });
      g.ellipse(9, -16, 2.5, 3).fill({ color: 0x4a423a });
      g.circle(14, -12, 1.2).fill({ color: 0xe6e0d4 });
    }
    return g;
  }

  private update(dtMs: number): void {
    if (!this.app || !this.player) {
      this.drawDarkness();
      return;
    }
    const dt = dtMs / 1000;
    const k = Math.min(1, dt * 20);

    const ps = gridToScreen(this.prx, this.pry);
    const py = ps.y - elevAt(this.prx, this.pry, this.seed) * MAX_ELEV_PX;
    this.player.x = ps.x;
    this.player.y = py;
    this.player.zIndex = depthOf(this.prx, this.pry) + 0.3;
    this.world.x = this.app.screen.width / 2 - ps.x;
    this.world.y = this.app.screen.height / 2 - py;

    const ptx = Math.round(this.prx);
    const pty = Math.round(this.pry);
    const tk = ptx + ',' + pty;
    if (tk !== this.ptile) {
      this.ptile = tk;
      this.refreshWindow(ptx, pty);
    }

    for (const ra of this.animals.values()) {
      ra.rx += (ra.tx - ra.rx) * k;
      ra.ry += (ra.ty - ra.ry) * k;
      const s = gridToScreen(ra.rx, ra.ry);
      ra.sprite.x = s.x;
      ra.sprite.y = s.y - elevAt(ra.rx, ra.ry, this.seed) * MAX_ELEV_PX;
      ra.sprite.zIndex = depthOf(ra.rx, ra.ry) + 0.1;
    }

    for (const rn of this.nodes.values()) {
      if (rn.pulse > 0) {
        rn.pulse = Math.max(0, rn.pulse - dt * 6);
        rn.sprite.scale.set(1 + 0.16 * rn.pulse);
      }
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life += dt;
      f.text.y -= dt * 26;
      f.text.alpha = Math.max(0, 1 - f.life / 1.0);
      if (f.life >= 1.0) {
        this.entities.removeChild(f.text);
        f.text.destroy();
        this.floats.splice(i, 1);
      }
    }

    this.computeTarget();
    this.drawDarkness();
  }

  // Selección de tile teniendo en cuenta la elevación (rombo elevado bajo el cursor).
  private pickTile(wx: number, wy: number): { x: number; y: number } {
    const g0 = screenToGrid(wx, wy);
    const bx = Math.round(g0.x);
    const by = Math.round(g0.y);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const K = Math.ceil(MAX_ELEV_PX / hh) + 1;
    let best: { x: number; y: number } | null = null;
    let bestDepth = -Infinity;
    for (let ox = -1; ox <= K; ox++) {
      for (let oy = -1; oy <= K; oy++) {
        const tx = bx + ox;
        const ty = by + oy;
        const lift = tileAt(tx, ty, this.seed).elevation * MAX_ELEV_PX;
        const s = gridToScreen(tx, ty);
        const cyv = s.y - lift;
        if (Math.abs(wx - s.x) / hw + Math.abs(wy - cyv) / hh <= 1) {
          const depth = tx + ty;
          if (depth > bestDepth) {
            bestDepth = depth;
            best = { x: tx, y: ty };
          }
        }
      }
    }
    return best ?? { x: bx, y: by };
  }

  private computeTarget(): void {
    let next: InteractTarget = null;
    if (this.mouseX >= 0) {
      const wx = this.mouseX - this.world.x;
      const wy = this.mouseY - this.world.y;
      let bestD = 24;
      for (const [id, ra] of this.animals) {
        const d = Math.hypot(ra.sprite.x - wx, ra.sprite.y - 8 - wy);
        if (d < bestD && Math.hypot(ra.rx - this.prx, ra.ry - this.pry) <= INTERACT_RANGE) {
          bestD = d;
          next = { kind: 'animal', id };
        }
      }
      if (!next) {
        const t = this.pickTile(wx, wy);
        const key = t.x + ',' + t.y;
        if (!this.depleted.has(key) && nodeAt(t.x, t.y, this.seed) && Math.hypot(t.x - this.prx, t.y - this.pry) <= INTERACT_RANGE) {
          next = { kind: 'node', x: t.x, y: t.y };
        }
      }
    }
    this.target = next;
    this.app.canvas.style.cursor = next ? 'pointer' : 'default';

    this.highlight.clear();
    if (next) {
      let hx = 0;
      let hy = 0;
      let hl = 0;
      if (next.kind === 'node') {
        hx = next.x;
        hy = next.y;
        hl = tileAt(next.x, next.y, this.seed).elevation * MAX_ELEV_PX;
      } else {
        const ra = this.animals.get(next.id);
        if (ra) {
          hx = ra.rx;
          hy = ra.ry;
          hl = elevAt(ra.rx, ra.ry, this.seed) * MAX_ELEV_PX;
        }
      }
      const s = gridToScreen(hx, hy);
      const hw = TILE_W / 2;
      const hh = TILE_H / 2;
      const yy = s.y - hl;
      this.highlight
        .poly([s.x, yy - hh, s.x + hw, yy, s.x, yy + hh, s.x - hw, yy])
        .stroke({ width: 2, color: next.kind === 'animal' ? 0xff6b6b : 0xf5c96b, alpha: 0.95 });
    }

    const key = next ? (next.kind === 'node' ? 'n' + next.x + ',' + next.y : 'a' + next.id) : '-';
    if (key !== this.lastSentKey) {
      this.lastSentKey = key;
      this.app.canvas.setAttribute('data-target', next ? next.kind : 'none');
      this.emitInteract();
    }
  }

  private emitInteract(): void {
    this.onInteract(this.active, this.target);
  }

  private drawDarkness(): void {
    const d = this.nightAlpha(this.tod);
    const g = this.darkness;
    g.clear();
    if (d > 0.001) g.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0x0a1230, alpha: d });
  }

  private nightAlpha(tod: number): number {
    const dist = Math.abs(tod - 0.5) * 2;
    const x = Math.min(1, Math.max(0, (dist - 0.35) / 0.4));
    return NIGHT_MAX_DARK * (x * x * (3 - 2 * x));
  }
}
