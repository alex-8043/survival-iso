// Render con PixiJS v8: mundo con relieve, nodos, animales, jugador animado,
// estructuras colocables, barca, día/noche y selección/colocación con el ratón.

import { Application, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { TILE_W, TILE_H, MAX_ELEV_PX, BLOCK_PX, INTERACT_RANGE, NIGHT_MAX_DARK, PLAYER_SPEED } from '../shared/constants';
import { gridToScreen, screenToGrid, depthOf } from '../shared/iso';
import { tileAt, nodeAt, isWater, TERRAIN, caveTile, caveNodeAt, caveEntranceAt, caveDecorAt, surfaceDecorAt, springAt, villageCenterAt, villageLayoutAt, isHouseWall, isHouseInterior, VILLAGE_SCAN, BEDROCK_LEVEL, type CaveTile, type VillageHouse } from '../shared/worldgen';
import { avatarCanvas, armorColor, type AvatarAction, type Customization, type HeldTool, type ArmorColors } from './avatar';
import { ITEMS } from '../shared/items';
import type { InteractTarget, Snapshot, Structure, Location, TerrainEdit, FluidEdit } from '../shared/protocol';
import type { Slot } from '../shared/inventory';
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
interface RenderAnimal { sprite: Container; rx: number; ry: number; tx: number; ty: number; type: AnimalType; vid?: number; }
interface FloatText { text: Text; life: number; }
interface RenderHouse { walls: Container; roof: Container; x0: number; y0: number; w: number; h: number; }
interface RenderVillage { deco: Container[]; houses: RenderHouse[]; }

export class GameRenderer {
  app!: Application;
  readonly world = new Container();
  readonly ground = new Graphics();
  readonly highlight = new Graphics();
  readonly ghost = new Graphics();
  readonly entities = new Container();
  readonly harvestBar = new Graphics(); // barra de progreso de picado (por encima de todo)
  readonly darkness = new Graphics();

  readonly nodes = new Map<string, RenderNode>();
  readonly decor = new Map<string, Container>();
  readonly animals = new Map<number, RenderAnimal>();
  readonly structs = new Map<number, Container>();
  readonly floats: FloatText[] = [];
  readonly depleted = new Set<string>();
  jumpOff = 0; jumpVel = 0;
  harvestActive = false; harvestProgress = 0; // barra de picado (desde el snapshot)

  // Antorchas: objeto (en el mundo) + resplandor (en pantalla, sobre la oscuridad).
  readonly torches = new Map<string, { obj: Container; glow: Sprite; x: number; y: number }>();
  readonly torchLayer = new Container();
  torchGlowTex: Texture | null = null;
  heldTorchGlow: Sprite | null = null; // luz cuando llevas una antorcha en la mano

  // Cursores según el objetivo (hacha/pico/espada), calculados una vez.
  cursorAxe = 'pointer'; cursorPick = 'pointer'; cursorSword = 'pointer';
  private targetNodeKind: string | null = null;

  // Cámara: zoom (rueda), suavizado de desnivel y paneo (clic rueda).
  zoom = 1; camLift = 0; panX = 0; panY = 0;
  panning = false; panCX = 0; panCY = 0;

  // Aldeas (render + clic sobre camas; los aldeanos son animales).
  readonly villages = new Map<string, RenderVillage>();
  readonly villageBeds = new Set<string>();
  readonly villageBlocked = new Set<string>(); // tiles de casa/cultivo (sin árboles/rocas)
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
  caveFade = 0; caveEntering = false; // bajada/subida física a la cueva

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
  onOpenFurnace: (id: number) => void = () => {};
  onBoardBoat: (id: number) => void = () => {};
  onEat: (item: string) => void = () => {};
  onSleep: () => void = () => {};
  onTalk: (id: number) => void = () => {};
  onShoot: (x: number, y: number) => void = () => {};
  onFish: (x: number, y: number) => void = () => {};
  // Flechas en vuelo y boya de pesca (pool reutilizable de Graphics).
  private projPool: Graphics[] = [];
  private projData: { x: number; y: number; vx: number; vy: number }[] = [];
  private fishBob: Graphics | null = null;
  private fishData: { x: number; y: number } | null = null;
  private bobT = 0;

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({ background: 0x1a2b1a, antialias: false, resizeTo: window, preference: 'webgl' });
    parent.appendChild(this.app.canvas);
    this.entities.sortableChildren = true;
    this.world.addChild(this.ground);
    this.world.addChild(this.highlight);
    this.world.addChild(this.ghost);
    this.world.addChild(this.entities);
    this.world.addChild(this.harvestBar);
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.darkness);
    this.caveDark = new Sprite(Texture.EMPTY);
    this.caveDark.visible = false;
    this.app.stage.addChild(this.caveDark);
    this.app.stage.addChild(this.torchLayer); // resplandores por encima de la oscuridad
    this.cursorAxe = this.makeToolCursor('axe');
    this.cursorPick = this.makeToolCursor('pick');
    this.cursorSword = this.makeToolCursor('sword');
    this.heldTorchGlow = new Sprite(this.ensureGlowTex());
    this.heldTorchGlow.anchor.set(0.5);
    this.heldTorchGlow.blendMode = 'add';
    this.heldTorchGlow.tint = 0xffb060;
    this.heldTorchGlow.visible = false;
    this.torchLayer.addChild(this.heldTorchGlow);
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
      // Arco / caña de pescar: clic izquierdo dispara/pesca hacia el cursor.
      const selItem = this.selected?.item;
      if (selItem && this.mouseX >= 0 && (ITEMS[selItem]?.weapon === 'bow' || ITEMS[selItem]?.fishing)) {
        const wx = (this.mouseX - this.world.x) / this.zoom, wy = (this.mouseY - this.world.y) / this.zoom;
        const gp = screenToGrid(wx, wy);
        if (ITEMS[selItem]?.weapon === 'bow') this.onShoot(gp.x, gp.y);
        else this.onFish(gp.x, gp.y);
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
        else if (this.structTarget.type === 'furnace') this.onOpenFurnace(this.structTarget.id);
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
      for (let i = 0; i < n; i++) arr.push(Texture.from(avatarCanvas(this.custom, PLAYER_SCALE, action, i / n, this.held, this.avatarArmor)));
      this.frames[action] = arr;
    }
    if (this.player) this.player.texture = this.frames.idle[0];
  }

  // Armadura equipada dibujada sobre el personaje (regenera los fotogramas).
  avatarArmor: ArmorColors | null = null;
  private armorKey = '';
  setAvatarArmor(slots: Slot[]): void {
    const a: ArmorColors = { helmet: armorColor(slots[0]?.id), chest: armorColor(slots[1]?.id), legs: armorColor(slots[2]?.id), boots: armorColor(slots[3]?.id) };
    const key = [a.helmet, a.chest, a.legs, a.boots].join(',');
    if (key === this.armorKey) return;
    this.armorKey = key;
    this.avatarArmor = a;
    if (this.custom && this.player) this.buildFrames();
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
    // El cambio de capa ocurre a mitad de la bajada física (pantalla en negro);
    // el fundido lo dibuja drawCaveWipe según snap.caveFade. Sin blur extra.
    void first;
  }

  // Fundido a negro de la bajada/subida física a la cueva (overlay DOM).
  private drawCaveWipe(): void {
    let el = document.getElementById('cave-wipe');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cave-wipe';
      el.style.cssText = 'position:fixed;inset:0;background:#05060a;pointer-events:none;z-index:60;opacity:0;display:none';
      document.body.appendChild(el);
    }
    if (this.caveFade > 0.002) { el.style.display = 'block'; el.style.opacity = String(Math.min(1, this.caveFade)); }
    else if (el.style.display !== 'none') el.style.display = 'none';
  }

  // Al entrar/salir de la cueva se DIFUMINA el mundo (desenfoque + atenuado) y la
  // cueva entra en foco. No es una pantalla negra de carga: es un enfoque suave.
  private showTransition(): void {
    const cv = this.app.canvas;
    let el = document.getElementById('cave-fade');
    if (!el) { el = document.createElement('div'); el.id = 'cave-fade'; document.body.appendChild(el); }
    const e = el;
    cv.style.transition = 'none';
    cv.style.filter = 'blur(14px) brightness(0.72)';
    e.style.transition = 'none';
    e.style.opacity = '0.55';
    e.style.display = 'block';
    void cv.offsetWidth; // fuerza reflow
    requestAnimationFrame(() => {
      cv.style.transition = 'filter .5s ease';
      cv.style.filter = 'blur(0px) brightness(1)';
      e.style.transition = 'opacity .5s ease';
      e.style.opacity = '0';
    });
    window.setTimeout(() => { e.style.display = 'none'; cv.style.filter = ''; cv.style.transition = ''; }, 560);
  }

  jump(): void {
    if (this.jumpOff <= 0.01 && this.jumpVel === 0) this.jumpVel = 262; // ~2.5 bloques de altura visual
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
    if (this.loc === 'cave') return caveNodeAt(x, y, this.caveSeed);
    if (this.villageBlocked.has(x + ',' + y)) return null; // ni árboles ni rocas en casas/cultivos
    return nodeAt(x, y, this.seed);
  }
  private nodeKey(x: number, y: number): string {
    return this.loc === 'cave' ? 'c' + this.caveSeed + ':' + x + ',' + y : x + ',' + y;
  }

  applySnapshot(snap: Snapshot): void {
    this.snapSpeed = Math.hypot(snap.px - this.prx, snap.py - this.pry) * 60; // tiles/s (1 tick = 1/60 s)
    this.prx = snap.px; this.pry = snap.py; this.tod = snap.time.tod; this.onWater = snap.onWater; this.riding = snap.riding;
    this.harvestActive = snap.harvestActive; this.harvestProgress = snap.harvestProgress;
    const seen = new Set<number>();
    for (const a of snap.animals) {
      if (!a.alive) continue;
      seen.add(a.id);
      let ra = this.animals.get(a.id);
      if (!ra) { const sprite = this.makeAnimal(a.type, a.vid ?? a.id); this.entities.addChild(sprite); ra = { sprite, rx: a.x, ry: a.y, tx: a.x, ty: a.y, type: a.type, vid: a.vid }; this.animals.set(a.id, ra); }
      ra.tx = a.x; ra.ty = a.y; ra.type = a.type; ra.vid = a.vid;
    }
    for (const [id, ra] of this.animals) if (!seen.has(id)) { this.entities.removeChild(ra.sprite); ra.sprite.destroy(); this.animals.delete(id); }
    this.projData = snap.projectiles.map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy }));
    this.fishData = snap.fishing;
    this.caveFade = snap.caveFade; this.caveEntering = snap.caveEntering;
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

  // Antorchas de la capa actual (recibidas del sim). Cada una: objeto en el mundo
  // + un resplandor cálido que ilumina la oscuridad de la cueva (o la noche).
  setTorches(list: { x: number; y: number }[]): void {
    const seen = new Set<string>();
    for (const t of list) {
      const key = t.x + ',' + t.y;
      seen.add(key);
      if (!this.torches.has(key)) {
        const obj = this.makeTorch();
        this.entities.addChild(obj);
        const glow = new Sprite(this.ensureGlowTex());
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        glow.tint = 0xffb060;
        glow.visible = false;
        this.torchLayer.addChild(glow);
        this.torches.set(key, { obj, glow, x: t.x, y: t.y });
      }
    }
    for (const [key, rt] of this.torches) if (!seen.has(key)) {
      this.entities.removeChild(rt.obj); rt.obj.destroy({ children: true });
      this.torchLayer.removeChild(rt.glow); rt.glow.destroy();
      this.torches.delete(key);
    }
  }

  private makeTorch(): Container {
    const c = new Container();
    const g = new Graphics();
    g.rect(-1.4, -6, 2.8, 12).fill({ color: 0x6b4a2a });      // palo
    g.rect(-2.4, -10, 4.8, 4).fill({ color: 0x2f2114 });       // soporte
    g.ellipse(0, -12, 3, 5).fill({ color: 0xff8a1e });         // llama
    g.ellipse(0, -13, 1.7, 3).fill({ color: 0xffe488 });       // núcleo de la llama
    c.addChild(g);
    return c;
  }

  // Genera un cursor con forma de herramienta (data URL) para usar en CSS.
  private makeToolCursor(kind: 'axe' | 'pick' | 'sword'): string {
    const S = 30;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const stroke = (col: string, w: number, pts: [number, number][]) => {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.stroke();
    };
    const outline = '#111';
    if (kind === 'axe') {
      stroke(outline, 6, [[9, 27], [19, 11]]); stroke('#7a4a24', 4, [[9, 27], [19, 11]]); // mango
      c.fillStyle = outline; c.beginPath(); c.moveTo(14, 6); c.lineTo(26, 8); c.lineTo(21, 17); c.lineTo(13, 12); c.closePath(); c.fill();
      c.fillStyle = '#c9d2dc'; c.beginPath(); c.moveTo(15, 8); c.lineTo(24, 9.5); c.lineTo(20.5, 15.5); c.lineTo(14.5, 11.5); c.closePath(); c.fill();
    } else if (kind === 'pick') {
      stroke(outline, 6, [[15, 27], [15, 12]]); stroke('#7a4a24', 4, [[15, 27], [15, 12]]); // mango
      stroke(outline, 7, [[5, 13], [15, 8], [25, 13]]);   // cabeza (arco) con contorno
      stroke('#b8bec8', 4.5, [[5, 13], [15, 8], [25, 13]]);
    } else { // sword
      stroke(outline, 7, [[15, 5], [15, 21]]); stroke('#d3dae4', 4.5, [[15, 5], [15, 21]]); // hoja
      c.fillStyle = '#d3dae4'; c.beginPath(); c.moveTo(11.5, 6); c.lineTo(15, 2); c.lineTo(18.5, 6); c.closePath(); c.fill(); // punta
      stroke(outline, 6, [[9, 21], [21, 21]]); stroke('#c99b3a', 4, [[9, 21], [21, 21]]); // guarda
      stroke(outline, 6, [[15, 21], [15, 27]]); stroke('#8a5a2b', 4, [[15, 21], [15, 27]]); // empuñadura
    }
    return `url(${cv.toDataURL('image/png')}) 3 3, pointer`;
  }

  private ensureGlowTex(): Texture {
    if (this.torchGlowTex) return this.torchGlowTex;
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.72)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.24)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
    this.torchGlowTex = Texture.from(cv);
    return this.torchGlowTex;
  }

  private updateTorches(): void {
    if (!this.torches.size) return;
    const z = this.zoom;
    const caveLit = this.loc === 'cave';
    const glowA = caveLit ? 0.6 : Math.min(0.75, this.nightAlpha(this.tod) * 1.3);
    const flick = 0.9 + 0.1 * Math.sin(this.animT * Math.PI * 6);
    for (const rt of this.torches.values()) {
      const s = gridToScreen(rt.x, rt.y);
      const elev = this.elevAtL(rt.x, rt.y) * MAX_ELEV_PX;
      rt.obj.x = s.x; rt.obj.y = s.y - elev; rt.obj.zIndex = depthOf(rt.x, rt.y) + 0.05;
      const on = glowA > 0.03;
      rt.glow.visible = on;
      if (on) {
        rt.glow.x = this.world.x + s.x * z;
        rt.glow.y = this.world.y + (s.y - elev - 10) * z;
        rt.glow.alpha = glowA * flick;
        rt.glow.scale.set(z * 1.1 * flick);
      }
    }
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
    // Tiles ocupados por aldea (casas + cultivo): no se dibujan árboles/rocas encima.
    this.villageBlocked.clear();
    if (this.loc === 'surface') {
      const M = VILLAGE_SCAN;
      for (let dy = -R - M; dy <= R + M; dy++) for (let dx = -R - M; dx <= R + M; dx++) {
        const cx = ptx + dx, cy = pty + dy;
        if (!villageCenterAt(cx, cy, this.seed)) continue;
        const lay = villageLayoutAt(cx, cy, this.seed);
        for (const h of lay.houses) for (let yy = h.y0; yy < h.y0 + h.h; yy++) for (let xx = h.x0; xx < h.x0 + h.w; xx++) this.villageBlocked.add(xx + ',' + yy);
        const f = lay.farm;
        for (let yy = f.y0; yy < f.y0 + f.h; yy++) for (let xx = f.x0; xx < f.x0 + f.w; xx++) this.villageBlocked.add(xx + ',' + yy);
      }
    }
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
      if (this.loc === 'surface' && this.villageBlocked.has(x + ',' + y)) continue; // sin decoración en casas/cultivos
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
        if (!this.villages.has(vkey)) {
          const deco: Container[] = [];
          const well = this.makeWell(); this.placeAt(well, cx, cy, 0.05); deco.push(well);
          const farm = this.makeFarm(layout.farm.w, layout.farm.h); this.placeAt(farm, layout.farm.x0, layout.farm.y0, -0.2); deco.push(farm);
          const houses: RenderHouse[] = [];
          for (const h of layout.houses) {
            const built = this.makeHouse(h);
            this.placeAt(built.floor, h.x0, h.y0, -0.1);
            const front = depthOf(h.x0 + h.w - 1, h.y0 + h.h - 1);
            const fs = gridToScreen(h.x0, h.y0);
            built.walls.x = fs.x; built.walls.y = fs.y - this.elevAtL(cx, cy) * MAX_ELEV_PX; built.walls.zIndex = front + 0.2;
            built.roof.x = fs.x; built.roof.y = fs.y - this.elevAtL(cx, cy) * MAX_ELEV_PX; built.roof.zIndex = front + 0.5;
            deco.push(built.floor);
            this.entities.addChild(built.walls); this.entities.addChild(built.roof);
            houses.push({ walls: built.walls, roof: built.roof, x0: h.x0, y0: h.y0, w: h.w, h: h.h });
            if (h.bed) { const bed = this.makeStructure('bed'); this.placeAt(bed, h.bed.x, h.bed.y, 0.04); deco.push(bed); }
          }
          for (const p of deco) this.entities.addChild(p);
          this.villages.set(vkey, { deco, houses });
        }
      }
      for (const [vkey, v] of this.villages) if (!wantV.has(vkey)) { this.destroyVillage(v); this.villages.delete(vkey); }
      this.updateHouseTransparency();
    } else if (this.villages.size) {
      for (const [, v] of this.villages) this.destroyVillage(v);
      this.villages.clear();
    }
  }

  private destroyVillage(v: RenderVillage): void {
    for (const p of v.deco) { this.entities.removeChild(p); p.destroy(); }
    for (const h of v.houses) { this.entities.removeChild(h.walls); h.walls.destroy(); this.entities.removeChild(h.roof); h.roof.destroy(); }
  }

  // Baja la opacidad de los muros/techo de la casa donde está el jugador (profundidad).
  private updateHouseTransparency(): void {
    const px = Math.round(this.prx), py = Math.round(this.pry);
    for (const v of this.villages.values()) {
      for (const h of v.houses) {
        const inside = px > h.x0 && px < h.x0 + h.w - 1 && py > h.y0 && py < h.y0 + h.h - 1;
        const a = inside ? 0.22 : 1;
        h.walls.alpha = a; h.roof.alpha = a;
      }
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
            // EP = sobredibujado (~1 px) para que los rombos contiguos se solapen y
            // NO queden costuras/huecos entre bloques colocados (antialias desactivado).
            const EP = 1;
            if (rDrop > 0) {
              const fh = rDrop * BLOCK_PX;
              g.poly([s.x + hw + EP, topY, s.x, topY + hh + EP, s.x, topY + hh + fh + EP, s.x + hw + EP, topY + fh]).fill({ color: darker(base, 0.52) });
              const n = Math.min(rDrop, 8);
              for (let i = 1; i < n; i++) { const yy = topY + i * BLOCK_PX; g.moveTo(s.x + hw, yy); g.lineTo(s.x, yy + hh); g.stroke({ width: 1, color: 0x000000, alpha: 0.13 }); }
            }
            if (lDrop > 0) {
              const fh = lDrop * BLOCK_PX;
              g.poly([s.x - hw - EP, topY, s.x, topY + hh + EP, s.x, topY + hh + fh + EP, s.x - hw - EP, topY + fh]).fill({ color: darker(base, 0.4) });
              const n = Math.min(lDrop, 8);
              for (let i = 1; i < n; i++) { const yy = topY + i * BLOCK_PX; g.moveTo(s.x - hw, yy); g.lineTo(s.x, yy + hh); g.stroke({ width: 1, color: 0x000000, alpha: 0.13 }); }
            }
            g.poly([s.x, topY - hh - EP, s.x + hw + EP, topY, s.x, topY + hh + EP, s.x - hw - EP, topY]).fill({ color: base });
            if (!edit && caveEntranceAt(x, y, this.seed)) this.drawEntrance(g, s.x, topY);
            else if (!edit && springAt(x, y, this.seed)) this.drawSpring(g, s.x, topY);
          }
        }
      }
    }
  }

  // Entrada de cueva: una BOCA con rampa que baja hacia la oscuridad, para que se
  // lea como un descenso físico (no una tapa/escalera). El lado cercano (abajo)
  // queda abierto como rampa; el lejano, un reborde rocoso.
  private drawEntrance(g: Graphics, cx: number, topY: number): void {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    // reborde de tierra/roca alrededor del hueco
    g.poly([cx, topY - hh * 0.82, cx + hw * 0.86, topY, cx, topY + hh * 0.82, cx - hw * 0.86, topY]).fill({ color: 0x5b4a38 });
    g.poly([cx, topY - hh * 0.82, cx + hw * 0.86, topY, cx, topY + hh * 0.4, cx - hw * 0.4, topY - hh * 0.2]).fill({ color: 0x6b5842 }); // borde lejano iluminado
    // boca oscura con profundidad (varios rombos hacia el negro, desplazados hacia
    // el fondo para simular una rampa que baja)
    g.poly([cx, topY - hh * 0.58, cx + hw * 0.64, topY, cx, topY + hh * 0.66, cx - hw * 0.64, topY]).fill({ color: 0x2a2018 });
    g.poly([cx, topY - hh * 0.4, cx + hw * 0.5, topY - hh * 0.06, cx, topY + hh * 0.5, cx - hw * 0.5, topY - hh * 0.06]).fill({ color: 0x140f0b });
    g.poly([cx, topY - hh * 0.22, cx + hw * 0.34, topY - hh * 0.1, cx, topY + hh * 0.34, cx - hw * 0.34, topY - hh * 0.1]).fill({ color: 0x050409 });
    // escalones/estrías de la rampa en el lado cercano (bajando)
    for (let i = 1; i <= 3; i++) {
      const yy = topY + hh * 0.14 * i;
      g.moveTo(cx - hw * 0.34, yy).lineTo(cx, yy + hh * 0.16).lineTo(cx + hw * 0.34, yy).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
    }
    // piedritas del borde
    g.ellipse(cx - hw * 0.6, topY - 1, 2.6, 1.7).fill({ color: 0x746c62 });
    g.ellipse(cx + hw * 0.54, topY + 1, 2.2, 1.5).fill({ color: 0x6b6259 });
    g.ellipse(cx + hw * 0.1, topY - hh * 0.5, 1.8, 1.2).fill({ color: 0x7d7568 });
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

  // Casa GRANDE: muros (bloques por tile de perímetro), techo piramidal y suelo.
  // Todo relativo a la tile origen (x0,y0); el llamador la posiciona.
  private makeHouse(h: VillageHouse): { walls: Container; roof: Container; floor: Container } {
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const o = gridToScreen(h.x0, h.y0);
    const rel = (x: number, y: number) => { const s = gridToScreen(x, y); return { x: s.x - o.x, y: s.y - o.y }; };
    const vh = (Math.imul(h.x0, 73856093) ^ Math.imul(h.y0, 19349663)) >>> 0;
    const wallVar = vh % 3, roofVar = (vh >>> 4) % 3;
    const wallCol = [0xe0d0ad, 0xcdb98f, 0xd6c4a8][wallVar]; // enlucido claro
    const beam = 0x5b3f26, beamHi = 0x74542f;              // entramado de madera
    const roofF = [0xa8503a, 0x5f7a44, 0x6a5a86][roofVar]; // teja roja / verde / pizarra

    const floor = new Graphics();
    for (let yy = h.y0 + 1; yy < h.y0 + h.h - 1; yy++) for (let xx = h.x0 + 1; xx < h.x0 + h.w - 1; xx++) {
      const p = rel(xx, yy);
      floor.poly([p.x, p.y - hh, p.x + hw, p.y, p.x, p.y + hh, p.x - hw, p.y]).fill({ color: (xx + yy) % 2 ? 0x8a5a34 : 0x7d5030 });
    }

    const walls = new Graphics();
    const WH = 2.7 * BLOCK_PX;
    // Ventana en una cara (paralelogramo iso) dado su vértice exterior-superior O,
    // el vector "a lo largo del muro" (A) y el vector "hacia abajo" (D).
    const window = (ox: number, oy: number, ax: number, ay: number, dx: number, dy: number) => {
      const pt = (a: number, d: number): [number, number] => [ox + ax * a + dx * d, oy + ay * a + dy * d];
      const q = [pt(0.28, 0.26), pt(0.72, 0.26), pt(0.72, 0.66), pt(0.28, 0.66)].flat();
      walls.poly(q).fill({ color: 0x2c3f52 });
      walls.poly([...pt(0.28, 0.26), ...pt(0.72, 0.26), ...pt(0.72, 0.66), ...pt(0.28, 0.66)]).stroke({ width: 1.5, color: beam });
      walls.poly([...pt(0.5, 0.26), ...pt(0.5, 0.66)]).stroke({ width: 1, color: beam });
      walls.poly([...pt(0.28, 0.46), ...pt(0.72, 0.46)]).stroke({ width: 1, color: beam });
    };
    let wi = 0;
    for (let yy = h.y0; yy < h.y0 + h.h; yy++) for (let xx = h.x0; xx < h.x0 + h.w; xx++) {
      if (!isHouseWall(h, xx, yy)) continue;
      const p = rel(xx, yy), topY = p.y - WH;
      const corner = (xx === h.x0 || xx === h.x0 + h.w - 1) && (yy === h.y0 || yy === h.y0 + h.h - 1);
      const isDoor = xx === h.door.x && yy === h.door.y;
      walls.poly([p.x + hw, topY, p.x, topY + hh, p.x, p.y + hh, p.x + hw, p.y]).fill({ color: darker(wallCol, 0.74) });
      walls.poly([p.x - hw, topY, p.x, topY + hh, p.x, p.y + hh, p.x - hw, p.y]).fill({ color: darker(wallCol, 0.58) });
      walls.poly([p.x, topY - hh, p.x + hw, topY, p.x, topY + hh, p.x - hw, topY]).fill({ color: wallCol });
      // Entramado: viga superior e inferior + postes en las esquinas de cada tile.
      for (const side of [1, -1] as const) {
        const ex = side * hw;
        walls.poly([p.x + ex, topY, p.x, topY + hh, p.x, topY + hh + 3, p.x + ex, topY + 3]).fill({ color: beam }); // viga sup
        walls.poly([p.x + ex, p.y - 3, p.x, p.y + hh - 3, p.x, p.y + hh, p.x + ex, p.y]).fill({ color: beam });       // viga inf
        walls.rect(p.x + ex - side * 1.5, topY, 1.5, WH).fill({ color: beamHi });                                     // poste
        walls.rect(p.x - 1, topY, 2, WH).fill({ color: beam, alpha: 0.5 });                                           // poste central
      }
      // Ventanas (en tiles rectos alternos, no en esquinas ni en la puerta).
      if (!corner && !isDoor && wi % 2 === 0 && false) {
        window(p.x + hw, topY, -hw, hh, 0, WH);  // cara derecha
        window(p.x - hw, topY, hw, hh, 0, WH);   // cara izquierda
      }
      wi++;
    }
    // Puerta con marco y dintel.
    const dp = rel(h.door.x, h.door.y);
    walls.rect(dp.x - 7, dp.y - WH * 0.78, 14, WH * 0.78).fill({ color: beam });
    walls.rect(dp.x - 5, dp.y - WH * 0.72, 10, WH * 0.72).fill({ color: 0x5a3a1e });
    walls.rect(dp.x - 0.6, dp.y - WH * 0.72, 1.2, WH * 0.72).fill({ color: 0x3a2416 });
    walls.circle(dp.x + 3, dp.y - WH * 0.34, 1.1).fill({ color: 0xd8c24a }); // pomo

    const roof = new Graphics();
    const lift = WH + 3;
    // Corners con alero (se extienden un poco más allá del muro).
    const cx0 = rel(h.x0, h.y0), cx1 = rel(h.x0 + h.w - 1, h.y0), cx2 = rel(h.x0 + h.w - 1, h.y0 + h.h - 1), cx3 = rel(h.x0, h.y0 + h.h - 1);
    const ctr = { x: (cx0.x + cx2.x) / 2, y: (cx0.y + cx2.y) / 2 };
    const ov = 0.16; // alero
    const eave = (c: { x: number; y: number }) => ({ x: c.x + (c.x - ctr.x) * ov, y: c.y + (c.y - ctr.y) * ov - lift });
    const p0 = eave(cx0), p1 = eave(cx1), p2 = eave(cx2), p3 = eave(cx3);
    const span = Math.max(h.w, h.h);
    const shingles = (a: number[], base: number) => { roof.poly(a).fill({ color: base }); roof.poly([...a]).stroke({ width: 1, color: darker(base, 0.7), alpha: 0.6 }); };
    if (roofVar === 1) {
      // Tejado a 4 aguas (piramidal) con cumbrera.
      const A = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 - span * 5 };
      shingles([A.x, A.y, p0.x, p0.y, p1.x, p1.y], darker(roofF, 0.88));
      shingles([A.x, A.y, p0.x, p0.y, p3.x, p3.y], darker(roofF, 0.76));
      shingles([A.x, A.y, p1.x, p1.y, p2.x, p2.y], darker(roofF, 0.66));
      shingles([A.x, A.y, p3.x, p3.y, p2.x, p2.y], roofF);
    } else {
      // Tejado a dos aguas con cumbrera a lo largo del eje x0->x0+w.
      const rh = span * (roofVar === 2 ? 6 : 4.4);
      const RA = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 - rh };
      const RB = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - rh };
      shingles([p0.x, p0.y, p1.x, p1.y, RB.x, RB.y, RA.x, RA.y], darker(roofF, 0.7)); // vertiente frontal
      shingles([p3.x, p3.y, p2.x, p2.y, RB.x, RB.y, RA.x, RA.y], roofF);              // vertiente trasera
      roof.poly([p0.x, p0.y, p3.x, p3.y, RA.x, RA.y]).fill({ color: darker(wallCol, 0.9) }); // hastial izq
      roof.poly([p1.x, p1.y, p2.x, p2.y, RB.x, RB.y]).fill({ color: darker(wallCol, 0.82) }); // hastial der
      roof.poly([RA.x, RA.y, RB.x, RB.y]).stroke({ width: 2.5, color: darker(roofF, 0.6) });   // cumbrera
    }
    // Chimenea de ladrillo (en una esquina del tejado).
    const ch = { x: p1.x * 0.6 + ctr.x * 0.4, y: (p1.y - lift * 0.2) * 0.6 + (ctr.y - lift) * 0.4 };
    roof.rect(ch.x - 3, ch.y - 16, 6, 16).fill({ color: 0x8a4a3a });
    roof.rect(ch.x - 3, ch.y - 16, 6, 3).fill({ color: 0x6a3628 });
    for (let i = 0; i < 3; i++) roof.rect(ch.x - 3, ch.y - 12 + i * 4, 6, 1).fill({ color: 0x6a3628, alpha: 0.6 });
    return { walls, roof, floor };
  }

  // Parcela de cultivo (decorativa): tierra arada con brotes en filas.
  private makeFarm(w: number, h: number): Container {
    const g = new Graphics();
    const hw = TILE_W / 2, hh = TILE_H / 2;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const s = gridToScreen(xx, yy);
      g.poly([s.x, s.y - hh, s.x + hw, s.y, s.x, s.y + hh, s.x - hw, s.y]).fill({ color: 0x6b4a2b });
      g.poly([s.x, s.y - hh, s.x + hw, s.y, s.x, s.y + hh, s.x - hw, s.y]).stroke({ width: 1, color: 0x543a22, alpha: 0.5 });
      const crop = (xx * 2 + yy) % 3;
      const col = crop === 0 ? 0x8ec04a : crop === 1 ? 0xd8c24a : 0x5fa03a;
      for (const ox of [-hw * 0.4, 0, hw * 0.4]) g.rect(s.x + ox - 0.8, s.y - 5, 1.6, 6).fill({ color: col });
    }
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

  // Dibuja flechas en vuelo (interpoladas con su velocidad) y la boya de pesca.
  private updateProjectiles(dt: number): void {
    for (const p of this.projData) { p.x += p.vx * dt; p.y += p.vy * dt; }
    while (this.projPool.length < this.projData.length) {
      const g = new Graphics();
      g.moveTo(-7, 0).lineTo(5, 0).stroke({ width: 1.6, color: 0x6b5334 });
      g.poly([5, -2.4, 10, 0, 5, 2.4]).fill({ color: 0xcfc6b4 });
      g.poly([-7, 0, -4, -2.2, -4, 2.2]).fill({ color: 0xe7e2d4 });
      this.entities.addChild(g); this.projPool.push(g);
    }
    for (let i = 0; i < this.projPool.length; i++) {
      const g = this.projPool[i];
      const p = this.projData[i];
      if (!p) { g.visible = false; continue; }
      g.visible = true;
      const s = gridToScreen(p.x, p.y);
      g.x = s.x; g.y = s.y - this.elevAtL(p.x, p.y) * MAX_ELEV_PX - 6;
      // orientación en pantalla del vector de velocidad (proyección isométrica)
      const sdx = (p.vx - p.vy) * (TILE_W / 2), sdy = (p.vx + p.vy) * (TILE_H / 2);
      g.rotation = Math.atan2(sdy, sdx);
      g.zIndex = depthOf(p.x, p.y) + 0.4;
    }
    // Boya de pesca.
    if (this.fishData) {
      this.bobT += dt;
      if (!this.fishBob) { this.fishBob = new Graphics(); this.entities.addChild(this.fishBob); }
      const b = this.fishBob; b.visible = true; b.clear();
      const bob = Math.sin(this.bobT * 4) * 2;
      b.ellipse(0, 4, 5, 2).fill({ color: 0x000000, alpha: 0.18 });
      b.circle(0, -2 + bob, 2.4).fill({ color: 0xe14b4b });
      b.circle(0, -2 + bob, 2.4).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
      b.rect(-0.6, -6 + bob, 1.2, 4).fill({ color: 0xf2f2f2 });
      const s = gridToScreen(this.fishData.x, this.fishData.y);
      b.x = s.x; b.y = s.y - this.elevAtL(this.fishData.x, this.fishData.y) * MAX_ELEV_PX;
      b.zIndex = depthOf(this.fishData.x, this.fishData.y) + 0.5;
    } else if (this.fishBob) { this.fishBob.visible = false; }
  }

  private makeAnimal(type: AnimalType, variant = 0): Container {
    if (type === 'villager') return this.makeVillager(variant);
    const g = new Graphics();
    if (type === 'skeleton' || type === 'zombie' || type === 'spider' || type === 'slime' || type === 'wraith') return this.makeEnemy(type);
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

  // Enemigos hostiles con estética pixel-art del juego (Tanda O).
  private makeEnemy(type: AnimalType): Container {
    const g = new Graphics();
    g.ellipse(0, -1, 11, 4).fill({ color: 0x000000, alpha: 0.22 });
    if (type === 'skeleton') {
      for (const lx of [-3.2, 1.4]) g.rect(lx, -7, 2, 7).fill({ color: 0xdedacb });
      g.roundRect(-5, -17, 10, 11, 2).fill({ color: 0xe9e5d6 }); // caja torácica
      for (const ry of [-15, -12.5, -10]) g.rect(-5, ry, 10, 1.1).fill({ color: 0x9a9789 });
      g.rect(-0.8, -17, 1.6, 11).fill({ color: 0xcdc9ba }); // esternón
      g.rect(-9, -15, 4.6, 1.8).fill({ color: 0xdedacb }); // brazo con arco
      g.circle(-8, -13, 5).stroke({ width: 1.4, color: 0x8a6b3f }); // arco
      g.circle(0, -22, 4.6).fill({ color: 0xf1eddf }); // cráneo
      g.ellipse(-1.6, -22, 1.3, 1.6).fill({ color: 0x2a2a2a });
      g.ellipse(1.6, -22, 1.3, 1.6).fill({ color: 0x2a2a2a });
      g.rect(-2, -18.5, 4, 1).fill({ color: 0x8a8779 });
    } else if (type === 'zombie') {
      for (const lx of [-4, 1.4]) g.rect(lx, -7, 2.8, 7).fill({ color: 0x35502f });
      g.roundRect(-5.5, -17, 11, 11, 2).fill({ color: 0x4c7a3f }); // torso
      g.rect(-3, -15, 6, 5).fill({ color: 0x3c6233, alpha: 0.6 }); // ropa rota
      g.rect(-11, -15.5, 6, 3).fill({ color: 0x6a8f4a }); // brazos extendidos
      g.rect(5, -15.5, 6, 3).fill({ color: 0x6a8f4a });
      g.roundRect(-4.5, -25, 9, 8, 2).fill({ color: 0x6f9a54 }); // cabeza
      g.rect(-3, -22.5, 2.4, 1.8).fill({ color: 0x1c2a16 });
      g.rect(1.2, -22.5, 2.4, 1.8).fill({ color: 0x1c2a16 });
      g.rect(-2.4, -19, 5, 1).fill({ color: 0x24301a });
    } else if (type === 'spider') {
      g.ellipse(0, -1, 15, 5).fill({ color: 0x000000, alpha: 0.22 });
      for (const s of [-1, 1]) for (const [ay, ln] of [[-9, 12], [-7, 13], [-5, 12]] as const) {
        g.moveTo(0, -6).lineTo(s * ln, ay).stroke({ width: 1.6, color: 0x1c1720 });
      }
      g.ellipse(4, -7, 8, 6).fill({ color: 0x241d29 }); // abdomen
      g.ellipse(4, -8, 3, 2).fill({ color: 0x3a2f40, alpha: 0.7 });
      g.ellipse(-6, -8, 5, 4).fill({ color: 0x2c2431 }); // cabeza
      g.circle(-8, -9, 1).fill({ color: 0xe0554a });
      g.circle(-6, -9.6, 1).fill({ color: 0xe0554a });
      g.circle(-9.2, -7.6, 0.7).fill({ color: 0xe0554a });
      g.circle(-6.6, -7.2, 0.7).fill({ color: 0xe0554a });
    } else if (type === 'slime') {
      g.roundRect(-8, -12, 16, 12, 5).fill({ color: 0x5fb85a, alpha: 0.88 }); // cuerpo
      g.roundRect(-8, -12, 16, 12, 5).stroke({ width: 1.2, color: 0x3f8f3c, alpha: 0.7 });
      g.roundRect(-5, -10, 6, 4, 2).fill({ color: 0xa6e79f, alpha: 0.7 }); // brillo
      g.circle(-3, -6, 1.4).fill({ color: 0x173d15 });
      g.circle(3, -6, 1.4).fill({ color: 0x173d15 });
      g.rect(-2, -3.5, 4, 1).fill({ color: 0x173d15 });
    } else { // wraith (espectro)
      g.ellipse(0, -1, 8, 3).fill({ color: 0x1a1030, alpha: 0.18 });
      g.poly([-8, -8, -5, -2, -2, -6, 0, -1, 2, -6, 5, -2, 8, -8, 6, -20, -6, -20]).fill({ color: 0x6a5aa6, alpha: 0.8 }); // manto ondulado
      g.roundRect(-6.5, -26, 13, 9, 5).fill({ color: 0x7c6cc0, alpha: 0.85 }); // capucha
      g.ellipse(0, -19, 6.5, 7).fill({ color: 0x241d3a }); // hueco oscuro
      g.circle(-2.4, -20, 1.5).fill({ color: 0x9be1ff });
      g.circle(2.4, -20, 1.5).fill({ color: 0x9be1ff });
      g.circle(-2.4, -20, 2.6).fill({ color: 0x9be1ff, alpha: 0.25 });
      g.circle(2.4, -20, 2.6).fill({ color: 0x9be1ff, alpha: 0.25 });
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
    // Bajada física: el sprite se hunde en el agujero (o emerge al subir) según el fundido.
    const sink = this.caveFade * 26;
    this.player.x = ps.x; this.player.y = py - this.jumpOff + sink; this.player.zIndex = depthOf(this.prx, this.pry) + 0.3;
    this.player.alpha = 1 - this.caveFade * 0.6;
    this.drawCaveWipe();
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
    this.updateProjectiles(dt);
    for (const rn of this.nodes.values()) if (rn.pulse > 0) { rn.pulse = Math.max(0, rn.pulse - dt * 6); rn.sprite.scale.set(1 + 0.16 * rn.pulse); }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.life += dt; f.text.y -= dt * 26; f.text.alpha = Math.max(0, 1 - f.life);
      if (f.life >= 1) { this.entities.removeChild(f.text); f.text.destroy(); this.floats.splice(i, 1); }
    }

    if (this.villages.size) this.updateHouseTransparency();
    this.updateTorches();
    // Antorcha en mano: ilumina alrededor del jugador (en la cueva o de noche).
    if (this.heldTorchGlow) {
      const holding = this.selected?.item === 'torch';
      const gA = this.loc === 'cave' ? 0.62 : Math.min(0.75, this.nightAlpha(this.tod) * 1.3);
      const on = holding && gA > 0.03;
      this.heldTorchGlow.visible = on;
      if (on) {
        this.heldTorchGlow.x = this.world.x + ps.x * z;
        this.heldTorchGlow.y = this.world.y + (py - this.jumpOff) * z;
        this.heldTorchGlow.alpha = gA;
        this.heldTorchGlow.scale.set(z * 1.3);
      }
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
    // Se puede colocar en superficie; además, las antorchas también en la cueva.
    const placing = (this.selected?.kind === 'place' || this.selected?.kind === 'boat') && (this.loc === 'surface' || this.selected?.item === 'torch');
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
        const isTorch = item === 'torch';
        const water = this.effWaterAt(t.x, t.y);
        const inRange = Math.hypot(t.x - this.prx, t.y - this.pry) <= 4.5;
        const valid = inRange && (isTerrain ? true : isBoat ? water : isTorch ? (this.loc === 'cave' ? caveTile(t.x, t.y, this.caveSeed).passable : !water) : !water);
        const s = gridToScreen(t.x, t.y), yy = s.y - this.elevAtL(t.x, t.y) * MAX_ELEV_PX;
        const hw = TILE_W / 2, hh = TILE_H / 2;
        this.ghost.poly([s.x, yy - hh, s.x + hw, yy, s.x, yy + hh, s.x - hw, yy]).fill({ color: valid ? 0x8bd17c : 0xe06666, alpha: 0.35 }).stroke({ width: 2, color: valid ? 0x8bd17c : 0xe06666, alpha: 0.9 });
        this.app.canvas.style.cursor = 'cell';
      } else {
        const pick = this.pickTile(wx, wy);
        const st = this.structTiles.get(pick.x + ',' + pick.y);
        // animal/aldeano más cercano al cursor
        let bestD = 26; let hitVillager: RenderAnimal | null = null; let hitAnimal = -1;
        for (const [id, ra] of this.animals) {
          const range = INTERACT_RANGE + (ra.type === 'villager' ? 0.9 : 0);
          const d = Math.hypot(ra.sprite.x - wx, ra.sprite.y - 8 - wy);
          if (d < bestD && Math.hypot(ra.rx - this.prx, ra.ry - this.pry) <= range) {
            bestD = d;
            if (ra.type === 'villager' && ra.vid !== undefined) { hitVillager = ra; hitAnimal = -1; } else { hitAnimal = id; hitVillager = null; }
          }
        }
        if (st && (st.type === 'crafting_table' || st.type === 'furnace' || st.type === 'forge' || st.type === 'chest' || st.type === 'boat' || st.type === 'bed') && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE) {
          this.structTarget = { id: st.id, type: st.type, x: pick.x, y: pick.y };
          this.app.canvas.style.cursor = 'pointer';
        } else if (hitVillager) {
          this.talkTarget = { id: hitVillager.vid!, x: hitVillager.rx, y: hitVillager.ry };
          this.app.canvas.style.cursor = 'pointer';
        } else if (hitAnimal >= 0) {
          next = { kind: 'animal', id: hitAnimal };
          this.app.canvas.style.cursor = 'pointer';
        } else if (this.villageBeds.has(pick.x + ',' + pick.y) && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE + 0.6) {
          this.sleepTarget = { x: pick.x, y: pick.y };
          this.app.canvas.style.cursor = 'pointer';
        } else {
          {
            const key = this.nodeKey(pick.x, pick.y);
            const nk = this.nodeKindAtL(pick.x, pick.y);
            if (!this.depleted.has(key) && nk && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE) { next = { kind: 'node', x: pick.x, y: pick.y }; this.targetNodeKind = nk; }
            else if (this.canDig(pick.x, pick.y) && Math.hypot(pick.x - this.prx, pick.y - this.pry) <= INTERACT_RANGE) next = { kind: 'block', x: pick.x, y: pick.y };
          }
          this.app.canvas.style.cursor = next ? 'pointer' : 'default';
        }
      }
    }
    this.target = next;
    // Cursor según el objetivo: hacha (árbol), pico (mineral), espada (mob).
    if (next?.kind === 'animal') this.app.canvas.style.cursor = this.cursorSword;
    else if (next?.kind === 'node') this.app.canvas.style.cursor = this.targetNodeKind === 'tree' ? this.cursorAxe : this.cursorPick;

    this.highlight.clear();
    this.harvestBar.clear();
    if (next) {
      let hx = 0, hy = 0, hl = 0;
      if (next.kind === 'node' || next.kind === 'block') { hx = next.x; hy = next.y; hl = this.elevAtL(next.x, next.y) * MAX_ELEV_PX; }
      else { const ra = this.animals.get(next.id); if (ra) { hx = ra.rx; hy = ra.ry; hl = this.elevAtL(ra.rx, ra.ry) * MAX_ELEV_PX; } }
      const s = gridToScreen(hx, hy), hw = TILE_W / 2, hh = TILE_H / 2, yy = s.y - hl;
      const hc = next.kind === 'animal' ? 0xff6b6b : next.kind === 'block' ? 0xe8e8e8 : 0xf5c96b;
      this.highlight.poly([s.x, yy - hh, s.x + hw, yy, s.x, yy + hh, s.x - hw, yy]).stroke({ width: 2, color: hc, alpha: 0.95 });
      // Barra de progreso de picado (estilo Minecraft) por encima del objetivo.
      if (this.harvestActive && this.harvestProgress > 0) {
        const bw = TILE_W * 0.82, bh = 5, bx = s.x - bw / 2, by = yy - hh - 14;
        const p = Math.min(1, this.harvestProgress);
        this.harvestBar.rect(bx - 1, by - 1, bw + 2, bh + 2).fill({ color: 0x101014, alpha: 0.72 });
        this.harvestBar.rect(bx, by, bw, bh).fill({ color: 0x3a3a42 });
        this.harvestBar.rect(bx, by, bw * p, bh).fill({ color: p >= 0.999 ? 0x8bf58b : 0x7ad14a });
      }
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
