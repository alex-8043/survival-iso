// Simulación autoritativa (headless) con bitECS. Mundo infinito determinista
// (no guarda tiles: los deriva de la semilla). No importa PixiJS ni el DOM.

import { createWorld, addEntity, addComponent, defineComponent, Types } from 'bitecs';
import {
  PLAYER_SPEED,
  SPRINT_MULT,
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
  ANIMAL_SPEED,
  ANIMAL_HEALTH,
  SPAWN_RADIUS,
} from '../shared/constants';
import { hash2 } from '../shared/noise';
import { tileAt, nodeAt, isWater } from '../shared/worldgen';
import { NODE_KINDS, ANIMAL_DROPS, ANIMAL_TYPES, ITEMS } from '../shared/items';
import type { AnimalType } from '../shared/items';
import type {
  InputState,
  InteractTarget,
  Stats,
  AnimalSnap,
  TimeInfo,
  InvEntry,
} from '../shared/protocol';

export const Position = defineComponent({ x: Types.f32, y: Types.f32 });

export interface Animal {
  id: number;
  type: AnimalType;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  health: number;
  alive: boolean;
}

export interface Floater {
  text: string;
  color: number;
  x: number;
  y: number;
}

export interface Sim {
  world: ReturnType<typeof createWorld>;
  playerId: number;
  seed: number;
  input: InputState;
  interactActive: boolean;
  interactTarget: InteractTarget;
  harvestTimer: number;
  harvested: Map<string, number>;
  depleted: Set<string>;
  animals: Animal[];
  nextAnimalId: number;
  spawnTimer: number;
  inventory: Record<string, number>;
  stats: Stats;
  timeS: number;
  tick: number;
}

export interface StepResult {
  floaters: Floater[];
  harvestEvents: { x: number; y: number; depleted: boolean }[];
  inventoryChanged: boolean;
}

const keyOf = (x: number, y: number) => x + ',' + y;

export function createSim(seed: number): Sim {
  const world = createWorld();
  const playerId = addEntity(world);
  addComponent(world, Position, playerId);
  const spawn = findSpawn(seed);
  Position.x[playerId] = spawn.x;
  Position.y[playerId] = spawn.y;

  const sim: Sim = {
    world,
    playerId,
    seed,
    input: { up: false, down: false, left: false, right: false, sprint: false },
    interactActive: false,
    interactTarget: null,
    harvestTimer: 0,
    harvested: new Map(),
    depleted: new Set(),
    animals: [],
    nextAnimalId: 1,
    spawnTimer: 0,
    inventory: {},
    stats: { health: 100, food: 100, thirst: 100, stamina: 100 },
    timeS: DAY_LENGTH_S * 0.3, // arranca de mañana
    tick: 0,
  };

  for (let i = 0; i < 8; i++) trySpawnAnimal(sim);
  return sim;
}

function findSpawn(seed: number): { x: number; y: number } {
  for (let r = 0; r < 300; r++) {
    const x = Math.round((hash2(r, 7, seed) - 0.5) * 60);
    const y = Math.round((hash2(r, 13, seed) - 0.5) * 60);
    if (tileAt(x, y, seed).passable && !nodeAt(x, y, seed)) return { x, y };
  }
  return { x: 0, y: 0 };
}

function nodeAmount(sim: Sim, x: number, y: number, kind: 'tree' | 'rock'): number {
  const k = keyOf(x, y);
  if (sim.depleted.has(k)) return 0;
  const stored = sim.harvested.get(k);
  return stored !== undefined ? stored : NODE_KINDS[kind].amount;
}

function addItem(sim: Sim, item: string, n: number): void {
  sim.inventory[item] = (sim.inventory[item] || 0) + n;
}

function trySpawnAnimal(sim: Sim): void {
  if (sim.animals.length >= ANIMAL_CAP) return;
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
    sim.animals.push({
      id: sim.nextAnimalId++,
      type,
      x,
      y,
      tx: x,
      ty: y,
      wait: hash2(x, y, 7) * 2,
      health: ANIMAL_HEALTH,
      alive: true,
    });
    return;
  }
}

export function stepSim(sim: Sim, dt: number): StepResult {
  const res: StepResult = { floaters: [], harvestEvents: [], inventoryChanged: false };
  const eid = sim.playerId;

  sim.timeS += dt;

  // --- movimiento con sprint y colisión ---
  const inp = sim.input;
  let gx = 0;
  let gy = 0;
  if (inp.up) { gx -= 1; gy -= 1; }
  if (inp.down) { gx += 1; gy += 1; }
  if (inp.left) { gx -= 1; gy += 1; }
  if (inp.right) { gx += 1; gy -= 1; }
  const moving = gx !== 0 || gy !== 0;
  const sprinting = inp.sprint && moving && sim.stats.stamina > 1;
  const speed = PLAYER_SPEED * (sprinting ? SPRINT_MULT : 1);
  const len = Math.hypot(gx, gy) || 1;
  const vx = moving ? (gx / len) * speed : 0;
  const vy = moving ? (gy / len) * speed : 0;

  let px = Position.x[eid];
  let py = Position.y[eid];
  const nx = px + vx * dt;
  if (tileAt(Math.round(nx), Math.round(py), sim.seed).passable) px = nx;
  const ny = py + vy * dt;
  if (tileAt(Math.round(px), Math.round(ny), sim.seed).passable) py = ny;
  Position.x[eid] = px;
  Position.y[eid] = py;

  // --- estamina ---
  if (sprinting) sim.stats.stamina = Math.max(0, sim.stats.stamina - STAMINA_DRAIN * dt);
  else sim.stats.stamina = Math.min(100, sim.stats.stamina + STAMINA_REGEN * dt);

  // --- comida / sed / vida ---
  sim.stats.food = Math.max(0, sim.stats.food - FOOD_DECAY * dt);
  sim.stats.thirst = Math.max(0, sim.stats.thirst - THIRST_DECAY * dt);
  if (sim.stats.food <= 0 || sim.stats.thirst <= 0) {
    sim.stats.health = Math.max(0, sim.stats.health - STARVE_DAMAGE * dt);
  } else if (sim.stats.health < 100) {
    sim.stats.health = Math.min(100, sim.stats.health + HEALTH_REGEN * dt);
  }

  // --- interacción (recolectar / atacar) ---
  if (sim.interactActive && sim.interactTarget) {
    if (sim.harvestTimer <= 0) {
      if (doInteract(sim, res, px, py)) sim.harvestTimer = HARVEST_COOLDOWN;
    } else {
      sim.harvestTimer -= dt;
    }
  } else {
    sim.harvestTimer = 0;
  }

  // --- animales ---
  updateAnimals(sim, dt);
  sim.spawnTimer -= dt;
  if (sim.spawnTimer <= 0) {
    sim.spawnTimer = 1.5;
    despawnFar(sim);
    trySpawnAnimal(sim);
  }

  sim.tick++;
  return res;
}

function doInteract(sim: Sim, res: StepResult, px: number, py: number): boolean {
  const tgt = sim.interactTarget!;
  if (tgt.kind === 'node') {
    if (Math.hypot(tgt.x - px, tgt.y - py) > INTERACT_RANGE) return false;
    const kind = nodeAt(tgt.x, tgt.y, sim.seed);
    if (!kind) return false;
    let amt = nodeAmount(sim, tgt.x, tgt.y, kind);
    if (amt <= 0) return false;
    amt -= 1;
    const k = keyOf(tgt.x, tgt.y);
    sim.harvested.set(k, amt);
    const item = NODE_KINDS[kind].item;
    addItem(sim, item, 1);
    res.inventoryChanged = true;
    const depleted = amt <= 0;
    if (depleted) sim.depleted.add(k);
    res.harvestEvents.push({ x: tgt.x, y: tgt.y, depleted });
    res.floaters.push({ text: '+1', color: ITEMS[item].color, x: tgt.x, y: tgt.y });
    return true;
  }

  const an = sim.animals.find((a) => a.id === tgt.id && a.alive);
  if (!an) return false;
  if (Math.hypot(an.x - px, an.y - py) > INTERACT_RANGE) return false;
  an.health -= 1;
  // huye un poco (suave) para poder perseguirlo y cazarlo
  an.tx = an.x + (an.x - px) * 0.4;
  an.ty = an.y + (an.y - py) * 0.4;
  an.wait = 0.8;
  if (an.health <= 0) {
    an.alive = false;
    for (const drop of ANIMAL_DROPS[an.type]) {
      const span = drop.max - drop.min + 1;
      const n = drop.min + Math.floor(hash2(an.id, drop.min, sim.seed) * span);
      addItem(sim, drop.item, n);
      res.floaters.push({
        text: '+' + n + ' ' + ITEMS[drop.item].name,
        color: ITEMS[drop.item].color,
        x: an.x,
        y: an.y,
      });
    }
    res.inventoryChanged = true;
  } else {
    res.floaters.push({ text: '!', color: 0xff5555, x: an.x, y: an.y });
  }
  return true;
}

function updateAnimals(sim: Sim, dt: number): void {
  for (const a of sim.animals) {
    if (!a.alive) continue;
    a.wait -= dt;
    if (a.wait <= 0 && Math.abs(a.x - a.tx) < 0.2 && Math.abs(a.y - a.ty) < 0.2) {
      a.wait = 1 + hash2(a.id, sim.tick, sim.seed) * 3;
      a.tx = a.x + (hash2(a.id, sim.tick + 1, sim.seed) - 0.5) * 6;
      a.ty = a.y + (hash2(a.id, sim.tick + 2, sim.seed) - 0.5) * 6;
    }
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.1) {
      const step = Math.min(d, ANIMAL_SPEED * dt);
      const nx = a.x + (dx / d) * step;
      const ny = a.y + (dy / d) * step;
      if (tileAt(Math.round(nx), Math.round(ny), sim.seed).passable) {
        a.x = nx;
        a.y = ny;
      } else {
        a.tx = a.x;
        a.ty = a.y;
      }
    }
  }
  sim.animals = sim.animals.filter((a) => a.alive);
}

function despawnFar(sim: Sim): void {
  const px = Position.x[sim.playerId];
  const py = Position.y[sim.playerId];
  sim.animals = sim.animals.filter((a) => Math.hypot(a.x - px, a.y - py) < SPAWN_RADIUS * 1.7);
}

export function consume(sim: Sim, item: string): { ok: boolean; floater?: Floater } {
  const def = ITEMS[item];
  if (!def || !def.food || !(sim.inventory[item] > 0)) return { ok: false };
  sim.inventory[item] -= 1;
  sim.stats.food = Math.min(100, sim.stats.food + def.food);
  return {
    ok: true,
    floater: {
      text: '+' + def.food + ' comida',
      color: 0x8bc34a,
      x: Position.x[sim.playerId],
      y: Position.y[sim.playerId],
    },
  };
}

export function drink(sim: Sim): boolean {
  const px = Math.round(Position.x[sim.playerId]);
  const py = Math.round(Position.y[sim.playerId]);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      if (isWater(tileAt(px + ox, py + oy, sim.seed).terrain)) {
        sim.stats.thirst = Math.min(100, sim.stats.thirst + 35);
        return true;
      }
    }
  }
  return false;
}

export function timeInfo(sim: Sim): TimeInfo {
  const tod = (sim.timeS % DAY_LENGTH_S) / DAY_LENGTH_S;
  const day = Math.floor(sim.timeS / DAY_LENGTH_S) + 1;
  return { day, tod };
}

export function animalSnaps(sim: Sim): AnimalSnap[] {
  return sim.animals.map((a) => ({ id: a.id, type: a.type, x: a.x, y: a.y, alive: a.alive }));
}

export function invEntries(inv: Record<string, number>): InvEntry[] {
  return Object.keys(inv)
    .filter((k) => inv[k] > 0)
    .map((k) => ({ id: k, count: inv[k] }));
}

export function playerPos(sim: Sim): { x: number; y: number } {
  return { x: Position.x[sim.playerId], y: Position.y[sim.playerId] };
}
