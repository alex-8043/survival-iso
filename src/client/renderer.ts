// Render con PixiJS v8: mundo infinito con relieve (ventana alrededor del
// jugador), nodos y cuevas, animales, jugador, oscurecimiento nocturno y
// selección de objetivo con el ratón.

import { Application, Container, Graphics, Text } from 'pixi.js';
import { TILE_W, TILE_H, MAX_ELEV_PX, INTERACT_RANGE, NIGHT_MAX_DARK } from '../shared/constants';
import { gridToScreen, screenToGrid, depthOf } from '../shared/iso';
import { tileAt, nodeAt, caveAt, TERRAIN } from '../shared/worldgen';
import { skinById, type Skin } from './skins';
import type { AnimalSnap, InteractTarget, Snapshot } from '../shared/protocol';
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
  type: AnimalType;
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
  readonly caves = new Map<string, Container>();
  readonly animals = new Map<number, RenderAnimal>();
  readonly floats: FloatText[] = [];
  readonly depleted = new Set<string>();

  seed = 0;
  skin: Skin = skinById('amber');
  player!: Container;
  prx = 0;
  pry = 0;
  ptile = '';
  tod = 0.35;

  // objetivo bajo el cursor
  mouseX = -1;
  mouseY = -1;
  active = false;
  target: InteractTarget = null;
  private lastSentKey = 'x';
  onInteract: (active: boolean, target: InteractTarget) => void = () => {};

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: 0x1a2b1a,
      antialias: false,
      resizeTo: window,
      preference: 'webgl',
    });
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

  start(seed: number, skinId: string): void {
    this.seed = seed;
    this.skin = skinById(skinId);
    this.player = this.makePlayer(this.skin);
    this.entities.addChild(this.player);
    // eslint-disable-next-line no-console
    console.log('[client] mundo iniciado, seed', seed);
  }

  applySnapshot(snap: Snapshot): void {
    this.prx = snap.px;
    this.pry = snap.py;
    this.tod = snap.time.tod;

    // animales
    const seen = new Set<number>();
    for (const a of snap.animals) {
      if (!a.alive) continue;
      seen.add(a.id);
      let ra = this.animals.get(a.id);
      if (!ra) {
        const sprite = this.makeAnimal(a.type);
        this.entities.addChild(sprite);
        ra = { sprite, type: a.type, rx: a.x, ry: a.y, tx: a.x, ty: a.y };
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
      style: {
        fill: color,
        fontSize: 15,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '700',
        stroke: { color: 0x0a0a12, width: 3 },
      },
    });
    t.anchor.set(0.5);
    const s = gridToScreen(gx, gy);
    t.x = s.x;
    t.y = s.y - elevAt(gx, gy, this.seed) * MAX_ELEV_PX - 34;
    t.zIndex = 2_000_000;
    this.entities.addChild(t);
    this.floats.push({ text: t, life: 0 });
  }

  // --- ventana de terreno / nodos alrededor del jugador ---
  private refreshWindow(ptx: number, pty: number): void {
    this.drawTerrain(ptx, pty);

    const R = this.viewRadius();
    const want = new Set<string>();
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = ptx + dx;
        const y = pty + dy;
        const key = x + ',' + y;
        // nodos
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
        // cuevas (solo visual)
        if (caveAt(x, y, this.seed)) {
          want.add('c' + key);
          if (!this.caves.has(key)) {
            const sprite = this.makeCave();
            const s = gridToScreen(x, y);
            sprite.x = s.x;
            sprite.y = s.y - tileAt(x, y, this.seed).elevation * MAX_ELEV_PX;
            sprite.zIndex = depthOf(x, y) - 0.1;
            this.entities.addChild(sprite);
            this.caves.set(key, sprite);
          }
        }
      }
    }
    // quita nodos/cuevas fuera de la ventana
    for (const [key, rn] of this.nodes) {
      if (!want.has(key)) {
        this.entities.removeChild(rn.sprite);
        rn.sprite.destroy();
        this.nodes.delete(key);
      }
    }
    for (const [key, sprite] of this.caves) {
      if (!want.has('c' + key)) {
        this.entities.removeChild(sprite);
        sprite.destroy();
        this.caves.delete(key);
      }
    }
  }

  private viewRadius(): number {
    return Math.ceil((this.app.screen.width / TILE_W + this.app.screen.height / TILE_H) / 2) + 5;
  }

  private drawTerrain(ptx: number, pty: number): void {
    const g = this.ground;
    g.clear();
    const R = this.viewRadius();
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const halfW = this.app.screen.width / 2 + TILE_W;
    const halfH = this.app.screen.height / 2 + TILE_H + MAX_ELEV_PX;
    // dibuja de atrás hacia delante (por diagonal x+y)
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
        // caras laterales (relieve) si hay altura
        if (lift > 3) {
          g.poly([s.x - hw, topY, s.x, topY + hh, s.x, s.y + hh, s.x - hw, s.y]).fill({
            color: darker(base, 0.62),
          });
          g.poly([s.x, topY + hh, s.x + hw, topY, s.x + hw, s.y, s.x, s.y + hh]).fill({
            color: darker(base, 0.48),
          });
        }
        // tapa (rombo)
        g.poly([s.x, topY - hh, s.x + hw, topY, s.x, topY + hh, s.x - hw, topY]).fill({ color: base });
      }
    }
  }

  // --- sprites ---
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

  private makeCave(): Container {
    const c = new Graphics();
    c.ellipse(0, -2, 16, 8).fill({ color: 0x5a5750 });
    c.ellipse(0, -4, 11, 9).fill({ color: 0x111014 });
    return c;
  }

  private makePlayer(sk: Skin): Container {
    const g = new Graphics();
    g.ellipse(0, 0, 9, 5).fill({ color: 0x000000, alpha: 0.28 });
    g.roundRect(-6, -22, 12, 20, 3).fill({ color: sk.body });
    g.rect(-6, -14, 12, 3).fill({ color: sk.belt });
    g.circle(0, -26, 6.5).fill({ color: sk.head });
    return g;
  }

  private makeAnimal(type: AnimalType): Container {
    const g = new Graphics();
    g.ellipse(0, -1, 11, 5).fill({ color: 0x000000, alpha: 0.22 });
    if (type === 'cow') {
      g.roundRect(-11, -14, 22, 12, 5).fill({ color: 0xf2f0eb });
      g.ellipse(4, -12, 5, 4).fill({ color: 0x3a352f });
      g.ellipse(-5, -6, 4, 3).fill({ color: 0x3a352f });
      g.circle(11, -13, 5).fill({ color: 0xf2f0eb });
      g.circle(11, -13, 2).fill({ color: 0xd98a9a });
    } else if (type === 'pig') {
      g.roundRect(-10, -13, 20, 11, 5).fill({ color: 0xe79ab0 });
      g.circle(10, -12, 4.5).fill({ color: 0xe79ab0 });
      g.circle(10, -12, 2).fill({ color: 0xc76e88 });
    } else if (type === 'chicken') {
      g.roundRect(-6, -12, 12, 10, 4).fill({ color: 0xf7f3e8 });
      g.circle(6, -14, 3.5).fill({ color: 0xf7f3e8 });
      g.poly([6, -18, 9, -18, 7, -15]).fill({ color: 0xd8433a });
      g.poly([9, -14, 13, -13, 9, -12]).fill({ color: 0xe8a13a });
    } else {
      g.roundRect(-11, -15, 22, 13, 7).fill({ color: 0xece7dc });
      g.circle(11, -13, 4.5).fill({ color: 0x4a423a });
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

    // jugador (suavizado) + cámara
    const ps = gridToScreen(this.prx, this.pry);
    const py = ps.y - elevAt(this.prx, this.pry, this.seed) * MAX_ELEV_PX;
    this.player.x = ps.x;
    this.player.y = py;
    this.player.zIndex = depthOf(this.prx, this.pry) + 0.3;
    this.world.x = this.app.screen.width / 2 - ps.x;
    this.world.y = this.app.screen.height / 2 - py;

    // ¿cambió de tile? refresca ventana
    const ptx = Math.round(this.prx);
    const pty = Math.round(this.pry);
    const tk = ptx + ',' + pty;
    if (tk !== this.ptile) {
      this.ptile = tk;
      this.refreshWindow(ptx, pty);
    }

    // animales suavizados
    for (const ra of this.animals.values()) {
      ra.rx += (ra.tx - ra.rx) * k;
      ra.ry += (ra.ty - ra.ry) * k;
      const s = gridToScreen(ra.rx, ra.ry);
      ra.sprite.x = s.x;
      ra.sprite.y = s.y - elevAt(ra.rx, ra.ry, this.seed) * MAX_ELEV_PX;
      ra.sprite.zIndex = depthOf(ra.rx, ra.ry) + 0.1;
    }

    // pulso de nodos
    for (const rn of this.nodes.values()) {
      if (rn.pulse > 0) {
        rn.pulse = Math.max(0, rn.pulse - dt * 6);
        rn.sprite.scale.set(1 + 0.16 * rn.pulse);
      }
    }

    // flotantes
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

  private computeTarget(): void {
    let next: InteractTarget = null;
    if (this.mouseX >= 0) {
      const wx = this.mouseX - this.world.x;
      const wy = this.mouseY - this.world.y;
      // animal más cercano al cursor (por pantalla) y en rango
      let bestD = 22;
      for (const [id, ra] of this.animals) {
        const dpx = ra.sprite.x - wx;
        const dpy = ra.sprite.y + 10 - wy;
        const d = Math.hypot(dpx, dpy);
        if (d < bestD && Math.hypot(ra.rx - this.prx, ra.ry - this.pry) <= INTERACT_RANGE) {
          bestD = d;
          next = { kind: 'animal', id };
        }
      }
      if (!next) {
        const g = screenToGrid(wx, wy);
        const gx = Math.round(g.x);
        const gy = Math.round(g.y);
        const key = gx + ',' + gy;
        if (
          !this.depleted.has(key) &&
          nodeAt(gx, gy, this.seed) &&
          Math.hypot(gx - this.prx, gy - this.pry) <= INTERACT_RANGE
        ) {
          next = { kind: 'node', x: gx, y: gy };
        }
      }
    }
    this.target = next;
    this.app.canvas.style.cursor = next ? 'pointer' : 'default';

    // resaltado
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

    // emite si cambió
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
    if (d > 0.001) {
      g.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0x0a1230, alpha: d });
    }
  }

  private nightAlpha(tod: number): number {
    const dist = Math.abs(tod - 0.5) * 2; // 0 mediodía, 1 medianoche
    const x = Math.min(1, Math.max(0, (dist - 0.35) / 0.4));
    return NIGHT_MAX_DARK * (x * x * (3 - 2 * x));
  }
}
