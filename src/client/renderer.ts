// Render con PixiJS v8: mundo con relieve, nodos, animales, jugador animado,
// estructuras colocables, barca, día/noche y selección/colocación con el ratón.

import { Application, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { TILE_W, TILE_H, MAX_ELEV_PX, INTERACT_RANGE, NIGHT_MAX_DARK, PLAYER_SPEED } from '../shared/constants';
import { gridToScreen, screenToGrid, depthOf } from '../shared/iso';
import { tileAt, nodeAt, isWater, playerBlocked, TERRAIN, caveTile, caveNodeAt, caveEntranceAt, caveDecorAt, springAt, type CaveTile } from '../shared/worldgen';
import { avatarCanvas, type AvatarAction, type Customization, type HeldTool } from './avatar';
import { ITEMS } from '../shared/items';
import { getCode, keyLabel } from './keybinds';
import type { InteractTarget, Snapshot, Structure, Location } from '../shared/protocol';
import type { AnimalType } from '../shared/items';
import type { HotbarSel } from './hotbar';

const TERRAIN_COLORS: Record<number, number> = {
  [TERRAIN.DEEP_WATER]: 0x24507a, [TERRAIN.WATER]: 0x3a79a6, [TERRAIN.SAND]: 0xd9c48a,
  [TERRAIN.GRASS]: 0x5a9e4f, [TERRAIN.FOREST]: 0x468a41, [TERRAIN.ROCK]: 0x8f8b7c,
  [TERRAIN.MOUNTAIN]: 0x7c746b, [TERRAIN.SNOW]: 0xe9edf2,
};
const ANIM_FRAMES: Record<AvatarAction, number> = { idle: 1, walk: 6, run: 6, swing: 6, swim: 6 };
const ANIM_RATE: Record<AvatarAction, number> = { idle: 0.5, walk: 1.5, run: 2.6, swing: 2.2, swim: 1.3 };
const PLAYER_SCALE = 0.85;

function darker(color: number, f: number): number {
  return (Math.round(((color >> 16) & 0xff) * f) << 16) | (Math.round(((color >> 8) & 0xff) * f) << 8) | Math.round((color & 0xff) * f);
}
const CAVE_FLOOR = 0x3a3a47;
const CAVE_WALL = 0x2a2a35;

interface RenderNode { sprite: Container; pulse: number; }
interface RenderAnimal { sprite: Container; rx: number; ry: number; tx: number; ty: number; }
interface FloatText { text: Text; life: number; }

export class GameRenderer {
  app!: Application;
  readonly world = new Container();
  readonly ground = new Graphics();
  readonly highlight = new Graphics();
  readonly ghost = new Graphics();
  readonly entities = new Container();
  readonly darkness = new Graphics();

  readonly nodes = new Map<string, RenderNode>();
  readonly decor = new Map<string, Container>();
  readonly animals = new Map<number, RenderAnimal>();
  readonly structs = new Map<number, Container>();
  readonly floats: FloatText[] = [];
  readonly depleted = new Set<string>();
  jumpOff = 0; jumpVel = 0;

  seed = 0;
  player: Sprite | null = null;
  boat: Container | null = null;
  frames: Record<string, Texture[]> = {};
  custom: Customization | null = null;
  held: HeldTool | null = null;
  heldKey = '';
  animT = 0;
  prx = 0; pry = 0; lastPrx = 0; lastPry = 0;
  ptile = ''; tod = 0.35; onWater = false; hasBoat = false;

  loc: Location = 'surface';
  caveSeed = 0;
  caveDark: Sprite | null = null;
  vigW = 0; vigH = 0;

  mouseX = -1; mouseY = -1; active = false;
  target: InteractTarget = null;
  selected: HotbarSel | null = null;
  placeTile: { x: number; y: number } | null = null;
  structTarget: { id: number; type: string; x: number; y: number } | null = null;
  readonly structTiles = new Map<string, { id: number; type: string }>();
  exitMarker: Container | null = null;
  private lastSentKey = 'x';
  onInteract: (active: boolean, target: InteractTarget) => void = () => {};
  onPlace: (x: number, y: number, item: string) => void = () => {};
  onOpenStation: (type: string) => void = () => {};
  onOpenChest: (id: number) => void = () => {};

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({ background: 0x1a2b1a, antialias: false, resizeTo: window, preference: 'webgl' });
    parent.appendChild(this.app.canvas);
    this.entities.sortableChildren = true;
    this.world.addChild(this.ground);
    this.world.addChild(this.highlight);
    this.world.addChild(this.ghost);
    this.world.addChild(this.entities);
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.darkness);
    this.caveDark = new Sprite(Texture.EMPTY);
    this.caveDark.visible = false;
    this.app.stage.addChild(this.caveDark);
    this.exitMarker = this.makeExitMarker();
    this.exitMarker.visible = false;
    this.app.stage.addChild(this.exitMarker);

    const cv = this.app.canvas;
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    cv.addEventListener('pointerdown', () => {
      if (this.selected?.kind === 'place' && this.selected.item && this.placeTile) {
        this.onPlace(this.placeTile.x, this.placeTile.y, this.selected.item);
        return;
      }
      if (this.structTarget) {
        if (this.structTarget.type === 'chest') this.onOpenChest(this.structTarget.id);
        else this.onOpenStation(this.structTarget.type);
        return;
      }
      this.active = true;
      this.emitInteract();
    });
    window.addEventListener('pointerup', () => { this.active = false; this.emitInteract(); });
    this.app.ticker.add((t) => this.update(t.deltaMS));
    // eslint-disable-next-line no-console
    console.log('[client] pixi listo');
  }

  start(seed: number, custom: Customization, px = 0, py = 0): void {
    this.seed = seed;
    this.custom = custom;
    this.held = null; this.heldKey = '';
    this.loc = 'surface';
    this.prx = this.lastPrx = px;
    this.pry = this.lastPry = py;
    this.buildFrames();
    this.player = new Sprite(this.frames.idle[0]);
    this.player.anchor.set(0.5, 0.9375);
    this.entities.addChild(this.player);
    this.boat = this.makeBoat();
    this.boat.visible = false;
    this.entities.addChild(this.boat);
    this.ptile = '';
    // eslint-disable-next-line no-console
    console.log('[client] mundo iniciado, seed', seed);
  }

  private destroyFrames(): void {
    for (const arr of Object.values(this.frames)) for (const tx of arr) tx.destroy(true);
    this.frames = {};
  }

  private buildFrames(): void {
    if (!this.custom) return;
    this.destroyFrames();
    for (const action of Object.keys(ANIM_FRAMES) as AvatarAction[]) {
      const n = ANIM_FRAMES[action];
      const arr: Texture[] = [];
      for (let i = 0; i < n; i++) arr.push(Texture.from(avatarCanvas(this.custom, PLAYER_SCALE, action, i / n, this.held)));
      this.frames[action] = arr;
    }
    if (this.player) this.player.texture = this.frames.idle[0];
  }

  // Regenera los fotogramas del avatar con (o sin) la herramienta en la mano.
  setHeldTool(held: HeldTool | null): void {
    const key = held ? held.kind + held.tier : '';
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.held = held;
    if (this.custom && this.player) this.buildFrames();
  }

  // A partir del id de ítem seleccionado en la hotbar.
  setHeldFromItem(item: string | null): void {
    const tool = item ? ITEMS[item]?.tool : undefined;
    this.setHeldTool(tool ? { kind: tool.kind, tier: tool.tier } : null);
  }

  // Cambia de capa (superficie <-> cueva) y reconstruye el mundo visible.
  setLayer(loc: Location, caveSeed: number): void {
    if (loc === this.loc && caveSeed === this.caveSeed) return;
    this.loc = loc;
    this.caveSeed = caveSeed;
    for (const [key, rn] of this.nodes) { this.entities.removeChild(rn.sprite); rn.sprite.destroy(); this.nodes.delete(key); }
    for (const [key, sp] of this.decor) { this.entities.removeChild(sp); sp.destroy(); this.decor.delete(key); }
    for (const sp of this.structs.values()) sp.visible = loc === 'surface';
    this.ptile = '';
  }

  jump(): void {
    if (this.jumpOff <= 0.01 && this.jumpVel === 0) this.jumpVel = 235;
  }

  // --- Consultas de mundo según la capa activa (superficie o cueva) ---
  private elevAtL(x: number, y: number): number {
    const rx = Math.round(x), ry = Math.round(y);
    return this.loc === 'cave' ? caveTile(rx, ry, this.caveSeed).elevation : tileAt(rx, ry, this.seed).elevation;
  }
  private nodeKindAtL(x: number, y: number): string | null {
    return this.loc === 'cave' ? caveNodeAt(x, y, this.caveSeed) : nodeAt(x, y, this.seed);
  }
  private nodeKey(x: number, y: number): string {
    return this.loc === 'cave' ? 'c' + this.caveSeed + ':' + x + ',' + y : x + ',' + y;
  }

  applySnapshot(snap: Snapshot): void {
    this.prx = snap.px; this.pry = snap.py; this.tod = snap.time.tod; this.onWater = snap.onWater;
    const seen = new Set<number>();
    for (const a of snap.animals) {
      if (!a.alive) continue;
      seen.add(a.id);
      let ra = this.animals.get(a.id);
      if (!ra) { const sprite = this.makeAnimal(a.type); this.entities.addChild(sprite); ra = { sprite, rx: a.x, ry: a.y, tx: a.x, ty: a.y }; this.animals.set(a.id, ra); }
      ra.tx = a.x; ra.ty = a.y;
    }
    for (const [id, ra] of this.animals) if (!seen.has(id)) { this.entities.removeChild(ra.sprite); ra.sprite.destroy(); this.animals.delete(id); }
  }

  setStructures(list: Structure[]): void {
    this.structTiles.clear();
    for (const s of list) this.structTiles.set(s.x + ',' + s.y, { id: s.id, type: s.type });
    const seen = new Set<number>();
    for (const s of list) {
      seen.add(s.id);
      if (!this.structs.has(s.id)) {
        const sprite = this.makeStructure(s.type);
        const p = gridToScreen(s.x, s.y);
        sprite.x = p.x;
        sprite.y = p.y - tileAt(s.x, s.y, this.seed).elevation * MAX_ELEV_PX;
        sprite.zIndex = depthOf(s.x, s.y) + 0.15;
        sprite.visible = this.loc === 'surface';
        this.entities.addChild(sprite);
        this.structs.set(s.id, sprite);
      }
    }
    for (const [id, sp] of this.structs) if (!seen.has(id)) { this.entities.removeChild(sp); sp.destroy(); this.structs.delete(id); }
  }

  onHarvest(x: number, y: number, depleted: boolean): void {
    const key = this.nodeKey(x, y);
    const rn = this.nodes.get(key);
    if (rn) rn.pulse = 1;
    if (depleted) { this.depleted.add(key); if (rn) { this.entities.removeChild(rn.sprite); rn.sprite.destroy(); this.nodes.delete(key); } }
  }

  spawnFloat(label: string, color: number, gx: number, gy: number): void {
    const t = new Text({ text: label, style: { fill: color, fontSize: 15, fontFamily: 'system-ui, sans-serif', fontWeight: '700', stroke: { color: 0x0a0a12, width: 3 } } });
    t.anchor.set(0.5);
    const s = gridToScreen(gx, gy);
    t.x = s.x; t.y = s.y - this.elevAtL(gx, gy) * MAX_ELEV_PX - 34; t.zIndex = 2_000_000;
    this.entities.addChild(t);
    this.floats.push({ text: t, life: 0 });
  }

  private refreshWindow(ptx: number, pty: number): void {
    this.drawTerrain(ptx, pty);
    const R = this.viewRadius();
    const want = new Set<string>();
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = ptx + dx, y = pty + dy;
      const kind = this.nodeKindAtL(x, y);
      if (!kind) continue;
      const key = this.nodeKey(x, y);
      if (this.depleted.has(key)) continue;
      want.add(key);
      if (!this.nodes.has(key)) {
        const sprite = this.makeNode(kind);
        const s = gridToScreen(x, y);
        sprite.x = s.x; sprite.y = s.y - this.elevAtL(x, y) * MAX_ELEV_PX; sprite.zIndex = depthOf(x, y);
        this.entities.addChild(sprite);
        this.nodes.set(key, { sprite, pulse: 0 });
      }
    }
    for (const [key, rn] of this.nodes) if (!want.has(key)) { this.entities.removeChild(rn.sprite); rn.sprite.destroy(); this.nodes.delete(key); }

    // Decoración de cueva (no interactiva)
    if (this.loc === 'cave') {
      const wantD = new Set<string>();
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = ptx + dx, y = pty + dy;
        const kind = caveDecorAt(x, y, this.caveSeed);
        if (!kind) continue;
        const key = 'd' + x + ',' + y;
        wantD.add(key);
        if (!this.decor.has(key)) {
          const sprite = this.makeDecor(kind);
          const s = gridToScreen(x, y);
          sprite.x = s.x; sprite.y = s.y; sprite.zIndex = depthOf(x, y) - 0.05;
          this.entities.addChild(sprite);
          this.decor.set(key, sprite);
        }
      }
      for (const [key, sp] of this.decor) if (!wantD.has(key)) { this.entities.removeChild(sp); sp.destroy(); this.decor.delete(key); }
    }
  }

  private makeDecor(kind: string): Container {
    const c = new Graphics();
    if (kind === 'stalagmite') {
      c.poly([-4, 0, 4, 0, 1.4, -18, -1.4, -18]).fill({ color: 0x4c4c58 });
      c.poly([-4, 0, 0, 0, -1, -16, -2.5, -12]).fill({ color: 0x5c5c68 });
    } else if (kind === 'crystal') {
      c.poly([-2, 0, 2, 0, 3, -6, 0, -14, -3, -6]).fill({ color: 0x5ad0e0 });
      c.poly([2, 0, 6, -1, 6, -8, 3, -9]).fill({ color: 0x3aa6c4 });
      c.poly([-2, 0, -6, -1, -5, -6, -2, -7]).fill({ color: 0x49b8cc });
    } else if (kind === 'mushroom') {
      c.rect(-1.4, -6, 2.8, 6).fill({ color: 0xe6ddc8 });
      c.ellipse(0, -6, 6, 4).fill({ color: 0xb5462f });
      c.circle(-2, -7, 1).fill({ color: 0xf0e6d0 });
      c.circle(2.5, -6, 0.9).fill({ color: 0xf0e6d0 });
    } else if (kind === 'bones') {
      c.rect(-6, -1, 12, 2).fill({ color: 0xd9d2c2 });
      c.circle(-6, 0, 2).fill({ color: 0xd9d2c2 });
      c.circle(6, 0, 2).fill({ color: 0xd9d2c2 });
      c.rect(-2, -5, 2, 10).fill({ color: 0xc7c0b0 });
    } else {
      c.ellipse(-3, 0, 4, 2.4).fill({ color: 0x55555f });
      c.ellipse(3, -1, 3, 2).fill({ color: 0x484852 });
      c.circle(0, -1, 2).fill({ color: 0x606069 });
    }
    return c;
  }

  private viewRadius(): number {
    return Math.ceil((this.app.screen.width / TILE_W + this.app.screen.height / TILE_H) / 2) + 6;
  }

  private drawTerrain(ptx: number, pty: number): void {
    const g = this.ground;
    g.clear();
    const R = this.viewRadius();
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const halfW = this.app.screen.width / 2 + TILE_W;
    const halfH = this.app.screen.height / 2 + TILE_H + MAX_ELEV_PX;
    const cave = this.loc === 'cave';
    for (let d = -2 * R; d <= 2 * R; d++) {
      for (let dx = Math.max(-R, d - R); dx <= Math.min(R, d + R); dx++) {
        const dy = d - dx;
        const relX = (dx - dy) * hw, relY = (dx + dy) * hh;
        if (relX < -halfW || relX > halfW || relY < -halfH || relY > halfH) continue;
        const x = ptx + dx, y = pty + dy;
        const info = cave ? caveTile(x, y, this.caveSeed) : tileAt(x, y, this.seed);
        let base: number;
        let ck: string = '';
        if (cave) {
          ck = (info as CaveTile).kind;
          base = ck === 'wall' ? CAVE_WALL : ck === 'lava' ? 0xd83a10 : ck === 'water' ? 0x2f6aa0 : CAVE_FLOOR;
        } else base = TERRAIN_COLORS[info.terrain] ?? 0x5a9e4f;
        const s = gridToScreen(x, y);
        const lift = info.elevation * MAX_ELEV_PX, topY = s.y - lift;
        if (lift > 3) {
          g.poly([s.x - hw, topY, s.x, topY + hh, s.x, s.y + hh, s.x - hw, s.y]).fill({ color: darker(base, 0.6) });
          g.poly([s.x, topY + hh, s.x + hw, topY, s.x + hw, s.y, s.x, s.y + hh]).fill({ color: darker(base, 0.45) });
        }
        g.poly([s.x, topY - hh, s.x + hw, topY, s.x, topY + hh, s.x - hw, topY]).fill({ color: base });
        if (cave && ck === 'lava') g.poly([s.x, topY - hh * 0.5, s.x + hw * 0.5, topY, s.x, topY + hh * 0.5, s.x - hw * 0.5, topY]).fill({ color: 0xff9b3a, alpha: 0.85 });
        if (cave && ck === 'water') g.poly([s.x, topY - hh * 0.55, s.x + hw * 0.55, topY, s.x, topY + hh * 0.55, s.x - hw * 0.55, topY]).fill({ color: 0x4f95c8, alpha: 0.7 });
        if (!cave && caveEntranceAt(x, y, this.seed)) this.drawEntrance(g, s.x, topY);
        else if (!cave && springAt(x, y, this.seed)) this.drawSpring(g, s.x, topY);
      }
    }
  }

  private drawEntrance(g: Graphics, cx: number, topY: number): void {
    const my = topY + 3;
    g.roundRect(cx - 9, my - 15, 18, 17, 7).fill({ color: 0x1b1512 });
    g.ellipse(cx, my - 4, 7, 8).fill({ color: 0x05050a });
    g.ellipse(cx, my, 10, 5).fill({ color: 0x07070c });
    g.ellipse(cx, my - 1, 13, 8).stroke({ width: 2, color: 0xe8c06a, alpha: 0.5 });
  }

  private drawSpring(g: Graphics, cx: number, topY: number): void {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    g.poly([cx, topY - hh, cx + hw, topY, cx, topY + hh, cx - hw, topY]).fill({ color: 0x2a8fb0 });
    g.ellipse(cx, topY, hw * 0.58, hh * 0.58).fill({ color: 0x58c8e0 });
    g.ellipse(cx, topY, hw * 0.3, hh * 0.3).fill({ color: 0x9fe8f4, alpha: 0.8 });
  }

  private makeExitMarker(): Container {
    const c = new Container();
    const g = new Graphics();
    g.rect(-7, -130, 14, 130).fill({ color: 0x7dffb0, alpha: 0.15 });
    g.rect(-3, -130, 6, 130).fill({ color: 0xe0ffee, alpha: 0.28 });
    g.ellipse(0, 0, 22, 11).fill({ color: 0x2b8a55, alpha: 0.4 });
    g.ellipse(0, 0, 22, 11).stroke({ width: 3, color: 0x8dffbe, alpha: 0.95 });
    g.poly([0, -34, 12, -18, 5, -18, 5, -4, -5, -4, -5, -18, -12, -18]).fill({ color: 0xe0ffee });
    c.addChild(g);
    const t = new Text({ text: 'SALIDA', style: { fill: 0xdfffe9, fontSize: 12, fontFamily: 'system-ui, sans-serif', fontWeight: '700', stroke: { color: 0x0b3b1f, width: 3 } } });
    t.anchor.set(0.5, 1); t.y = -40;
    c.addChild(t);
    return c;
  }

  private makeNode(kind: string): Container {
    const c = new Graphics();
    if (kind === 'tree') {
      c.ellipse(0, -2, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.rect(-3, -20, 6, 20).fill({ color: 0x6b4a2b });
      c.ellipse(0, -28, 16, 18).fill({ color: 0x2f7d3a });
      c.ellipse(-6, -34, 10, 11).fill({ color: 0x3a9247 });
    } else if (kind === 'coal') {
      c.ellipse(0, -1, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.ellipse(0, -7, 14, 10).fill({ color: 0x4a4a53 });
      c.ellipse(-4, -10, 8, 6).fill({ color: 0x5a5a63 });
      c.circle(2, -7, 2.6).fill({ color: 0x16161b });
      c.circle(-5, -6, 1.8).fill({ color: 0x16161b });
      c.circle(4, -11, 1.4).fill({ color: 0x101015 });
    } else if (kind === 'iron') {
      c.ellipse(0, -1, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.ellipse(0, -7, 14, 10).fill({ color: 0x83888f });
      c.ellipse(-4, -10, 8, 6).fill({ color: 0x9aa0ab });
      c.circle(2, -7, 2.4).fill({ color: 0xc79066 });
      c.circle(-5, -6, 1.7).fill({ color: 0xb37c4c });
      c.circle(5, -11, 1.5).fill({ color: 0xd8a86e });
    } else {
      c.ellipse(0, -1, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.ellipse(0, -6, 14, 10).fill({ color: 0x7a7f8a });
      c.ellipse(-4, -10, 8, 7).fill({ color: 0x9aa0ab });
    }
    return c;
  }

  private makeStructure(type: string): Container {
    const g = new Graphics();
    const col = ITEMS[type]?.color ?? 0x888888;
    if (type === 'crafting_table') {
      g.ellipse(0, -2, 15, 7).fill({ color: 0x000000, alpha: 0.2 });
      g.rect(-12, -15, 3, 15).fill({ color: 0x5a3a1e });
      g.rect(9, -15, 3, 15).fill({ color: 0x5a3a1e });
      g.roundRect(-14, -21, 28, 8, 2).fill({ color: 0x8a5a2b });
      g.roundRect(-14, -21, 28, 3, 2).fill({ color: 0xa06a34 });
      g.rect(-7, -25, 8, 4).fill({ color: 0x9aa0ab });
      g.rect(3, -24, 4, 3).fill({ color: 0xc0392b });
    } else if (type === 'furnace') {
      g.ellipse(0, 2, 15, 7).fill({ color: 0x000000, alpha: 0.2 });
      g.roundRect(-13, -26, 26, 28, 3).fill({ color: 0x5c5c66 });
      g.roundRect(-13, -26, 26, 6, 3).fill({ color: 0x70707a });
      g.roundRect(-8, -17, 16, 13, 2).fill({ color: 0x201d1c });
      g.roundRect(-6, -13, 12, 8, 2).fill({ color: 0xff7a2a });
      g.roundRect(-6, -9, 12, 4, 1).fill({ color: 0xffd05a });
    } else if (type === 'forge') {
      g.ellipse(0, 2, 16, 7).fill({ color: 0x000000, alpha: 0.2 });
      g.roundRect(-7, -7, 14, 9, 1).fill({ color: 0x33333c });
      g.roundRect(-3, -13, 6, 7, 1).fill({ color: 0x2a2a32 });
      g.roundRect(-14, -21, 28, 9, 2).fill({ color: 0x53535e });
      g.poly([13, -21, 21, -17.5, 13, -13.5]).fill({ color: 0x53535e });
      g.roundRect(-14, -21, 28, 3, 2).fill({ color: 0x686872 });
    } else if (type === 'chest') {
      g.ellipse(0, 2, 15, 6).fill({ color: 0x000000, alpha: 0.2 });
      g.roundRect(-13, -13, 26, 15, 2).fill({ color: 0x8a5a2b });
      g.roundRect(-13, -20, 26, 8, 3).fill({ color: 0x9a6a34 });
      g.roundRect(-13, -20, 26, 3, 3).fill({ color: 0xa97b48 });
      g.rect(-2.5, -20, 5, 22).fill({ color: 0xcaa24b });
      g.roundRect(-3, -11, 6, 5, 1).fill({ color: 0x6a4a24 });
    } else {
      const hw = (TILE_W / 2) * 0.72, hh = (TILE_H / 2) * 0.72, H = 20;
      g.ellipse(0, 2, hw, 6).fill({ color: 0x000000, alpha: 0.18 });
      g.poly([-hw, -H, 0, -H + hh, 0, hh, -hw, 0]).fill({ color: darker(col, 0.6) });
      g.poly([hw, -H, 0, -H + hh, 0, hh, hw, 0]).fill({ color: darker(col, 0.42) });
      g.poly([0, -H - hh, hw, -H, 0, -H + hh, -hw, -H]).fill({ color: col });
    }
    return g;
  }

  private makeBoat(): Container {
    const g = new Graphics();
    g.ellipse(0, 6, 22, 7).fill({ color: 0x000000, alpha: 0.18 });
    g.poly([-20, 0, 20, 0, 13, 9, -13, 9]).fill({ color: 0x8a5a2b });
    g.poly([-20, 0, 20, 0, 16, -3, -16, -3]).fill({ color: 0xa06a34 });
    return g;
  }

  private makeAnimal(type: AnimalType): Container {
    const g = new Graphics();
    if (type === 'bat') {
      g.ellipse(0, -1, 5, 2).fill({ color: 0x000000, alpha: 0.18 });
      const by = -17;
      g.poly([-12, by - 4, -3, by, -10, by + 4]).fill({ color: 0x352c3e });
      g.poly([12, by - 4, 3, by, 10, by + 4]).fill({ color: 0x352c3e });
      g.ellipse(-6, by, 4.5, 2.6).fill({ color: 0x2a2431 });
      g.ellipse(6, by, 4.5, 2.6).fill({ color: 0x2a2431 });
      g.circle(0, by, 3).fill({ color: 0x1f1a26 });
      g.poly([-2.4, by - 2.5, -1, by - 6, 0, by - 2.5]).fill({ color: 0x1f1a26 });
      g.poly([2.4, by - 2.5, 1, by - 6, 0, by - 2.5]).fill({ color: 0x1f1a26 });
      g.circle(-1, by - 0.5, 0.7).fill({ color: 0xe0655a });
      g.circle(1, by - 0.5, 0.7).fill({ color: 0xe0655a });
      return g;
    }
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
    if (!this.app || !this.player) { this.drawDarkness(); return; }
    const dt = dtMs / 1000;
    const k = Math.min(1, dt * 20);

    const ps = gridToScreen(this.prx, this.pry);
    const py = ps.y - this.elevAtL(this.prx, this.pry) * MAX_ELEV_PX;
    if (this.jumpVel !== 0 || this.jumpOff > 0) {
      this.jumpOff += this.jumpVel * dt;
      this.jumpVel -= 900 * dt;
      if (this.jumpOff <= 0) { this.jumpOff = 0; this.jumpVel = 0; }
    }
    this.player.x = ps.x; this.player.y = py - this.jumpOff; this.player.zIndex = depthOf(this.prx, this.pry) + 0.3;
    this.world.x = this.app.screen.width / 2 - ps.x;
    this.world.y = this.app.screen.height / 2 - py;

    if (this.exitMarker) {
      if (this.loc === 'cave') {
        const e0 = gridToScreen(0, 0);
        this.exitMarker.visible = true;
        this.exitMarker.x = this.world.x + e0.x;
        this.exitMarker.y = this.world.y + e0.y - this.elevAtL(0, 0) * MAX_ELEV_PX;
      } else this.exitMarker.visible = false;
    }

    // animación
    const spd = Math.hypot(this.prx - this.lastPrx, this.pry - this.lastPry) / dt;
    this.lastPrx = this.prx; this.lastPry = this.pry;
    const moving = spd > 0.35;
    let action: AvatarAction = 'idle';
    if (this.active && this.target) action = 'swing';
    else if (moving && this.onWater) action = 'swim';
    else if (moving && spd > PLAYER_SPEED * 1.2) action = 'run';
    else if (moving) action = 'walk';
    this.animT = (this.animT + dt * ANIM_RATE[action]) % 1;
    const fr = this.frames[action];
    if (fr && fr.length) this.player.texture = fr[Math.floor(this.animT * fr.length) % fr.length];

    // barca
    if (this.boat) {
      this.boat.visible = this.onWater && this.hasBoat;
      if (this.boat.visible) { this.boat.x = ps.x; this.boat.y = py + 2; this.boat.zIndex = depthOf(this.prx, this.pry) + 0.28; }
    }

    const ptx = Math.round(this.prx), pty = Math.round(this.pry), tk = ptx + ',' + pty;
    if (tk !== this.ptile) { this.ptile = tk; this.refreshWindow(ptx, pty); }

    for (const ra of this.animals.values()) {
      ra.rx += (ra.tx - ra.rx) * k; ra.ry += (ra.ty - ra.ry) * k;
      const s = gridToScreen(ra.rx, ra.ry);
      ra.sprite.x = s.x; ra.sprite.y = s.y - this.elevAtL(ra.rx, ra.ry) * MAX_ELEV_PX; ra.sprite.zIndex = depthOf(ra.rx, ra.ry) + 0.1;
    }
    for (const rn of this.nodes.values()) if (rn.pulse > 0) { rn.pulse = Math.max(0, rn.pulse - dt * 6); rn.sprite.scale.set(1 + 0.16 * rn.pulse); }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.life += dt; f.text.y -= dt * 26; f.text.alpha = Math.max(0, 1 - f.life);
      if (f.life >= 1) { this.entities.removeChild(f.text); f.text.destroy(); this.floats.splice(i, 1); }
    }

    this.computeTarget();
    this.drawDarkness();
  }

  private pickTile(wx: number, wy: number): { x: number; y: number } {
    const g0 = screenToGrid(wx, wy);
    const bx = Math.round(g0.x), by = Math.round(g0.y);
    const hw = TILE_W / 2, hh = TILE_H / 2, K = Math.ceil(MAX_ELEV_PX / hh) + 1;
    let best: { x: number; y: number } | null = null, bestDepth = -Infinity;
    for (let ox = -1; ox <= K; ox++) for (let oy = -1; oy <= K; oy++) {
      const tx = bx + ox, ty = by + oy;
      const lift = this.elevAtL(tx, ty) * MAX_ELEV_PX;
      const s = gridToScreen(tx, ty), cyv = s.y - lift;
      if (Math.abs(wx - s.x) / hw + Math.abs(wy - cyv) / hh <= 1 && tx + ty > bestDepth) { bestDepth = tx + ty; best = { x: tx, y: ty }; }
    }
    return best ?? { x: bx, y: by };
  }

  private computeTarget(): void {
    const placing = this.selected?.kind === 'place' && this.loc === 'surface';
    this.ghost.clear();
    let next: InteractTarget = null;
    this.placeTile = null;
    this.structTarget = null;

    if (this.mouseX >= 0) {
      const wx = this.mouseX - this.world.x, wy = this.mouseY - this.world.y;
      if (placing) {
        const t = this.pickTile(wx, wy);
        this.placeTile = t;
        const valid = !isWater(tileAt(t.x, t.y, this.seed).terrain) && !playerBlocked(tileAt(t.x, t.y, this.seed).terrain) && Math.hypot(t.x - this.prx, t.y - this.pry) <= 4.5;
        const s = gridToScreen(t.x, t.y), yy = s.y - tileAt(t.x, t.y, this.seed).elevation * MAX_ELEV_PX;
        const hw = TILE_W / 2, hh = TILE_H / 2;
        this.ghost.poly([s.x, yy - hh, s.x + hw, yy, s.x, yy + hh, s.x - hw, yy]).fill({ color: valid ? 0x8bd17c : 0xe06666, alpha: 0.35 }).stroke({ width: 2, color: valid ? 0x8bd17c : 0xe06666, alpha: 0.9 });
        this.app.canvas.style.cursor = 'cell';
      } else {
        const pick = this.pickTile(wx, wy);
        const st = this.structTiles.get(pick.x + ',' + pick.y);
        if (st && (st.type === 'crafting_table' || st.type === 'furnace' || st.type === 'forge' || st.type === 'chest') && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE) {
          this.structTarget = { id: st.id, type: st.type, x: pick.x, y: pick.y };
          this.app.canvas.style.cursor = 'pointer';
        } else {
          let bestD = 24;
          for (const [id, ra] of this.animals) {
            const d = Math.hypot(ra.sprite.x - wx, ra.sprite.y - 8 - wy);
            if (d < bestD && Math.hypot(ra.rx - this.prx, ra.ry - this.pry) <= INTERACT_RANGE) { bestD = d; next = { kind: 'animal', id }; }
          }
          if (!next) {
            const key = this.nodeKey(pick.x, pick.y);
            if (!this.depleted.has(key) && this.nodeKindAtL(pick.x, pick.y) && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE) next = { kind: 'node', x: pick.x, y: pick.y };
          }
          this.app.canvas.style.cursor = next ? 'pointer' : 'default';
        }
      }
    }
    this.target = next;

    this.highlight.clear();
    if (next) {
      let hx = 0, hy = 0, hl = 0;
      if (next.kind === 'node') { hx = next.x; hy = next.y; hl = this.elevAtL(next.x, next.y) * MAX_ELEV_PX; }
      else { const ra = this.animals.get(next.id); if (ra) { hx = ra.rx; hy = ra.ry; hl = this.elevAtL(ra.rx, ra.ry) * MAX_ELEV_PX; } }
      const s = gridToScreen(hx, hy), hw = TILE_W / 2, hh = TILE_H / 2, yy = s.y - hl;
      this.highlight.poly([s.x, yy - hh, s.x + hw, yy, s.x, yy + hh, s.x - hw, yy]).stroke({ width: 2, color: next.kind === 'animal' ? 0xff6b6b : 0xf5c96b, alpha: 0.95 });
    }
    if (this.structTarget) {
      const st = this.structTarget;
      const sp = gridToScreen(st.x, st.y), hw = TILE_W / 2, hh = TILE_H / 2, yy = sp.y - this.elevAtL(st.x, st.y) * MAX_ELEV_PX;
      this.highlight.poly([sp.x, yy - hh, sp.x + hw, yy, sp.x, yy + hh, sp.x - hw, yy]).stroke({ width: 2, color: 0x8bd1ff, alpha: 0.95 });
    }

    const key = placing ? 'p' : this.structTarget ? 's' + this.structTarget.x + ',' + this.structTarget.y : next ? (next.kind === 'node' ? 'n' + next.x + ',' + next.y : 'a' + next.id) : '-';
    if (key !== this.lastSentKey) {
      this.lastSentKey = key;
      this.app.canvas.setAttribute('data-target', placing ? 'place' : this.structTarget ? (this.structTarget.type === 'chest' ? 'chest' : 'station') : next ? next.kind : 'none');
      if (!placing) this.emitInteract();
    }
  }

  private emitInteract(): void { this.onInteract(this.active, this.target); }

  private drawDarkness(): void {
    this.darkness.clear();
    if (this.loc === 'cave') {
      if (this.caveDark) { this.caveDark.visible = true; this.ensureVignette(); }
      return;
    }
    if (this.caveDark) this.caveDark.visible = false;
    const d = this.nightAlpha(this.tod);
    if (d > 0.001) this.darkness.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0x0a1230, alpha: d });
  }
  private nightAlpha(tod: number): number {
    const dist = Math.abs(tod - 0.5) * 2, x = Math.min(1, Math.max(0, (dist - 0.35) / 0.4));
    return NIGHT_MAX_DARK * (x * x * (3 - 2 * x));
  }

  // Vignette radial (linterna) que oscurece la cueva salvo alrededor del jugador.
  private ensureVignette(): void {
    if (!this.caveDark) return;
    const w = this.app.screen.width, h = this.app.screen.height;
    if (w === this.vigW && h === this.vigH && this.caveDark.texture !== Texture.EMPTY) return;
    this.vigW = w; this.vigH = h;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, w); cv.height = Math.max(1, h);
    const ctx = cv.getContext('2d')!;
    const cx = w / 2, cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.12, cx, cy, Math.hypot(w, h) * 0.6);
    grad.addColorStop(0, 'rgba(8,8,16,0)');
    grad.addColorStop(0.5, 'rgba(7,7,14,0.5)');
    grad.addColorStop(1, 'rgba(3,4,9,0.96)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const old = this.caveDark.texture;
    this.caveDark.texture = Texture.from(cv);
    if (old && old !== Texture.EMPTY) old.destroy(true);
    this.caveDark.x = 0; this.caveDark.y = 0;
  }

  // Aviso "Pulsa E" cuando el jugador está sobre una entrada / salida.
  setEntranceHint(on: boolean): void {
    let el = document.getElementById('cave-hint');
    if (!on) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = document.createElement('div'); el.id = 'cave-hint'; document.body.appendChild(el); }
    const k = keyLabel(getCode('cave'));
    el.textContent = this.loc === 'cave' ? `Pulsa ${k} para salir de la cueva` : `Pulsa ${k} para entrar a la cueva`;
    el.style.display = 'block';
  }
}
