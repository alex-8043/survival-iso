// Simulación autoritativa (headless, sin render) con bitECS.
// No importa PixiJS ni el DOM: corre igual en un Web Worker (single-player)
// que en un servidor Node (multiplayer).

import {
  createWorld,
  addEntity,
  addComponent,
  defineComponent,
  defineQuery,
  Types,
} from 'bitecs';
import {
  CHUNK_SIZE,
  PLAYER_SPEED,
  HARVEST_RANGE,
  HARVEST_COOLDOWN,
} from '../shared/constants';
import { mulberry32 } from '../shared/rng';
import { NODE_KINDS } from '../shared/items';
import type { ChunkData, InputState, NodeKind, NodeSnap, InvEntry } from '../shared/protocol';

type World = ReturnType<typeof createWorld>;

// --- Componentes (datos planos, serializables) ---
export const Position = defineComponent({ x: Types.f32, y: Types.f32 });
export const Velocity = defineComponent({ x: Types.f32, y: Types.f32 });
export const Player = defineComponent();

const playerQuery = defineQuery([Player, Position, Velocity]);

// Los nodos recolectables se llevan como datos planos (simples de serializar
// para el guardado y para la red). El jugador vive en el ECS.
export interface NodeState {
  id: number;
  x: number;
  y: number;
  kind: NodeKind;
  amount: number;
  alive: boolean;
}

export interface Sim {
  world: World;
  playerId: number;
  chunk: ChunkData;
  nodes: NodeState[];
  inventory: Record<string, number>;
  input: InputState;
  tick: number;
  harvestTimer: number;
}

// Cambios producidos por un paso de simulación (para emitir mensajes).
export interface StepResult {
  targetNodeId: number;
  changedNodes: NodeState[];
  inventoryChanged: boolean;
  harvested: { item: string; x: number; y: number } | null;
}

export function createSim(seed: number): Sim {
  const world = createWorld();
  const chunk = genChunk(seed);
  const nodes = genNodes(seed, chunk);

  const playerId = addEntity(world);
  addComponent(world, Position, playerId);
  addComponent(world, Velocity, playerId);
  addComponent(world, Player, playerId);

  const center = CHUNK_SIZE / 2;
  Position.x[playerId] = center;
  Position.y[playerId] = center;

  return {
    world,
    playerId,
    chunk,
    nodes,
    inventory: {},
    input: { up: false, down: false, left: false, right: false, action: false },
    tick: 0,
    harvestTimer: 0,
  };
}

export function genChunk(seed: number): ChunkData {
  const rnd = mulberry32(seed);
  const size = CHUNK_SIZE;
  const tiles = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rnd();
      let type = 0;
      if (r > 0.92) type = 2;
      else if (r > 0.6) type = 1;
      tiles[y * size + x] = type;
    }
  }
  return { size, tiles, seed };
}

export function genNodes(seed: number, chunk: ChunkData): NodeState[] {
  const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0); // corriente distinta a la del terreno
  const size = chunk.size;
  const center = size / 2;
  const nodes: NodeState[] = [];
  let id = 1;
  let placed = 0;
  let guard = 0;
  while (placed < 22 && guard < 900) {
    guard++;
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    if (chunk.tiles[y * size + x] === 2) continue; // no en agua
    if (Math.abs(x - center) < 2 && Math.abs(y - center) < 2) continue; // deja libre el spawn
    if (nodes.some((n) => n.x === x && n.y === y)) continue; // un nodo por tile
    const kind: NodeKind = rnd() > 0.72 ? 'rock' : 'tree';
    nodes.push({ id: id++, x, y, kind, amount: NODE_KINDS[kind].amount, alive: true });
    placed++;
  }
  return nodes;
}

export function stepSim(sim: Sim, dt: number): StepResult {
  const result: StepResult = {
    targetNodeId: -1,
    changedNodes: [],
    inventoryChanged: false,
    harvested: null,
  };
  const { input } = sim;

  // --- Movimiento (alineado a los ejes isométricos de pantalla) ---
  let gx = 0;
  let gy = 0;
  if (input.up) { gx -= 1; gy -= 1; }
  if (input.down) { gx += 1; gy += 1; }
  if (input.left) { gx -= 1; gy += 1; }
  if (input.right) { gx += 1; gy -= 1; }
  const moving = gx !== 0 || gy !== 0;
  const len = Math.hypot(gx, gy) || 1;
  const vx = moving ? (gx / len) * PLAYER_SPEED : 0;
  const vy = moving ? (gy / len) * PLAYER_SPEED : 0;

  const ents = playerQuery(sim.world);
  const maxCoord = sim.chunk.size - 1;
  let px = 0;
  let py = 0;
  for (let i = 0; i < ents.length; i++) {
    const eid = ents[i];
    Velocity.x[eid] = vx;
    Velocity.y[eid] = vy;
    px = Math.max(0, Math.min(maxCoord, Position.x[eid] + vx * dt));
    py = Math.max(0, Math.min(maxCoord, Position.y[eid] + vy * dt));
    Position.x[eid] = px;
    Position.y[eid] = py;
  }

  // --- Objetivo de recolección: nodo vivo más cercano dentro del rango ---
  let target: NodeState | null = null;
  let best = HARVEST_RANGE;
  for (const n of sim.nodes) {
    if (!n.alive || n.amount <= 0) continue;
    const d = Math.hypot(n.x - px, n.y - py);
    if (d <= best) {
      best = d;
      target = n;
    }
  }
  result.targetNodeId = target ? target.id : -1;

  // --- Recolección (mantener acción: primer golpe inmediato, luego por cooldown) ---
  if (input.action && target) {
    if (sim.harvestTimer <= 0) {
      target.amount -= 1;
      const item = NODE_KINDS[target.kind].item;
      sim.inventory[item] = (sim.inventory[item] || 0) + 1;
      sim.harvestTimer = HARVEST_COOLDOWN;
      if (target.amount <= 0) target.alive = false;
      result.changedNodes.push(target);
      result.inventoryChanged = true;
      result.harvested = { item, x: target.x, y: target.y };
    } else {
      sim.harvestTimer -= dt;
    }
  } else {
    sim.harvestTimer = 0;
  }

  sim.tick++;
  return result;
}

// --- Helpers de serialización ---
export function nodeSnap(n: NodeState): NodeSnap {
  return { id: n.id, x: n.x, y: n.y, kind: n.kind, amount: n.amount, alive: n.alive };
}

export function invEntries(inv: Record<string, number>): InvEntry[] {
  return Object.keys(inv)
    .filter((k) => inv[k] > 0)
    .map((k) => ({ id: k, count: inv[k] }));
}
