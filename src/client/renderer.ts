// Render con PixiJS v8: mundo con relieve, nodos, animales, jugador animado,
// estructuras colocables, barca, día/noche y selección/colocación con el ratón.

import { Application, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { TILE_W, TILE_H, MAX_ELEV_PX, BLOCK_PX, INTERACT_RANGE, NIGHT_MAX_DARK, PLAYER_SPEED } from '../shared/constants';
import { gridToScreen, screenToGrid, depthOf } from '../shared/iso';
import { tileAt, nodeAt, isWater, TERRAIN, caveTile, caveNodeAt, caveEntranceAt, caveDecorAt, surfaceDecorAt, springAt, villageCenterAt, villageLayoutAt, VILLAGE_SCAN, BEDROCK_LEVEL, type CaveTile } from '../shared/worldgen';
import { villagerId } from '../shared/trades';
import { avatarCanvas, type AvatarAction, type Customization, type HeldTool } from './avatar';
import { ITEMS } from '../shared/items';
import type { InteractTarget, Snapshot, Structure, Location, TerrainEdit, FluidEdit } from '../shared/protocol';
import type { AnimalType } from '../shared/items';
import type { HotbarSel } from './hotbar';

const TERRAIN_COLORS: Record<number, number> = {
  [TERRAIN.DEEP_WATER]: 0x24507a, [TERRAIN.WATER]: 0x3a79a6, [TERRAIN.SAND]: 0xd9c48a,
  [TERRAIN.GRASS]: 0x5a9e4f, [TERRAIN.FOREST]: 0x468a41, [TERRAIN.ROCK]: 0x8f8b7c,
  [TERRAIN.MOUNTAIN]: 0x7c746b, [TERRAIN.SNOW]: 0xe9edf2,
  [TERRAIN.DESERT]: 0xe3cf8a, [TERRAIN.JUNGLE]: 0x2f7d3a, [TERRAIN.SWAMP]: 0x5e6f42,
  [TERRAIN.SWAMP_WATER]: 0x3c4a34,
};
// Colores de materiales para bloques editados (excavados/colocados).
const MATERIAL_COLORS: Record<string, number> = {
  dirt: 0x7a5433, sand: 0xd9c48a, stone: 0x8f8b7c, snow: 0xe9edf2, grass: 0x5a9e4f,
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

  // Cámara: zoom (rueda), suavizado de desnivel y paneo (clic rueda).
  zoom = 1; camLift = 0; panX = 0; panY = 0;
  panning = false; panCX = 0; panCY = 0;

  // Aldeas (render + clic sobre aldeanos/camas).
  readonly villages = new Map<string, Container[]>();
  readonly villagerTiles = new Map<string, { id: number; x: number; y: number }>();
  readonly villageBeds = new Set<string>();
  talkTarget: { id: number; x: number; y: number } | null = null;
  sleepTarget: { x: number; y: number } | null = null;

  seed = 0;
  player: Sprite | null = null;
  boat: Container | null = null;
  frames: Record<string, Texture[]> = {};
  custom: Customization | null = null;
  held: HeldTool | null = null;
  heldKey = '';
  animT = 0;
  prx = 0; pry = 0; lastPrx = 0; lastPry = 0;
  snapSpeed = 0; spdEMA = 0; curAction: AvatarAction = 'idle'; actionHold = 0;
  ptile = ''; tod = 0.35; onWater = false; hasBoat = false; riding = false;

  loc: Location = 'surface';
  caveSeed = 0;
  layerEverSet = false;

  // Ediciones de terreno y fluidos dinámicos (sincronizados desde el sim).
  readonly edits = new Map<string, { lvl: number; top: string }>();
  readonly fluids = new Map<string, number>();
  terrainDirty = false;
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
  onBoardBoat: (id: number) => void = () => {};
  onEat: (item: string) => void = () => {};
  onSleep: () => void = () => {};
  onTalk: (id: number) => void = () => {};

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
      if (this.panning) { // paneo con el botón de la rueda
        this.panX += e.clientX - this.panCX;
        this.panY += e.clientY - this.panCY;
        this.panCX = e.clientX; this.panCY = e.clientY;
      }
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    // Zoom con la rueda del ratón (0.6x .. 2.2x).
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1 / 1.12 : 1.12;
      this.zoom = Math.max(0.6, Math.min(2.2, this.zoom * f));
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 1) { // clic rueda: iniciar paneo
        e.preventDefault();
        this.panning = true; this.panCX = e.clientX; this.panCY = e.clientY;
        this.app.canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.button === 2) { // clic derecho: comer si hay comida seleccionada
        const it = this.selected?.item;
        if (it && ITEMS[it]?.food) this.onEat(it);
        return;
      }
      const placing = this.selected?.kind === 'place' || this.selected?.kind === 'boat';
      if (placing && this.selected?.item && this.placeTile) {
        this.onPlace(this.placeTile.x, this.placeTile.y, this.selected.item);
        return;
      }
      if (this.talkTarget) { this.onTalk(this.talkTarget.id); return; }
      if (this.sleepTarget) { this.onSleep(); return; }
      if (this.structTarget) {
        if (this.structTarget.type === 'chest') this.onOpenChest(this.structTarget.id);
        else if (this.structTarget.type === 'boat') this.onBoardBoat(this.structTarget.id);
        else if (this.structTarget.type === 'bed') this.onSleep();
        else this.onOpenStation(this.structTarget.type);
        return;
      }
      this.active = true;
      this.emitInteract();
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 1 && this.panning) { this.panning = false; this.app.canvas.style.cursor = 'default'; return; }
      this.active = false; this.emitInteract();
    });
    this.app.ticker.add((t) => this.update(t.deltaMS));
    // eslint-disable-next-line no-console
    console.log('[client] pixi listo');
  }

  start(seed: number, custom: Customization, px = 0, py = 0): void {
    this.seed = seed;
    this.custom = custom;
    this.held = null; this.heldKey = '';
    this.loc = 'surface';
    this.layerEverSet = false;
    this.edits.clear(); this.fluids.clear(); this.terrainDirty = false;
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
    if (this.layerEverSet && loc === this.loc && caveSeed === this.caveSeed) return;
    const first = !this.layerEverSet;
    this.layerEverSet = true;
    this.loc = loc;
    this.caveSeed = caveSeed;
    for (const [key, rn] of this.nodes) { this.entities.removeChild(rn.sprite); rn.sprite.destroy(); this.nodes.delete(key); }
    for (const [key, sp] of this.decor) { this.entities.removeChild(sp); sp.destroy(); this.decor.delete(key); }
    for (const sp of this.structs.values()) sp.visible = loc === 'surface';
    this.ptile = '';
    if (!first) this.showTransition();
  }

  // Fundido a negro tipo "cargando" al entrar/salir de la cueva.
  private showTransition(): void {
    let el = document.getElementById('cave-fade');
    if (!el) { el = document.createElement('div'); el.id = 'cave-fade'; document.body.appendChild(el); }
    const e = el;
    e.style.transition = 'none';
    e.style.opacity = '1';
    e.style.display = 'block';
    void e.offsetWidth; // fuerza reflow
    requestAnimationFrame(() => { e.style.transition = 'opacity .55s ease'; e.style.opacity = '0'; });
    window.setTimeout(() => { e.style.display = 'none'; }, 750);
  }

  jump(): void {
    if (this.jumpOff <= 0.01 && this.jumpVel === 0) this.jumpVel = 235;
  }

  // --- Consultas de mundo según la capa activa (superficie o cueva) ---
  // Devuelve un valor normalizado tal que (elevAtL * MAX_ELEV_PX) = altura en px.
  // Superficie: relieve por bloques (level * BLOCK_PX). Cueva: elevación 0..1.
  private elevAtL(x: number, y: number): number {
    const rx = Math.round(x), ry = Math.round(y);
    if (this.loc === 'cave') return caveTile(rx, ry, this.caveSeed).elevation;
    if (this.effWaterAt(rx, ry)) return 0; // superficie del agua (nivel del mar)
    return (this.effLevelAt(rx, ry) * BLOCK_PX) / MAX_ELEV_PX;
  }
  // Nivel/agua efectivos con ediciones de terreno (superficie).
  private effLevelAt(x: number, y: number): number {
    const e = this.edits.get(x + ',' + y);
    return e ? e.lvl : tileAt(x, y, this.seed).level;
  }
  private effWaterAt(x: number, y: number): boolean {
    const k = x + ',' + y;
    if (this.fluids.has(k)) return true;
    if (this.edits.has(k)) return false;
    return tileAt(x, y, this.seed).water;
  }
  // Aplica un lote de ediciones/fluidos recibido del sim.
  applyTerrain(edits: TerrainEdit[], fluids: FluidEdit[]): void {
    for (const e of edits) this.edits.set(e.x + ',' + e.y, { lvl: e.lvl, top: e.top });
    for (const f of fluids) { const k = f.x + ',' + f.y; if (f.add) this.fluids.set(k, 1); else this.fluids.delete(k); }
    this.terrainDirty = true;
  }
  private nodeKindAtL(x: number, y: number): string | null {
    return this.loc === 'cave' ? caveNodeAt(x, y, this.caveSeed) : nodeAt(x, y, this.seed);
  }
  private nodeKey(x: number, y: number): string {
    return this.loc === 'cave' ? 'c' + this.caveSeed + ':' + x + ',' + y : x + ',' + y;
  }

  applySnapshot(snap: Snapshot): void {
    this.snapSpeed = Math.hypot(snap.px - this.prx, snap.py - this.pry) * 60; // tiles/s (1 tick = 1/60 s)
    this.prx = snap.px; this.pry = snap.py; this.tod = snap.time.tod; this.onWater = snap.onWater; this.riding = snap.riding;
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
        sprite.y = p.y - this.elevAtL(s.x, s.y) * MAX_ELEV_PX;
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
        const sprite = kind === 'tree' && this.loc === 'surface' ? this.makeTree(tileAt(x, y, this.seed).terrain) : this.makeNode(kind);
        const s = gridToScreen(x, y);
        sprite.x = s.x; sprite.y = s.y - this.elevAtL(x, y) * MAX_ELEV_PX; sprite.zIndex = depthOf(x, y);
        this.entities.addChild(sprite);
        this.nodes.set(key, { sprite, pulse: 0 });
      }
    }
    for (const [key, rn] of this.nodes) if (!want.has(key)) { this.entities.removeChild(rn.sprite); rn.sprite.destroy(); this.nodes.delete(key); }

    // Decoración no interactiva (cueva o bioma de superficie)
    const wantD = new Set<string>();
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = ptx + dx, y = pty + dy;
      const kind = this.loc === 'cave' ? caveDecorAt(x, y, this.caveSeed) : surfaceDecorAt(x, y, this.seed);
      if (!kind) continue;
      const key = 'd' + x + ',' + y;
      wantD.add(key);
      if (!this.decor.has(key)) {
        const sprite = this.makeDecor(kind);
        const s = gridToScreen(x, y);
        sprite.x = s.x; sprite.y = s.y - this.elevAtL(x, y) * MAX_ELEV_PX; sprite.zIndex = depthOf(x, y) + 0.02;
        this.entities.addChild(sprite);
        this.decor.set(key, sprite);
      }
    }
    for (const [key, sp] of this.decor) if (!wantD.has(key)) { this.entities.removeChild(sp); sp.destroy(); this.decor.delete(key); }

    // Aldeas (sólo superficie): casas + camas + pozo + aldeanos.
    this.villagerTiles.clear();
    this.villageBeds.clear();
    if (this.loc === 'surface') {
      const wantV = new Set<string>();
      const M = VILLAGE_SCAN;
      for (let dy = -R - M; dy <= R + M; dy++) for (let dx = -R - M; dx <= R + M; dx++) {
        const cx = ptx + dx, cy = pty + dy;
        if (!villageCenterAt(cx, cy, this.seed)) continue;
        const vkey = 'v' + cx + ',' + cy;
        wantV.add(vkey);
        const layout = villageLayoutAt(cx, cy, this.seed);
        for (const h of layout.houses) this.villageBeds.add(h.bed.x + ',' + h.bed.y);
        for (const v of layout.villagers) this.villagerTiles.set(v.x + ',' + v.y, { id: villagerId(v.x, v.y, this.seed), x: v.x, y: v.y });
        if (!this.villages.has(vkey)) {
          const parts: Container[] = [];
          const well = this.makeWell(); this.placeAt(well, cx, cy, 0.05); parts.push(well);
          for (const h of layout.houses) {
            const house = this.makeVillageHouse((this.seed ^ (h.x * 31 + h.y)) | 0); this.placeAt(house, h.x, h.y, 0.12); parts.push(house);
            const bed = this.makeStructure('bed'); this.placeAt(bed, h.bed.x, h.bed.y, 0.04); parts.push(bed);
          }
          for (const v of layout.villagers) { const vs = this.makeVillager(villagerId(v.x, v.y, this.seed)); this.placeAt(vs, v.x, v.y, 0.1); parts.push(vs); }
          for (const p of parts) this.entities.addChild(p);
          this.villages.set(vkey, parts);
        }
      }
      for (const [vkey, parts] of this.villages) if (!wantV.has(vkey)) { for (const p of parts) { this.entities.removeChild(p); p.destroy(); } this.villages.delete(vkey); }
    } else if (this.villages.size) {
      for (const [, parts] of this.villages) for (const p of parts) { this.entities.removeChild(p); p.destroy(); }
      this.villages.clear();
    }
  }

  private placeAt(sprite: Container, x: number, y: number, depthBias: number): void {
    const s = gridToScreen(x, y);
    sprite.x = s.x;
    sprite.y = s.y - this.elevAtL(x, y) * MAX_ELEV_PX;
    sprite.zIndex = depthOf(x, y) + depthBias;
  }

  // Reajusta la altura de nodos/decoración de superficie tras editar el terreno.
  private realignSurface(): void {
    if (this.loc !== 'surface') return;
    for (const [key, rn] of this.nodes) {
      const c = key.split(','); const x = +c[0], y = +c[1];
      const s = gridToScreen(x, y); rn.sprite.y = s.y - this.elevAtL(x, y) * MAX_ELEV_PX;
    }
    for (const [key, sp] of this.decor) {
      const c = key.slice(1).split(','); const x = +c[0], y = +c[1];
      const s = gridToScreen(x, y); sp.y = s.y - this.elevAtL(x, y) * MAX_ELEV_PX;
    }
  }

  // ¿Se puede excavar esta tile de superficie?
  private canDig(x: number, y: number): boolean {
    if (this.loc !== 'surface') return false;
    if (this.effWaterAt(x, y)) return false;
    if (this.structTiles.has(x + ',' + y)) return false;
    if (this.effLevelAt(x, y) <= BEDROCK_LEVEL) return false;
    if (caveEntranceAt(x, y, this.seed) && !this.edits.has(x + ',' + y)) return false;
    if (x === Math.round(this.prx) && y === Math.round(this.pry)) return false;
    return true;
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
    } else if (kind === 'cactus') {
      c.ellipse(0, -1, 8, 3).fill({ color: 0x000000, alpha: 0.18 });
      c.roundRect(-3, -26, 6, 26, 3).fill({ color: 0x3f8a3a });
      c.roundRect(-9, -16, 4, 8, 2).fill({ color: 0x3f8a3a });
      c.roundRect(-9, -16, 8, 4, 2).fill({ color: 0x3f8a3a });
      c.roundRect(6, -20, 4, 9, 2).fill({ color: 0x3f8a3a });
      c.roundRect(2, -20, 8, 4, 2).fill({ color: 0x3f8a3a });
      c.rect(-1, -24, 2, 22).fill({ color: 0x347531 });
    } else if (kind === 'reed') {
      for (const [ox, h] of [[-4, 12], [0, 16], [4, 13], [7, 10]] as const) c.rect(ox, -h, 1.6, h).fill({ color: 0x6f8a3a });
      for (const [ox, h] of [[-4, 12], [0, 16], [4, 13]] as const) c.ellipse(ox + 0.8, -h, 1.5, 3).fill({ color: 0x8a6a2a });
    } else if (kind === 'deadbush') {
      for (const dx of [-6, -2, 3, 7]) { c.moveTo(0, 0); c.lineTo(dx, -9); }
      c.moveTo(0, 0); c.lineTo(0, -11);
      c.stroke({ width: 1.5, color: 0x8a6a3a });
    } else if (kind === 'fern') {
      for (const a of [-0.9, -0.4, 0, 0.4, 0.9]) { c.moveTo(0, 0); c.lineTo(Math.sin(a) * 9, -12 - Math.cos(a) * 3); }
      c.stroke({ width: 1.8, color: 0x2f7d3a });
    } else if (kind === 'lily') {
      // nenúfar plano sobre el agua del pantano
      c.ellipse(0, 0, 9, 5).fill({ color: 0x3f7a3a });
      c.ellipse(-2, -1, 6, 3.2).fill({ color: 0x4f9a45 });
      c.poly([0, 0, 8, -2.5, 8, 2.5]).fill({ color: 0x2c4a28 }); // muesca
      c.circle(2, -1.5, 2.2).fill({ color: 0xf0e2ee });
      c.circle(2, -1.5, 1.1).fill({ color: 0xe58ab8 });
    } else if (kind === 'vine') {
      // planta trepadora / liana de jungla en el suelo
      c.moveTo(0, 0); c.lineTo(-1, -16); c.stroke({ width: 2, color: 0x3f7a34 });
      for (const [ly, side] of [[-4, 1], [-8, -1], [-12, 1]] as const) {
        c.ellipse(side * 4, ly, 3.4, 2).fill({ color: 0x4f9a3f });
      }
      c.circle(-1, -16, 1.6).fill({ color: 0x66b84f });
    } else {
      c.ellipse(-3, 0, 4, 2.4).fill({ color: 0x55555f });
      c.ellipse(3, -1, 3, 2).fill({ color: 0x484852 });
      c.circle(0, -1, 2).fill({ color: 0x606069 });
    }
    return c;
  }

  private viewRadius(): number {
    return Math.ceil((this.app.screen.width / TILE_W + this.app.screen.height / TILE_H) / (2 * this.zoom)) + 6;
  }

  private drawTerrain(ptx: number, pty: number): void {
    const g = this.ground;
    g.clear();
    const R = this.viewRadius();
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const halfW = this.app.screen.width / (2 * this.zoom) + TILE_W;
    const halfH = this.app.screen.height / (2 * this.zoom) + TILE_H + (this.loc === 'cave' ? MAX_ELEV_PX : 270);
    const cave = this.loc === 'cave';
    for (let d = -2 * R; d <= 2 * R; d++) {
      for (let dx = Math.max(-R, d - R); dx <= Math.min(R, d + R); dx++) {
        const dy = d - dx;
        const relX = (dx - dy) * hw, relY = (dx + dy) * hh;
        if (relX < -halfW || relX > halfW || relY < -halfH || relY > halfH) continue;
        const x = ptx + dx, y = pty + dy;
        const s = gridToScreen(x, y);
        if (cave) {
          const info = caveTile(x, y, this.caveSeed);
          const ck = info.kind;
          const base = ck === 'wall' ? CAVE_WALL : ck === 'lava' ? 0xd83a10 : ck === 'water' ? 0x2f6aa0 : CAVE_FLOOR;
          const lift = info.elevation * MAX_ELEV_PX, topY = s.y - lift;
          if (lift > 3) {
            g.poly([s.x - hw, topY, s.x, topY + hh, s.x, s.y + hh, s.x - hw, s.y]).fill({ color: darker(base, 0.6) });
            g.poly([s.x, topY + hh, s.x + hw, topY, s.x + hw, s.y, s.x, s.y + hh]).fill({ color: darker(base, 0.45) });
          }
          g.poly([s.x, topY - hh, s.x + hw, topY, s.x, topY + hh, s.x - hw, topY]).fill({ color: base });
          if (ck === 'lava') g.poly([s.x, topY - hh * 0.5, s.x + hw * 0.5, topY, s.x, topY + hh * 0.5, s.x - hw * 0.5, topY]).fill({ color: 0xff9b3a, alpha: 0.85 });
          if (ck === 'water') g.poly([s.x, topY - hh * 0.55, s.x + hw * 0.55, topY, s.x, topY + hh * 0.55, s.x - hw * 0.55, topY]).fill({ color: 0x4f95c8, alpha: 0.7 });
        } else {
          const key = x + ',' + y;
          const edit = this.edits.get(key);
          const isFluid = this.fluids.has(key);
          const info = tileAt(x, y, this.seed);
          const water = isFluid || (!edit && info.water);
          if (water) {
            const swamp = !isFluid && info.terrain === TERRAIN.SWAMP_WATER;
            const col = isFluid ? 0x3a79a6 : (TERRAIN_COLORS[info.terrain] ?? 0x3a79a6);
            g.poly([s.x, s.y - hh, s.x + hw, s.y, s.x, s.y + hh, s.x - hw, s.y]).fill({ color: col });
            g.poly([s.x, s.y - hh * 0.5, s.x + hw * 0.5, s.y, s.x, s.y + hh * 0.5, s.x - hw * 0.5, s.y]).fill({ color: swamp ? 0x556b3a : 0x4f93c4, alpha: swamp ? 0.4 : 0.5 });
          } else {
            const lvl = edit ? edit.lvl : info.level;
            const base = edit ? (MATERIAL_COLORS[edit.top] ?? TERRAIN_COLORS[info.terrain] ?? 0x5a9e4f) : (TERRAIN_COLORS[info.terrain] ?? 0x5a9e4f);
            const topY = s.y - lvl * BLOCK_PX;
            const rLvl = this.effWaterAt(x + 1, y) ? 0 : this.effLevelAt(x + 1, y);
            const lLvl = this.effWaterAt(x, y + 1) ? 0 : this.effLevelAt(x, y + 1);
            const rDrop = lvl - rLvl, lDrop = lvl - lLvl;
            if (rDrop > 0) {
              const fh = rDrop * BLOCK_PX;
              g.poly([s.x + hw, topY, s.x, topY + hh, s.x, topY + hh + fh, s.x + hw, topY + fh]).fill({ color: darker(base, 0.52) });
              const n = Math.min(rDrop, 8);
              for (let i = 1; i < n; i++) { const yy = topY + i * BLOCK_PX; g.moveTo(s.x + hw, yy); g.lineTo(s.x, yy + hh); g.stroke({ width: 1, color: 0x000000, alpha: 0.13 }); }
            }
            if (lDrop > 0) {
              const fh = lDrop * BLOCK_PX;
              g.poly([s.x - hw, topY, s.x, topY + hh, s.x, topY + hh + fh, s.x - hw, topY + fh]).fill({ color: darker(base, 0.4) });
              const n = Math.min(lDrop, 8);
              for (let i = 1; i < n; i++) { const yy = topY + i * BLOCK_PX; g.moveTo(s.x - hw, yy); g.lineTo(s.x, yy + hh); g.stroke({ width: 1, color: 0x000000, alpha: 0.13 }); }
            }
            g.poly([s.x, topY - hh, s.x + hw, topY, s.x, topY + hh, s.x - hw, topY]).fill({ color: base });
            if (!edit && caveEntranceAt(x, y, this.seed)) this.drawEntrance(g, s.x, topY);
            else if (!edit && springAt(x, y, this.seed)) this.drawSpring(g, s.x, topY);
          }
        }
      }
    }
  }

  private drawEntrance(g: Graphics, cx: number, topY: number): void {
    const my = topY - 1;
    // montículo rocoso con rocas alrededor
    g.ellipse(cx, my + 3, 18, 9).fill({ color: 0x574f47 });
    g.ellipse(cx - 3, my - 8, 14, 12).fill({ color: 0x746c62 });
    g.ellipse(cx + 8, my - 3, 8, 8).fill({ color: 0x655d54 });
    g.ellipse(cx - 10, my - 1, 6, 6).fill({ color: 0x6b6259 });
    g.ellipse(cx + 2, my - 13, 7, 6).fill({ color: 0x7d746a });
    // boca de la cueva: arco oscuro (semielipse + base)
    g.ellipse(cx, my - 2, 9, 8).fill({ color: 0x17120f });
    g.rect(cx - 9, my - 2, 18, 6).fill({ color: 0x17120f });
    g.ellipse(cx, my - 2, 6.5, 6).fill({ color: 0x060409 });
    g.rect(cx - 6.5, my - 2, 13, 6).fill({ color: 0x060409 });
    // brillo tenue del borde
    g.ellipse(cx, my - 2, 9, 8).stroke({ width: 1.4, color: 0xa89a82, alpha: 0.35 });
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

  // Árbol con variante por bioma: jungla (grande, con lianas), pantano (sauce
  // oscuro y caído) o normal (hierba/bosque).
  private makeTree(terrain: number): Container {
    const c = new Graphics();
    if (terrain === TERRAIN.JUNGLE) {
      c.ellipse(0, -2, 15, 7).fill({ color: 0x000000, alpha: 0.24 });
      c.rect(-4, -34, 8, 34).fill({ color: 0x5f4327 });
      c.rect(-4, -34, 3, 34).fill({ color: 0x6f512f });
      c.ellipse(0, -46, 22, 20).fill({ color: 0x2a7d34 });
      c.ellipse(-11, -54, 14, 14).fill({ color: 0x34992f });
      c.ellipse(11, -50, 13, 13).fill({ color: 0x2f8a3a });
      c.ellipse(2, -60, 12, 11).fill({ color: 0x3aa33f });
      // lianas colgantes
      for (const [lx, lh] of [[-14, 20], [-6, 26], [8, 22], [15, 16]] as const) {
        c.rect(lx, -46, 1.6, lh).fill({ color: 0x3f7a34 });
        c.circle(lx + 0.8, -46 + lh, 1.6).fill({ color: 0x4f9a3f });
      }
    } else if (terrain === TERRAIN.SWAMP) {
      c.ellipse(0, -2, 13, 6).fill({ color: 0x000000, alpha: 0.24 });
      c.rect(-3.5, -24, 7, 24).fill({ color: 0x4a4436 });
      c.rect(-3.5, -24, 2.5, 24).fill({ color: 0x574f3e });
      c.ellipse(0, -30, 18, 12).fill({ color: 0x4d5f36 });
      c.ellipse(-9, -33, 11, 9).fill({ color: 0x586c3d });
      c.ellipse(9, -31, 10, 8).fill({ color: 0x455632 });
      // ramas caídas (sauce)
      for (const [lx, lh] of [[-15, 16], [-7, 22], [6, 20], [14, 14]] as const) {
        c.rect(lx, -30, 1.4, lh).fill({ color: 0x5a6b3c });
      }
    } else {
      c.ellipse(0, -2, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.rect(-3, -20, 6, 20).fill({ color: 0x6b4a2b });
      c.ellipse(0, -28, 16, 18).fill({ color: 0x2f7d3a });
      c.ellipse(-6, -34, 10, 11).fill({ color: 0x3a9247 });
    }
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
    } else if (kind === 'gold') {
      c.ellipse(0, -1, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.ellipse(0, -7, 14, 10).fill({ color: 0x83888f });
      c.ellipse(-4, -10, 8, 6).fill({ color: 0x9aa0ab });
      c.circle(2, -7, 2.8).fill({ color: 0xf2cf5a });
      c.circle(-5, -6, 2).fill({ color: 0xe0b840 });
      c.circle(5, -11, 1.8).fill({ color: 0xffe38a });
      c.circle(-1, -12, 1.3).fill({ color: 0xf2cf5a });
    } else if (kind === 'diamond') {
      c.ellipse(0, -1, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.ellipse(0, -7, 14, 10).fill({ color: 0x7a828f });
      c.ellipse(-4, -10, 8, 6).fill({ color: 0x929aa8 });
      for (const [gx, gy] of [[2, -7], [-5, -6], [5, -11]] as const) {
        c.poly([gx, gy - 3, gx + 2.6, gy - 0.6, gx, gy + 3, gx - 2.6, gy - 0.6]).fill({ color: 0x6fe6e0 });
        c.poly([gx, gy - 3, gx + 2.6, gy - 0.6, gx, gy - 0.6]).fill({ color: 0xb6f5f2 });
      }
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
    } else if (type === 'boat') {
      g.ellipse(0, 6, 22, 7).fill({ color: 0x000000, alpha: 0.14 });
      g.poly([-20, 0, 20, 0, 13, 10, -13, 10]).fill({ color: 0x8a5a2b });
      g.poly([-20, 0, 20, 0, 16, -3, -16, -3]).fill({ color: 0xa06a34 });
      g.rect(-1.5, -12, 3, 12).fill({ color: 0x6a4a28 });
    } else if (type === 'bed') {
      const hw = (TILE_W / 2) * 0.8, hh = (TILE_H / 2) * 0.8;
      g.ellipse(0, 5, hw, 6).fill({ color: 0x000000, alpha: 0.18 });
      g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill({ color: 0x6b4a2b });
      g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).stroke({ width: 1.5, color: 0x8a5a2b });
      const iw = hw * 0.74, ih = hh * 0.74, lift = 4;
      g.poly([0, -ih - lift, iw, -lift, 0, ih - lift, -iw, -lift]).fill({ color: 0xc0392b });
      g.poly([0, -ih - lift, iw, -lift, 0, -lift, -iw, -lift]).fill({ color: 0xd6503f });
      const pw = iw * 0.4, ph = ih * 0.4, pcx = -iw * 0.4, pcy = -ih * 0.4 - lift;
      g.poly([pcx, pcy - ph, pcx + pw, pcy, pcx, pcy + ph, pcx - pw, pcy]).fill({ color: 0xf0ece0 });
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

  private makeWell(): Container {
    const g = new Graphics();
    const hw = (TILE_W / 2) * 0.58, hh = (TILE_H / 2) * 0.58;
    g.ellipse(0, 3, hw + 2, 6).fill({ color: 0x000000, alpha: 0.2 });
    g.poly([-hw, -6, 0, -6 + hh, 0, 6, -hw, 0]).fill({ color: 0x6b717a });
    g.poly([hw, -6, 0, -6 + hh, 0, 6, hw, 0]).fill({ color: 0x5c626b });
    g.poly([0, -6 - hh, hw, -6, 0, -6 + hh, -hw, -6]).fill({ color: 0x9aa0ab });
    g.ellipse(0, -6, hw * 0.55, hh * 0.55).fill({ color: 0x24405a });
    g.rect(-hw + 2, -24, 2, 18).fill({ color: 0x6b4a2b });
    g.rect(hw - 4, -24, 2, 18).fill({ color: 0x6b4a2b });
    g.poly([0, -32, hw + 3, -21, -hw - 3, -21]).fill({ color: 0x8a4b32 });
    return g;
  }

  private makeVillageHouse(variant: number): Container {
    const g = new Graphics();
    const hw = (TILE_W / 2) * 0.94, hh = (TILE_H / 2) * 0.94, H = 24, RH = 16;
    const wallR = 0xbfa878, wallL = 0xa1875f;
    const red = (variant & 1) === 0;
    const rF = red ? 0x9a4f32 : 0x5f7a44, rR = red ? 0x843f27 : 0x516a39;
    const rBL = red ? 0xb0623c : 0x6f8a4e, rBR = red ? 0xa5583a : 0x647f47;
    g.ellipse(0, 5, hw, 7).fill({ color: 0x000000, alpha: 0.2 });
    // muros (cara izquierda y derecha)
    g.poly([-hw, -H, 0, -H + hh, 0, hh, -hw, 0]).fill({ color: wallL });
    g.poly([hw, -H, 0, -H + hh, 0, hh, hw, 0]).fill({ color: wallR });
    // puerta y ventana en la cara derecha
    g.poly([5, -12, 11, -9, 11, 0, 5, -3]).fill({ color: 0x4a2f1c });
    g.poly([2, -18, 5, -16.5, 5, -12.5, 2, -14]).fill({ color: 0x6a4a2b });
    // vigas de madera (esquinas)
    g.rect(-1, -H + hh - 1, 2, hh).fill({ color: 0x6b4a2b });
    // techo a cuatro aguas
    const ax = 0, ay = -H - RH;
    const N = [0, -H - hh], E = [hw, -H], S = [0, -H + hh], W = [-hw, -H];
    g.poly([ax, ay, N[0], N[1], E[0], E[1]]).fill({ color: rBR });
    g.poly([ax, ay, N[0], N[1], W[0], W[1]]).fill({ color: rBL });
    g.poly([ax, ay, E[0], E[1], S[0], S[1]]).fill({ color: rR });
    g.poly([ax, ay, W[0], W[1], S[0], S[1]]).fill({ color: rF });
    return g;
  }

  private makeVillager(id: number): Container {
    const g = new Graphics();
    const robe = [0x6a8a4a, 0x8a5a6a, 0x5a6a8a, 0x9a7a3a][Math.abs(id) % 4];
    g.ellipse(0, 0, 7, 3.2).fill({ color: 0x000000, alpha: 0.2 });
    g.poly([-7, 0, 7, 0, 5, -20, -5, -20]).fill({ color: robe });
    g.roundRect(-8, -18, 4, 10, 2).fill({ color: darker(robe, 0.85) });
    g.roundRect(4, -18, 4, 10, 2).fill({ color: darker(robe, 0.85) });
    g.poly([-5, -20, 5, -20, 4, -24, -4, -24]).fill({ color: darker(robe, 0.8) });
    g.circle(0, -27, 5).fill({ color: 0xc9a06a });
    g.ellipse(0, -25, 1.7, 3).fill({ color: 0xb98d5a });
    g.circle(-2, -28, 0.9).fill({ color: 0x241a12 });
    g.circle(2, -28, 0.9).fill({ color: 0x241a12 });
    g.poly([-5, -28, 5, -28, 4, -32, -4, -32]).fill({ color: 0x4a3a2a });
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
    if (type === 'frog') {
      g.ellipse(0, -1, 8, 3).fill({ color: 0x000000, alpha: 0.2 });
      g.ellipse(-8, -2, 3, 2).fill({ color: 0x3f7a34 });
      g.ellipse(8, -2, 3, 2).fill({ color: 0x3f7a34 });
      g.ellipse(0, -5, 9, 6).fill({ color: 0x4f9a3f });
      g.ellipse(0, -6, 6, 4).fill({ color: 0x63b552 });
      g.circle(-3.5, -10, 2.4).fill({ color: 0x63b552 });
      g.circle(3.5, -10, 2.4).fill({ color: 0x63b552 });
      g.circle(-3.5, -10.5, 1.2).fill({ color: 0x1a1a12 });
      g.circle(3.5, -10.5, 1.2).fill({ color: 0x1a1a12 });
      g.moveTo(-4, -4); g.lineTo(4, -4); g.stroke({ width: 1, color: 0x2c5023 });
      return g;
    }
    if (type === 'monkey') {
      g.ellipse(0, -1, 9, 4).fill({ color: 0x000000, alpha: 0.2 });
      g.moveTo(7, -6); g.quadraticCurveTo(16, -10, 12, -18); g.stroke({ width: 2.4, color: 0x6b4a2b });
      g.rect(-8, -14, 3, 8).fill({ color: 0x6b4a2b });
      g.rect(5, -14, 3, 8).fill({ color: 0x6b4a2b });
      g.roundRect(-6, -16, 12, 13, 5).fill({ color: 0x7a5433 });
      g.ellipse(0, -6, 5, 4).fill({ color: 0xc9a06a });
      g.circle(-5, -22, 2.2).fill({ color: 0x7a5433 });
      g.circle(5, -22, 2.2).fill({ color: 0x7a5433 });
      g.circle(0, -20, 6).fill({ color: 0x7a5433 });
      g.ellipse(0, -19, 4, 3.4).fill({ color: 0xc9a06a });
      g.circle(-2, -21, 1).fill({ color: 0x1a1a12 });
      g.circle(2, -21, 1).fill({ color: 0x1a1a12 });
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
    const rawLift = this.elevAtL(this.prx, this.pry) * MAX_ELEV_PX;
    // Suaviza el desnivel: subir/bajar bloques ya no da tirones a la cámara.
    this.camLift += (rawLift - this.camLift) * Math.min(1, dt * 7);
    const py = ps.y - rawLift;          // posición exacta del jugador (sprite)
    const camY = ps.y - this.camLift;   // centro de cámara suavizado en vertical
    if (this.jumpVel !== 0 || this.jumpOff > 0) {
      this.jumpOff += this.jumpVel * dt;
      this.jumpVel -= 900 * dt;
      if (this.jumpOff <= 0) { this.jumpOff = 0; this.jumpVel = 0; }
    }
    this.player.x = ps.x; this.player.y = py - this.jumpOff; this.player.zIndex = depthOf(this.prx, this.pry) + 0.3;
    // El paneo se recentra poco a poco mientras caminas.
    if (this.spdEMA > 0.5 && !this.panning) { this.panX *= 0.9; this.panY *= 0.9; }
    const z = this.zoom;
    this.world.scale.set(z);
    this.world.x = this.app.screen.width / 2 - ps.x * z + this.panX;
    this.world.y = this.app.screen.height / 2 - camY * z + this.panY;

    if (this.exitMarker) {
      if (this.loc === 'cave') {
        const e0 = gridToScreen(0, 0);
        this.exitMarker.visible = true;
        this.exitMarker.scale.set(z);
        this.exitMarker.x = this.world.x + e0.x * z;
        this.exitMarker.y = this.world.y + (e0.y - this.elevAtL(0, 0) * MAX_ELEV_PX) * z;
      } else this.exitMarker.visible = false;
    }

    // animación: velocidad estimada por snapshots (independiente de los FPS) y
    // suavizada con histéresis para que no se entrecorte.
    this.spdEMA += (this.snapSpeed - this.spdEMA) * Math.min(1, dt * 12);
    const spd = this.spdEMA;
    const moving = spd > 0.4;
    let want: AvatarAction = 'idle';
    if (this.active && this.target) want = 'swing';
    else if (moving && this.onWater) want = 'swim';
    else if (moving && spd > PLAYER_SPEED * 1.25) want = 'run';
    else if (moving) want = 'walk';
    this.actionHold -= dt;
    if (want !== this.curAction && (want === 'swing' || this.curAction === 'swing' || this.actionHold <= 0)) {
      this.curAction = want; this.actionHold = 0.14;
    }
    const action = this.curAction;
    this.animT = (this.animT + dt * ANIM_RATE[action]) % 1;
    const fr = this.frames[action];
    if (fr && fr.length) this.player.texture = fr[Math.floor(this.animT * fr.length) % fr.length];

    // barca (montada)
    if (this.boat) {
      this.boat.visible = this.riding;
      if (this.boat.visible) { this.boat.x = ps.x; this.boat.y = py + 2; this.boat.zIndex = depthOf(this.prx, this.pry) + 0.28; }
    }

    const ptx = Math.round(this.prx), pty = Math.round(this.pry), tk = ptx + ',' + pty;
    if (tk !== this.ptile) { this.ptile = tk; this.refreshWindow(ptx, pty); }
    else if (this.terrainDirty) this.refreshWindow(ptx, pty);
    if (this.terrainDirty) { this.terrainDirty = false; this.realignSurface(); }

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
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const maxLift = this.loc === 'cave' ? MAX_ELEV_PX : 7 * BLOCK_PX;
    const K = Math.ceil(maxLift / hh) + 1;
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
    const placing = (this.selected?.kind === 'place' || this.selected?.kind === 'boat') && this.loc === 'surface';
    this.ghost.clear();
    let next: InteractTarget = null;
    this.placeTile = null;
    this.structTarget = null;
    this.talkTarget = null;
    this.sleepTarget = null;

    if (this.mouseX >= 0) {
      const wx = (this.mouseX - this.world.x) / this.zoom, wy = (this.mouseY - this.world.y) / this.zoom;
      if (placing) {
        const t = this.pickTile(wx, wy);
        this.placeTile = t;
        const item = this.selected?.item;
        const isTerrain = item ? ITEMS[item]?.place === 'terrain' : false;
        const isBoat = item === 'boat';
        const water = this.effWaterAt(t.x, t.y);
        const valid = Math.hypot(t.x - this.prx, t.y - this.pry) <= 4.5 && (isTerrain ? true : isBoat ? water : !water);
        const s = gridToScreen(t.x, t.y), yy = s.y - this.elevAtL(t.x, t.y) * MAX_ELEV_PX;
        const hw = TILE_W / 2, hh = TILE_H / 2;
        this.ghost.poly([s.x, yy - hh, s.x + hw, yy, s.x, yy + hh, s.x - hw, yy]).fill({ color: valid ? 0x8bd17c : 0xe06666, alpha: 0.35 }).stroke({ width: 2, color: valid ? 0x8bd17c : 0xe06666, alpha: 0.9 });
        this.app.canvas.style.cursor = 'cell';
      } else {
        const pick = this.pickTile(wx, wy);
        const st = this.structTiles.get(pick.x + ',' + pick.y);
        // aldeano bajo el cursor (por cercanía en pantalla, más tolerante)
        let vbest = 26; let vhit: { id: number; x: number; y: number } | null = null;
        for (const v of this.villagerTiles.values()) {
          const vs = gridToScreen(v.x, v.y);
          const vsy = vs.y - this.elevAtL(v.x, v.y) * MAX_ELEV_PX - 16;
          const d = Math.hypot(vs.x - wx, vsy - wy);
          if (d < vbest && Math.hypot(v.x - this.prx, v.y - this.pry) <= INTERACT_RANGE + 0.8) { vbest = d; vhit = v; }
        }
        if (st && (st.type === 'crafting_table' || st.type === 'furnace' || st.type === 'forge' || st.type === 'chest' || st.type === 'boat' || st.type === 'bed') && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE) {
          this.structTarget = { id: st.id, type: st.type, x: pick.x, y: pick.y };
          this.app.canvas.style.cursor = 'pointer';
        } else if (vhit) {
          this.talkTarget = vhit;
          this.app.canvas.style.cursor = 'pointer';
        } else if (this.villageBeds.has(pick.x + ',' + pick.y) && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE + 0.6) {
          this.sleepTarget = { x: pick.x, y: pick.y };
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
            else if (this.canDig(pick.x, pick.y) && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE) next = { kind: 'block', x: pick.x, y: pick.y };
          }
          this.app.canvas.style.cursor = next ? 'pointer' : 'default';
        }
      }
    }
    this.target = next;

    this.highlight.clear();
    if (next) {
      let hx = 0, hy = 0, hl = 0;
      if (next.kind === 'node' || next.kind === 'block') { hx = next.x; hy = next.y; hl = this.elevAtL(next.x, next.y) * MAX_ELEV_PX; }
      else { const ra = this.animals.get(next.id); if (ra) { hx = ra.rx; hy = ra.ry; hl = this.elevAtL(ra.rx, ra.ry) * MAX_ELEV_PX; } }
      const s = gridToScreen(hx, hy), hw = TILE_W / 2, hh = TILE_H / 2, yy = s.y - hl;
      const hc = next.kind === 'animal' ? 0xff6b6b : next.kind === 'block' ? 0xe8e8e8 : 0xf5c96b;
      this.highlight.poly([s.x, yy - hh, s.x + hw, yy, s.x, yy + hh, s.x - hw, yy]).stroke({ width: 2, color: hc, alpha: 0.95 });
    }
    if (this.structTarget) {
      const st = this.structTarget;
      const sp = gridToScreen(st.x, st.y), hw = TILE_W / 2, hh = TILE_H / 2, yy = sp.y - this.elevAtL(st.x, st.y) * MAX_ELEV_PX;
      this.highlight.poly([sp.x, yy - hh, sp.x + hw, yy, sp.x, yy + hh, sp.x - hw, yy]).stroke({ width: 2, color: 0x8bd1ff, alpha: 0.95 });
    }
    const npc = this.talkTarget ?? this.sleepTarget;
    if (npc) {
      const sp = gridToScreen(npc.x, npc.y), hw = TILE_W / 2, hh = TILE_H / 2, yy = sp.y - this.elevAtL(npc.x, npc.y) * MAX_ELEV_PX;
      this.highlight.poly([sp.x, yy - hh, sp.x + hw, yy, sp.x, yy + hh, sp.x - hw, yy]).stroke({ width: 2, color: this.talkTarget ? 0xffd05a : 0x8bd1ff, alpha: 0.95 });
    }

    const key = placing ? 'p' : this.talkTarget ? 't' + this.talkTarget.id : this.sleepTarget ? 'z' + this.sleepTarget.x + ',' + this.sleepTarget.y : this.structTarget ? 's' + this.structTarget.x + ',' + this.structTarget.y : next ? (next.kind === 'animal' ? 'a' + next.id : (next.kind === 'block' ? 'k' : 'n') + next.x + ',' + next.y) : '-';
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

}
