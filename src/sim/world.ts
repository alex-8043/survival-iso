// Simulación autoritativa (headless) con bitECS. Mundo infinito determinista.

import { createWorld, addEntity, addComponent, defineComponent, Types } from 'bitecs';
import {
  PLAYER_SPEED,
  SPRINT_MULT,
  WATER_SLOW,
  BOAT_MULT,
  INTERACT_RANGE,
  HARVEST_COOLDOWN,
  DAY_LENGTH_S,
  FOOD_DECAY,
  THIRST_DECAY,
  STARVE_DAMAGE,
  STAMINA_DRAIN,
  STAMINA_REGEN,
  STAMINA_LOW,
  HEALTH_REGEN,
  ANIMAL_CAP,
  SPAWN_RADIUS,
  ANIMAL_SPAWN_S,
  CAVE_MOB_CAP,
  CAVE_MOB_SPAWN_S,
  SAVE_VERSION,
} from '../shared/constants';
import { hash2 } from '../shared/noise';
import { tileAt, levelAt, nodeAt, isWater, playerBlocked, caveTile, caveNodeAt, caveSeedFor, caveEntranceAt, caveSizeFor, springAt, TERRAIN } from '../shared/worldgen';
import type { NodeKind } from '../shared/worldgen';
import { NODE_KINDS, ANIMAL_DROPS, ANIMAL_TYPES, CAVE_MOBS, ANIMAL_INFO, ITEMS, toolFor } from '../shared/items';
import type { AnimalType } from '../shared/items';
import { recipeById } from '../shared/recipes';
import { SELL, BUY, questFor } from '../shared/trades';
import { type Slot, INV_SIZE, INV_MAIN, CHEST_SIZE, makeSlots, addTo, takeFrom, countIn, slotCounts, moveSlot, sortRange, cloneSlots } from '../shared/inventory';
import type { InputState, InteractTarget, Stats, AnimalSnap, TimeInfo, InvAddr, SaveState, Structure, Location } from '../shared/protocol';

export const Position = defineComponent({ x: Types.f32, y: Types.f32 });

export interface Animal {
  id: number; type: AnimalType; x: number; y: number; tx: number; ty: number; wait: number; health: number; alive: boolean; layer: Location;
}
export interface Floater { text: string; color: number; x: number; y: number; }

export interface Sim {
  world: ReturnType<typeof createWorld>;
  playerId: number;
  seed: number;
  input: InputState;
  interactActive: boolean;
  interactTarget: InteractTarget;
  activeTool: string | null;
  harvestTimer: number;
  harvested: Map<string, number>;
  depleted: Set<string>;
  structures: Structure[];
  nextStructId: number;
  animals: Animal[];
  nextAnimalId: number;
  spawnTimer: number;
  caveMobTimer: number;
  inv: Slot[];
  chests: Record<number, Slot[]>;
  stats: Stats;
  timeS: number;
  tick: number;
  location: Location;
  caveSeed: number;
  surfaceReturn: { x: number; y: number } | null;
  caveEntrance: { x: number; y: number } | null;
  riding: boolean;
  acceptedQuests: number[];
}

export interface StepResult {
  floaters: Floater[];
  harvestEvents: { x: number; y: number; depleted: boolean }[];
  inventoryChanged: boolean;
}

const keyOf = (x: number, y: number) => x + ',' + y;

// Nodo activo según la capa (superficie o cueva).
function activeNodeAt(sim: Sim, x: number, y: number): NodeKind | null {
  return sim.location === 'cave' ? caveNodeAt(x, y, sim.caveSeed) : nodeAt(x, y, sim.seed);
}
// Clave de recolección con prefijo de capa (evita colisiones superficie/cueva).
function nodeKeyOf(sim: Sim, x: number, y: number): string {
  return sim.location === 'cave' ? 'c' + sim.caveSeed + ':' + x + ',' + y : keyOf(x, y);
}
// ¿El jugador está sobre una entrada (superficie) o la salida (cueva)?
export function onEntranceOf(sim: Sim): boolean {
  const px = Position.x[sim.playerId], py = Position.y[sim.playerId];
  if (sim.location === 'cave') return Math.hypot(px, py) <= 1.4; // salida en el centro
  return caveEntranceAt(Math.round(px), Math.round(py), sim.seed);
}

function baseSim(seed: number, spawn: { x: number; y: number }): Sim {
  const world = createWorld();
  const playerId = addEntity(world);
  addComponent(world, Position, playerId);
  Position.x[playerId] = spawn.x;
  Position.y[playerId] = spawn.y;
  return {
    world, playerId, seed,
    input: { up: false, down: false, left: false, right: false, sprint: false },
    interactActive: false, interactTarget: null, activeTool: null,
    harvestTimer: 0, harvested: new Map(), depleted: new Set(),
    structures: [], nextStructId: 1,
    animals: [], nextAnimalId: 1, spawnTimer: 0, caveMobTimer: 0,
    inv: makeSlots(INV_SIZE), chests: {},
    stats: { health: 100, food: 100, thirst: 100, stamina: 100 },
    timeS: DAY_LENGTH_S * 0.3, tick: 0,
    location: 'surface', caveSeed: 0, surfaceReturn: null, caveEntrance: null, riding: false,
    acceptedQuests: [],
  };
}

export function createSim(seed: number): Sim {
  const sim = baseSim(seed, findSpawn(seed));
  for (let i = 0; i < 4; i++) trySpawnAnimal(sim);
  return sim;
}

export function createSimFromSave(save: SaveState): Sim {
  const sim = baseSim(save.seed, { x: save.px, y: save.py });
  sim.timeS = save.timeS;
  sim.stats = { ...save.stats };
  if (save.inv) {
    sim.inv = save.inv.slice(0, INV_SIZE);
    while (sim.inv.length < INV_SIZE) sim.inv.push(null);
  } else if (save.inventory) {
    for (const e of save.inventory) addItem(sim, e.id, e.count); // convierte formato antiguo
  }
  if (save.chests) for (const [id, items] of save.chests) sim.chests[id] = items;
  sim.harvested = new Map(save.harvested);
  sim.depleted = new Set(save.depleted);
  sim.structures = save.structures ? save.structures.map((s) => ({ ...s })) : [];
  sim.nextStructId = sim.structures.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  sim.location = save.loc ?? 'surface';
  sim.caveSeed = save.caveSeed ?? 0;
  sim.surfaceReturn = save.surfaceReturn ?? null;
  sim.caveEntrance = save.caveEntrance ?? null;
  sim.riding = save.riding ?? false;
  sim.acceptedQuests = save.acceptedQuests ? [...save.acceptedQuests] : [];
  if (sim.location === 'surface') for (let i = 0; i < 4; i++) trySpawnAnimal(sim);
  return sim;
}

export function serializeSim(sim: Sim): SaveState {
  return {
    version: SAVE_VERSION, seed: sim.seed,
    px: Position.x[sim.playerId], py: Position.y[sim.playerId],
    timeS: sim.timeS, stats: { ...sim.stats },
    inv: cloneSlots(sim.inv),
    chests: Object.keys(sim.chests).map((k) => [Number(k), cloneSlots(sim.chests[Number(k)])] as [number, Slot[]]),
    harvested: [...sim.harvested.entries()], depleted: [...sim.depleted],
    structures: sim.structures.map((s) => ({ ...s })),
    loc: sim.location, caveSeed: sim.caveSeed,
    surfaceReturn: sim.surfaceReturn ?? undefined,
    caveEntrance: sim.caveEntrance ?? undefined,
    riding: sim.riding,
    acceptedQuests: [...sim.acceptedQuests],
  };
}

function findSpawn(seed: number): { x: number; y: number } {
  for (let r = 0; r < 300; r++) {
    const x = Math.round((hash2(r, 7, seed) - 0.5) * 60);
    const y = Math.round((hash2(r, 13, seed) - 0.5) * 60);
    if (tileAt(x, y, seed).passable && !nodeAt(x, y, seed)) return { x, y };
  }
  return { x: 0, y: 0 };
}

function nodeAmount(sim: Sim, x: number, y: number, kind: NodeKind): number {
  const k = nodeKeyOf(sim, x, y);
  if (sim.depleted.has(k)) return 0;
  const stored = sim.harvested.get(k);
  return stored !== undefined ? stored : NODE_KINDS[kind].amount;
}

function invCount(sim: Sim, id: string): number { return countIn(sim.inv, id); }

// Añade ítems: herramientas/colocables prefieren la hotbar; el resto, el inventario principal.
function addItem(sim: Sim, item: string, n: number): void {
  const d = ITEMS[item];
  const preferHotbar = !!(d && (d.tool || d.boat || d.place));
  if (preferHotbar) { n = addTo(sim.inv, item, n, INV_MAIN, INV_SIZE); if (n > 0) addTo(sim.inv, item, n, 0, INV_MAIN); }
  else { n = addTo(sim.inv, item, n, 0, INV_MAIN); if (n > 0) addTo(sim.inv, item, n, INV_MAIN, INV_SIZE); }
}

function structureAt(sim: Sim, x: number, y: number): Structure | undefined {
  return sim.structures.find((s) => s.x === x && s.y === y);
}

function blockedAt(sim: Sim, x: number, y: number): boolean {
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (sim.location === 'cave') return !caveTile(tx, ty, sim.caveSeed).passable; // muro/lava/agua
  if (springAt(tx, ty, sim.seed)) return true; // no se camina sobre el manantial
  const s = structureAt(sim, tx, ty);
  if (s && ITEMS[s.type]?.solid) return true;
  const c = tileAt(tx, ty, sim.seed);
  if (c.water) return false; // se puede nadar
  // Colisión por altura: sólo se sube 1 bloque (salto de 1 m).
  const pl = levelAt(Math.round(Position.x[sim.playerId]), Math.round(Position.y[sim.playerId]), sim.seed);
  return c.level - pl >= 2;
}

function layerCount(sim: Sim, layer: Location): number {
  let n = 0;
  for (const a of sim.animals) if (a.layer === layer) n++;
  return n;
}

function trySpawnAnimal(sim: Sim): void {
  if (layerCount(sim, 'surface') >= ANIMAL_CAP) return;
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  for (let a = 0; a < 12; a++) {
    const ang = hash2(sim.nextAnimalId * 3 + a, sim.tick + a, sim.seed) * Math.PI * 2;
    const dist = SPAWN_RADIUS * 0.6 + hash2(a, sim.nextAnimalId, sim.seed) * SPAWN_RADIUS * 0.4;
    const x = Math.round(px + Math.cos(ang) * dist);
    const y = Math.round(py + Math.sin(ang) * dist);
    const t = tileAt(x, y, sim.seed);
    if (!t.passable || isWater(t.terrain)) continue;
    let type: AnimalType;
    if (t.terrain === TERRAIN.SWAMP) type = 'frog';
    else if (t.terrain === TERRAIN.JUNGLE) type = 'monkey';
    else if (t.terrain === TERRAIN.DESERT || t.terrain === TERRAIN.SNOW) continue; // biomas sin ganado
    else type = ANIMAL_TYPES[Math.floor(hash2(x, y, (sim.seed ^ 0xabc) | 0) * ANIMAL_TYPES.length)];
    sim.animals.push({ id: sim.nextAnimalId++, type, x, y, tx: x, ty: y, wait: hash2(x, y, 7) * 2, health: ANIMAL_INFO[type].health, alive: true, layer: 'surface' });
    return;
  }
}

function trySpawnCaveMob(sim: Sim): void {
  if (layerCount(sim, 'cave') >= CAVE_MOB_CAP) return;
  if (hash2(sim.tick, 3, (sim.caveSeed ^ 0x1) | 0) > 0.45) return; // aparición esporádica
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  const size = caveSizeFor(sim.caveSeed);
  for (let a = 0; a < 16; a++) {
    const ang = hash2(sim.nextAnimalId * 5 + a, sim.tick + a * 3, sim.caveSeed) * Math.PI * 2;
    const dist = 5 + hash2(a, sim.nextAnimalId, sim.caveSeed) * Math.max(4, size - 8);
    const x = Math.round(px + Math.cos(ang) * dist);
    const y = Math.round(py + Math.sin(ang) * dist);
    if (!caveTile(x, y, sim.caveSeed).passable || caveNodeAt(x, y, sim.caveSeed)) continue;
    const type = CAVE_MOBS[Math.floor(hash2(x, y, (sim.caveSeed ^ 0xbad) | 0) * CAVE_MOBS.length)];
    sim.animals.push({ id: sim.nextAnimalId++, type, x, y, tx: x, ty: y, wait: hash2(x, y, 5) * 1.5, health: ANIMAL_INFO[type].health, alive: true, layer: 'cave' });
    return;
  }
}

// Expuesto para pruebas: ¿está bloqueado el destino desde la posición actual?
export function isBlocked(sim: Sim, x: number, y: number): boolean { return blockedAt(sim, x, y); }

export function onWaterOf(sim: Sim): boolean {
  if (sim.location === 'cave') return false;
  return isWater(tileAt(Math.round(Position.x[sim.playerId]), Math.round(Position.y[sim.playerId]), sim.seed).terrain);
}

export function stepSim(sim: Sim, dt: number): StepResult {
  const res: StepResult = { floaters: [], harvestEvents: [], inventoryChanged: false };
  const eid = sim.playerId;
  sim.timeS += dt;

  const inp = sim.input;
  let gx = 0, gy = 0;
  if (inp.up) { gx -= 1; gy -= 1; }
  if (inp.down) { gx += 1; gy += 1; }
  if (inp.left) { gx -= 1; gy += 1; }
  if (inp.right) { gx += 1; gy -= 1; }
  const moving = gx !== 0 || gy !== 0;
  const sprinting = inp.sprint && moving && sim.stats.stamina > 1;
  let px = Position.x[eid];
  let py = Position.y[eid];
  const onWater = sim.location !== 'cave' && isWater(tileAt(Math.round(px), Math.round(py), sim.seed).terrain);
  const waterFactor = onWater ? (sim.riding ? BOAT_MULT : WATER_SLOW) : 1;
  const speed = PLAYER_SPEED * (sprinting ? SPRINT_MULT : 1) * waterFactor;
  const len = Math.hypot(gx, gy) || 1;
  const vx = moving ? (gx / len) * speed : 0;
  const vy = moving ? (gy / len) * speed : 0;
  const nx = px + vx * dt;
  if (!blockedAt(sim, nx, py)) px = nx;
  const ny = py + vy * dt;
  if (!blockedAt(sim, px, ny)) py = ny;
  Position.x[eid] = px;
  Position.y[eid] = py;

  // Bajarse de la barca al llegar a tierra (devuelve la barca al inventario).
  if (sim.riding && !(sim.location !== 'cave' && isWater(tileAt(Math.round(px), Math.round(py), sim.seed).terrain))) {
    sim.riding = false;
    addItem(sim, 'boat', 1);
    res.inventoryChanged = true;
    res.floaters.push({ text: 'Te bajas de la barca', color: 0x9edb8a, x: px, y: py });
  }

  const lowEnergy = sim.stats.food < STAMINA_LOW || sim.stats.thirst < STAMINA_LOW;
  if (sprinting) sim.stats.stamina = Math.max(0, sim.stats.stamina - STAMINA_DRAIN * dt);
  else if (!lowEnergy) sim.stats.stamina = Math.min(100, sim.stats.stamina + STAMINA_REGEN * dt);

  sim.stats.food = Math.max(0, sim.stats.food - FOOD_DECAY * dt);
  sim.stats.thirst = Math.max(0, sim.stats.thirst - THIRST_DECAY * dt);
  if (sim.stats.food <= 0 || sim.stats.thirst <= 0) sim.stats.health = Math.max(0, sim.stats.health - STARVE_DAMAGE * dt);
  else if (sim.stats.health < 100) sim.stats.health = Math.min(100, sim.stats.health + HEALTH_REGEN * dt);

  if (sim.interactActive && sim.interactTarget) {
    if (sim.harvestTimer <= 0) {
      const cd = doInteract(sim, res, px, py);
      if (cd > 0) sim.harvestTimer = cd;
    } else sim.harvestTimer -= dt;
  } else sim.harvestTimer = 0;

  updateAnimals(sim, dt);
  if (sim.location === 'cave') {
    sim.caveMobTimer -= dt;
    if (sim.caveMobTimer <= 0) { sim.caveMobTimer = CAVE_MOB_SPAWN_S; despawnFar(sim); trySpawnCaveMob(sim); }
  } else {
    sim.spawnTimer -= dt;
    if (sim.spawnTimer <= 0) { sim.spawnTimer = ANIMAL_SPAWN_S; despawnFar(sim); trySpawnAnimal(sim); }
  }

  sim.tick++;
  return res;
}

// Entra a la cueva (si estás sobre una entrada) o sale (si estás en la salida).
export function toggleCave(sim: Sim, res: StepResult): void {
  const px = Position.x[sim.playerId], py = Position.y[sim.playerId];
  if (sim.location === 'surface') {
    const ex = Math.round(px), ey = Math.round(py);
    if (!caveEntranceAt(ex, ey, sim.seed)) {
      res.floaters.push({ text: 'No hay ninguna entrada aquí', color: 0xff8a8a, x: px, y: py });
      return;
    }
    sim.surfaceReturn = { x: px, y: py };
    sim.caveEntrance = { x: ex, y: ey };
    sim.caveSeed = caveSeedFor(ex, ey, sim.seed);
    sim.location = 'cave';
    Position.x[sim.playerId] = 0;
    Position.y[sim.playerId] = 0;
    sim.animals = sim.animals.filter((a) => a.layer === 'surface');
    sim.caveMobTimer = 2;
    sim.interactActive = false; sim.interactTarget = null; sim.harvestTimer = 0;
    res.floaters.push({ text: 'Entras a la cueva', color: 0xd8c48a, x: 0, y: 0 });
  } else {
    if (Math.hypot(px, py) > 1.4) {
      res.floaters.push({ text: 'Ve a la salida (centro) para salir', color: 0xff8a8a, x: px, y: py });
      return;
    }
    const back = sim.surfaceReturn ?? sim.caveEntrance ?? { x: 0, y: 0 };
    sim.location = 'surface';
    Position.x[sim.playerId] = back.x;
    Position.y[sim.playerId] = back.y;
    sim.animals = sim.animals.filter((a) => a.layer === 'surface');
    sim.interactActive = false; sim.interactTarget = null; sim.harvestTimer = 0;
    res.floaters.push({ text: 'Sales a la superficie', color: 0x9edb8a, x: back.x, y: back.y });
  }
}

function doInteract(sim: Sim, res: StepResult, px: number, py: number): number {
  const tgt = sim.interactTarget!;
  if (tgt.kind === 'node') {
    if (Math.hypot(tgt.x - px, tgt.y - py) > INTERACT_RANGE) return 0;
    const kind = activeNodeAt(sim, tgt.x, tgt.y);
    if (!kind) return 0;
    const tool = toolFor(sim.activeTool);
    // La piedra y el carbón exigen un pico (progresión).
    if ((kind === 'rock' || kind === 'coal') && !(tool && tool.kind === 'pickaxe')) {
      res.floaters.push({ text: 'Necesitas un pico', color: 0xff8a8a, x: tgt.x, y: tgt.y });
      return HARVEST_COOLDOWN * 2;
    }
    // El hierro exige pico de piedra o mejor.
    if (kind === 'iron' && !(tool && tool.kind === 'pickaxe' && tool.tier >= 2)) {
      res.floaters.push({ text: 'Necesitas pico de piedra', color: 0xff8a8a, x: tgt.x, y: tgt.y });
      return HARVEST_COOLDOWN * 2;
    }
    // El oro y el diamante exigen pico de hierro o mejor.
    if ((kind === 'gold' || kind === 'diamond') && !(tool && tool.kind === 'pickaxe' && tool.tier >= 3)) {
      res.floaters.push({ text: 'Necesitas pico de hierro', color: 0xff8a8a, x: tgt.x, y: tgt.y });
      return HARVEST_COOLDOWN * 2;
    }
    let amt = nodeAmount(sim, tgt.x, tgt.y, kind);
    if (amt <= 0) return 0;
    amt -= 1;
    const k = nodeKeyOf(sim, tgt.x, tgt.y);
    sim.harvested.set(k, amt);
    const item = NODE_KINDS[kind].item;
    addItem(sim, item, 1);
    res.inventoryChanged = true;
    const depleted = amt <= 0;
    if (depleted) sim.depleted.add(k);
    res.harvestEvents.push({ x: tgt.x, y: tgt.y, depleted });
    const fast = tool && ((kind === 'tree' && tool.kind === 'axe') || (kind !== 'tree' && tool.kind === 'pickaxe'));
    return fast ? HARVEST_COOLDOWN / tool!.speed : HARVEST_COOLDOWN;
  }

  const an = sim.animals.find((a) => a.id === tgt.id && a.alive);
  if (!an) return 0;
  if (Math.hypot(an.x - px, an.y - py) > INTERACT_RANGE) return 0;
  const tool = toolFor(sim.activeTool);
  const dmg = tool && tool.kind === 'sword' ? tool.tier : 1;
  an.health -= dmg;
  an.tx = an.x + (an.x - px) * 0.4;
  an.ty = an.y + (an.y - py) * 0.4;
  an.wait = 0.8;
  if (an.health <= 0) {
    an.alive = false;
    for (const drop of ANIMAL_DROPS[an.type]) {
      const span = drop.max - drop.min + 1;
      const n = drop.min + Math.floor(hash2(an.id, drop.min, sim.seed) * span);
      if (n > 0) addItem(sim, drop.item, n);
    }
    res.inventoryChanged = true;
  } else {
    res.floaters.push({ text: '!', color: 0xff5555, x: an.x, y: an.y });
  }
  return HARVEST_COOLDOWN;
}

function updateAnimals(sim: Sim, dt: number): void {
  for (const a of sim.animals) {
    if (!a.alive || a.layer !== sim.location) continue; // sólo la capa activa se mueve
    const rng = a.type === 'bat' ? 9 : 6;
    a.wait -= dt;
    if (a.wait <= 0 && Math.abs(a.x - a.tx) < 0.2 && Math.abs(a.y - a.ty) < 0.2) {
      a.wait = (a.type === 'bat' ? 0.4 : 1) + hash2(a.id, sim.tick, sim.seed) * 3;
      a.tx = a.x + (hash2(a.id, sim.tick + 1, sim.seed) - 0.5) * rng;
      a.ty = a.y + (hash2(a.id, sim.tick + 2, sim.seed) - 0.5) * rng;
    }
    const dx = a.tx - a.x, dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.1) {
      const step = Math.min(d, ANIMAL_INFO[a.type].speed * dt);
      const nx = a.x + (dx / d) * step;
      const ny = a.y + (dy / d) * step;
      const passable = a.layer === 'cave'
        ? caveTile(Math.round(nx), Math.round(ny), sim.caveSeed).passable
        : tileAt(Math.round(nx), Math.round(ny), sim.seed).passable;
      if (passable) { a.x = nx; a.y = ny; }
      else { a.tx = a.x; a.ty = a.y; }
    }
  }
  sim.animals = sim.animals.filter((a) => a.alive);
}

function despawnFar(sim: Sim): void {
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  sim.animals = sim.animals.filter((a) => a.layer !== sim.location || Math.hypot(a.x - px, a.y - py) < SPAWN_RADIUS * 1.7);
}

function hasStationNear(sim: Sim, type: string): boolean {
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  return sim.structures.some((s) => s.type === type && Math.hypot(s.x - px, s.y - py) <= 4);
}

export function craft(sim: Sim, id: string): { ok: boolean; floater?: Floater } {
  const r = recipeById(id);
  if (!r) return { ok: false };
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  for (const k of Object.keys(r.ingredients)) {
    if (invCount(sim, k) < r.ingredients[k]) return { ok: false };
  }
  if (r.station && !hasStationNear(sim, r.station)) {
    return { ok: false, floater: { text: 'Necesitas: ' + ITEMS[r.station].name + ' cerca', color: 0xff8a8a, x: px, y: py } };
  }
  for (const k of Object.keys(r.ingredients)) takeFrom(sim.inv, k, r.ingredients[k]);
  addItem(sim, r.out.item, r.out.count);
  return { ok: true };
}

export function place(sim: Sim, item: string, x: number, y: number): { ok: boolean; floater?: Floater } {
  const def = ITEMS[item];
  if (!def || !def.place || invCount(sim, item) <= 0) return { ok: false };
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  if (sim.location === 'cave') return { ok: false, floater: { text: 'No puedes construir en la cueva', color: 0xff8a8a, x: px, y: py } };
  if (Math.hypot(x - px, y - py) > 4.5) return { ok: false };
  const terr = tileAt(x, y, sim.seed).terrain;
  if (def.place === 'boat') {
    if (!isWater(terr)) return { ok: false, floater: { text: 'La barca va en el agua', color: 0xff8a8a, x: px, y: py } };
  } else if (isWater(terr) || playerBlocked(terr)) return { ok: false };
  if (structureAt(sim, x, y)) return { ok: false };
  if (Math.round(px) === x && Math.round(py) === y) return { ok: false };
  takeFrom(sim.inv, item, 1);
  const id = sim.nextStructId++;
  sim.structures.push({ id, type: item, x, y });
  if (def.place === 'container') sim.chests[id] = makeSlots(CHEST_SIZE);
  return { ok: true };
}

// Subirse a una barca colocada: la quita del mundo y activa el modo barca.
export function board(sim: Sim, id: number): { floater?: Floater } {
  const s = sim.structures.find((st) => st.id === id && st.type === 'boat');
  if (!s) return {};
  sim.structures = sim.structures.filter((st) => st.id !== id);
  sim.riding = true;
  Position.x[sim.playerId] = s.x;
  Position.y[sim.playerId] = s.y;
  return { floater: { text: 'Subes a la barca', color: 0x9edb8a, x: s.x, y: s.y } };
}

// Dormir: de noche adelanta el tiempo hasta el amanecer.
export function sleep(sim: Sim): { ok: boolean; floater?: Floater } {
  const px = Position.x[sim.playerId], py = Position.y[sim.playerId];
  const tod = (sim.timeS % DAY_LENGTH_S) / DAY_LENGTH_S;
  if (tod >= 0.27 && tod <= 0.72) return { ok: false, floater: { text: 'Solo puedes dormir de noche', color: 0xffd05a, x: px, y: py } };
  const cur = sim.timeS % DAY_LENGTH_S, base = sim.timeS - cur, morning = 0.3 * DAY_LENGTH_S;
  sim.timeS = cur < morning ? base + morning : base + DAY_LENGTH_S + morning;
  sim.stats.stamina = 100;
  return { ok: true, floater: { text: 'Duermes hasta el amanecer', color: 0x9edb8a, x: px, y: py } };
}

// Comercio con aldeanos (compra/venta por monedas).
export function trade(sim: Sim, action: 'buy' | 'sell', item: string): { ok: boolean; floater?: Floater } {
  const px = Position.x[sim.playerId], py = Position.y[sim.playerId];
  if (action === 'sell') {
    const price = SELL[item];
    if (!price || invCount(sim, item) <= 0) return { ok: false };
    takeFrom(sim.inv, item, 1); addItem(sim, 'coin', price);
    return { ok: true };
  }
  const price = BUY[item];
  if (!price) return { ok: false };
  if (invCount(sim, 'coin') < price) return { ok: false, floater: { text: 'No tienes monedas', color: 0xff8a8a, x: px, y: py } };
  takeFrom(sim.inv, 'coin', price); addItem(sim, item, 1);
  return { ok: true };
}

export function acceptQuest(sim: Sim, id: number): void {
  if (!sim.acceptedQuests.includes(id)) sim.acceptedQuests.push(id);
}
export function completeQuest(sim: Sim, id: number): { ok: boolean; floater?: Floater } {
  const px = Position.x[sim.playerId], py = Position.y[sim.playerId];
  if (!sim.acceptedQuests.includes(id)) return { ok: false };
  const q = questFor(id);
  if (invCount(sim, q.item) < q.count) return { ok: false, floater: { text: 'Te faltan ' + (q.count - invCount(sim, q.item)) + ' ' + (ITEMS[q.item]?.name || q.item), color: 0xff8a8a, x: px, y: py } };
  takeFrom(sim.inv, q.item, q.count); addItem(sim, 'coin', q.reward);
  sim.acceptedQuests = sim.acceptedQuests.filter((v) => v !== id);
  return { ok: true, floater: { text: '+' + q.reward + ' monedas', color: 0xf2cf5a, x: px, y: py } };
}

export function consume(sim: Sim, item: string): { ok: boolean; floater?: Floater } {
  const def = ITEMS[item];
  const px = Position.x[sim.playerId], py = Position.y[sim.playerId];
  if (!def || !def.food || invCount(sim, item) <= 0) return { ok: false };
  if (sim.stats.food >= 99.5) return { ok: false, floater: { text: 'Estás lleno', color: 0xffd05a, x: px, y: py } };
  takeFrom(sim.inv, item, 1);
  sim.stats.food = Math.min(100, sim.stats.food + def.food);
  return { ok: true };
}

// Devuelve el mejor alimento disponible (cocinado antes que crudo).
export function bestFood(sim: Sim): string | null {
  const order = ['cooked_meat', 'meat'];
  for (const id of order) if (invCount(sim, id) > 0) return id;
  const counts = slotCounts(sim.inv);
  for (const id of Object.keys(counts)) if (ITEMS[id]?.food && counts[id] > 0) return id;
  return null;
}

// --- Movimiento / orden de ranuras y cofres ---
function slotsOf(sim: Sim, addr: InvAddr): Slot[] | null {
  if (addr.c === 'inv') return sim.inv;
  return sim.chests[addr.id] ?? null;
}
export function moveItem(sim: Sim, from: InvAddr, to: InvAddr): void {
  const a = slotsOf(sim, from), b = slotsOf(sim, to);
  if (!a || !b) return;
  if (from.i < 0 || from.i >= a.length || to.i < 0 || to.i >= b.length) return;
  moveSlot(a, from.i, b, to.i);
}
export function sortInv(sim: Sim): void { sortRange(sim.inv, 0, INV_MAIN); }
export function sortChest(sim: Sim, id: number): void { const c = sim.chests[id]; if (c) sortRange(c, 0, c.length); }
export function chestItems(sim: Sim, id: number): Slot[] | null { return sim.chests[id] ?? null; }

// Traspaso rápido entre inventario y cofre (pila entera o cantidad concreta).
export function quickMove(sim: Sim, from: InvAddr, chestId: number): void {
  moveAmount(sim, from, chestId, 1e9);
}
export function moveAmount(sim: Sim, from: InvAddr, chestId: number, amount: number): void {
  const src = from.c === 'inv' ? sim.inv : sim.chests[from.id];
  const dest = from.c === 'inv' ? sim.chests[chestId] : sim.inv;
  if (!src || !dest) return;
  const s = src[from.i];
  if (!s) return;
  const n = Math.max(0, Math.min(Math.floor(amount), s.count));
  if (n <= 0) return;
  const left = addTo(dest, s.id, n);
  const moved = n - left;
  s.count -= moved;
  if (s.count <= 0) src[from.i] = null;
}

export function drink(sim: Sim): { ok: boolean; floater?: Floater } {
  const px = Math.round(Position.x[sim.playerId]);
  const py = Math.round(Position.y[sim.playerId]);
  const fx = Position.x[sim.playerId], fy = Position.y[sim.playerId];
  // Agua potable: manantial (superficie) o charca de cueva.
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const tx = px + ox, ty = py + oy;
    const potable = sim.location === 'cave' ? caveTile(tx, ty, sim.caveSeed).kind === 'water' : springAt(tx, ty, sim.seed);
    if (potable) { sim.stats.thirst = Math.min(100, sim.stats.thirst + 32); return { ok: true, floater: { text: '+ Sed', color: 0x6ad0ff, x: fx, y: fy } }; }
  }
  // Agua de mar: salada, hace daño.
  if (sim.location !== 'cave') for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    if (isWater(tileAt(px + ox, py + oy, sim.seed).terrain)) {
      sim.stats.health = Math.max(0, sim.stats.health - 4);
      return { ok: true, floater: { text: '¡Agua salada! -vida', color: 0xff6a6a, x: fx, y: fy } };
    }
  }
  return { ok: false };
}

export function timeInfo(sim: Sim): TimeInfo {
  return { day: Math.floor(sim.timeS / DAY_LENGTH_S) + 1, tod: (sim.timeS % DAY_LENGTH_S) / DAY_LENGTH_S };
}
export function animalSnaps(sim: Sim): AnimalSnap[] {
  return sim.animals.filter((a) => a.layer === sim.location).map((a) => ({ id: a.id, type: a.type, x: a.x, y: a.y, alive: a.alive }));
}
export function invSlots(sim: Sim): Slot[] { return sim.inv; }
export function playerPos(sim: Sim): { x: number; y: number } {
  return { x: Position.x[sim.playerId], y: Position.y[sim.playerId] };
}
