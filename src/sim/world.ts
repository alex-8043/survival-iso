// Simulación autoritativa (headless) con bitECS. Mundo infinito determinista.

import { createWorld, addEntity, addComponent, defineComponent, Types } from 'bitecs';
import {
  PLAYER_SPEED,
  SPRINT_MULT,
  WATER_SLOW,
  INTERACT_RANGE,
  HARVEST_COOLDOWN,
  DAY_LENGTH_S,
  FOOD_DECAY,
  THIRST_DECAY,
  STARVE_DAMAGE,
  STAMINA_DRAIN,
  STAMINA_REGEN,
  HEALTH_REGEN,
  ANIMAL_CAP,
  SPAWN_RADIUS,
  ANIMAL_SPAWN_S,
  CAVE_MOB_CAP,
  CAVE_MOB_SPAWN_S,
  SAVE_VERSION,
} from '../shared/constants';
import { hash2 } from '../shared/noise';
import { tileAt, nodeAt, isWater, playerBlocked, caveTile, caveNodeAt, caveSeedFor, caveEntranceAt, springAt, CAVE_R } from '../shared/worldgen';
import type { NodeKind } from '../shared/worldgen';
import { NODE_KINDS, ANIMAL_DROPS, ANIMAL_TYPES, CAVE_MOBS, ANIMAL_INFO, ITEMS, toolFor } from '../shared/items';
import type { AnimalType } from '../shared/items';
import { recipeById } from '../shared/recipes';
import type { InputState, InteractTarget, Stats, AnimalSnap, TimeInfo, InvEntry, SaveState, Structure, Location } from '../shared/protocol';

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
  inventory: Record<string, number>;
  stats: Stats;
  timeS: number;
  tick: number;
  location: Location;
  caveSeed: number;
  surfaceReturn: { x: number; y: number } | null;
  caveEntrance: { x: number; y: number } | null;
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
    inventory: {}, stats: { health: 100, food: 100, thirst: 100, stamina: 100 },
    timeS: DAY_LENGTH_S * 0.3, tick: 0,
    location: 'surface', caveSeed: 0, surfaceReturn: null, caveEntrance: null,
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
  for (const e of save.inventory) sim.inventory[e.id] = e.count;
  sim.harvested = new Map(save.harvested);
  sim.depleted = new Set(save.depleted);
  sim.structures = save.structures ? save.structures.map((s) => ({ ...s })) : [];
  sim.nextStructId = sim.structures.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  sim.location = save.loc ?? 'surface';
  sim.caveSeed = save.caveSeed ?? 0;
  sim.surfaceReturn = save.surfaceReturn ?? null;
  sim.caveEntrance = save.caveEntrance ?? null;
  if (sim.location === 'surface') for (let i = 0; i < 4; i++) trySpawnAnimal(sim);
  return sim;
}

export function serializeSim(sim: Sim): SaveState {
  return {
    version: SAVE_VERSION, seed: sim.seed,
    px: Position.x[sim.playerId], py: Position.y[sim.playerId],
    timeS: sim.timeS, stats: { ...sim.stats },
    inventory: invEntries(sim.inventory),
    harvested: [...sim.harvested.entries()], depleted: [...sim.depleted],
    structures: sim.structures.map((s) => ({ ...s })),
    loc: sim.location, caveSeed: sim.caveSeed,
    surfaceReturn: sim.surfaceReturn ?? undefined,
    caveEntrance: sim.caveEntrance ?? undefined,
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

function addItem(sim: Sim, item: string, n: number): void {
  sim.inventory[item] = (sim.inventory[item] || 0) + n;
}

function structureAt(sim: Sim, x: number, y: number): Structure | undefined {
  return sim.structures.find((s) => s.x === x && s.y === y);
}

function blockedAt(sim: Sim, x: number, y: number): boolean {
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (sim.location === 'cave') return !caveTile(tx, ty, sim.caveSeed).passable; // muro/lava/agua
  if (playerBlocked(tileAt(tx, ty, sim.seed).terrain)) return true;
  if (springAt(tx, ty, sim.seed)) return true; // no se camina sobre el manantial
  const s = structureAt(sim, tx, ty);
  return !!(s && ITEMS[s.type]?.solid);
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
    const type = ANIMAL_TYPES[Math.floor(hash2(x, y, (sim.seed ^ 0xabc) | 0) * ANIMAL_TYPES.length)];
    sim.animals.push({ id: sim.nextAnimalId++, type, x, y, tx: x, ty: y, wait: hash2(x, y, 7) * 2, health: ANIMAL_INFO[type].health, alive: true, layer: 'surface' });
    return;
  }
}

function trySpawnCaveMob(sim: Sim): void {
  if (layerCount(sim, 'cave') >= CAVE_MOB_CAP) return;
  if (hash2(sim.tick, 3, (sim.caveSeed ^ 0x1) | 0) > 0.45) return; // aparición esporádica
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  for (let a = 0; a < 16; a++) {
    const ang = hash2(sim.nextAnimalId * 5 + a, sim.tick + a * 3, sim.caveSeed) * Math.PI * 2;
    const dist = 6 + hash2(a, sim.nextAnimalId, sim.caveSeed) * (CAVE_R - 9);
    const x = Math.round(px + Math.cos(ang) * dist);
    const y = Math.round(py + Math.sin(ang) * dist);
    if (!caveTile(x, y, sim.caveSeed).passable || caveNodeAt(x, y, sim.caveSeed)) continue;
    const type = CAVE_MOBS[Math.floor(hash2(x, y, (sim.caveSeed ^ 0xbad) | 0) * CAVE_MOBS.length)];
    sim.animals.push({ id: sim.nextAnimalId++, type, x, y, tx: x, ty: y, wait: hash2(x, y, 5) * 1.5, health: ANIMAL_INFO[type].health, alive: true, layer: 'cave' });
    return;
  }
}

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
  const hasBoat = (sim.inventory['boat'] || 0) > 0;
  const waterFactor = onWater ? (hasBoat ? 1.55 : WATER_SLOW) : 1;
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

  if (sprinting) sim.stats.stamina = Math.max(0, sim.stats.stamina - STAMINA_DRAIN * dt);
  else sim.stats.stamina = Math.min(100, sim.stats.stamina + STAMINA_REGEN * dt);

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
    // El hierro exige pico de piedra o mejor.
    if (kind === 'iron' && !(tool && tool.kind === 'pickaxe' && tool.tier >= 2)) {
      res.floaters.push({ text: 'Necesitas pico de piedra', color: 0xff8a8a, x: tgt.x, y: tgt.y });
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
    if ((sim.inventory[k] || 0) < r.ingredients[k]) return { ok: false };
  }
  if (r.station && !hasStationNear(sim, r.station)) {
    return { ok: false, floater: { text: 'Necesitas: ' + ITEMS[r.station].name + ' cerca', color: 0xff8a8a, x: px, y: py } };
  }
  for (const k of Object.keys(r.ingredients)) sim.inventory[k] -= r.ingredients[k];
  addItem(sim, r.out.item, r.out.count);
  return { ok: true };
}

export function place(sim: Sim, item: string, x: number, y: number): { ok: boolean; floater?: Floater } {
  const def = ITEMS[item];
  if (!def || !def.place || (sim.inventory[item] || 0) <= 0) return { ok: false };
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  if (sim.location === 'cave') return { ok: false, floater: { text: 'No puedes construir en la cueva', color: 0xff8a8a, x: px, y: py } };
  if (Math.hypot(x - px, y - py) > 4.5) return { ok: false };
  const terr = tileAt(x, y, sim.seed).terrain;
  if (isWater(terr) || playerBlocked(terr)) return { ok: false };
  if (structureAt(sim, x, y)) return { ok: false };
  if (Math.round(px) === x && Math.round(py) === y) return { ok: false };
  sim.inventory[item] -= 1;
  sim.structures.push({ id: sim.nextStructId++, type: item, x, y });
  return { ok: true };
}

export function consume(sim: Sim, item: string): { ok: boolean; floater?: Floater } {
  const def = ITEMS[item];
  const px = Position.x[sim.playerId], py = Position.y[sim.playerId];
  if (!def || !def.food || !(sim.inventory[item] > 0)) return { ok: false };
  if (sim.stats.food >= 99.5) return { ok: false, floater: { text: 'Estás lleno', color: 0xffd05a, x: px, y: py } };
  sim.inventory[item] -= 1;
  sim.stats.food = Math.min(100, sim.stats.food + def.food);
  return { ok: true };
}

// Devuelve el mejor alimento disponible (cocinado antes que crudo).
export function bestFood(sim: Sim): string | null {
  const order = ['cooked_meat', 'meat'];
  for (const id of order) if ((sim.inventory[id] || 0) > 0) return id;
  for (const id of Object.keys(sim.inventory)) if (ITEMS[id]?.food && sim.inventory[id] > 0) return id;
  return null;
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
export function invEntries(inv: Record<string, number>): InvEntry[] {
  return Object.keys(inv).filter((k) => inv[k] > 0).map((k) => ({ id: k, count: inv[k] }));
}
export function playerPos(sim: Sim): { x: number; y: number } {
  return { x: Position.x[sim.playerId], y: Position.y[sim.playerId] };
}
