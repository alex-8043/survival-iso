// Simulación autoritativa (headless, sin render) con bitECS.
// Este módulo NO importa nada de PixiJS ni del DOM: corre igual en un Web Worker
// (single-player) que en un servidor Node (multiplayer).

import {
  createWorld,
  addEntity,
  addComponent,
  defineComponent,
  defineQuery,
  Types,
} from 'bitecs';
import { CHUNK_SIZE, PLAYER_SPEED } from '../shared/constants';
import { mulberry32 } from '../shared/rng';
import type { ChunkData, PropData, InputState } from '../shared/protocol';

type World = ReturnType<typeof createWorld>;

// --- Componentes (Struct-of-Arrays: datos planos, serializables) ---
export const Position = defineComponent({ x: Types.f32, y: Types.f32 });
export const Velocity = defineComponent({ x: Types.f32, y: Types.f32 });
export const Player = defineComponent();

const playerQuery = defineQuery([Player, Position, Velocity]);

export interface Sim {
  world: World;
  playerId: number;
  chunk: ChunkData;
  input: InputState;
  tick: number;
}

export function createSim(seed: number): Sim {
  const world = createWorld();
  const chunk = genChunk(seed);

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
    input: { up: false, down: false, left: false, right: false },
    tick: 0,
  };
}

// Generación determinista del chunk (tiles + props).
export function genChunk(seed: number): ChunkData {
  const rnd = mulberry32(seed);
  const size = CHUNK_SIZE;
  const tiles = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = rnd();
      let type = 0; // pasto
      if (r > 0.92) type = 2; // agua
      else if (r > 0.6) type = 1; // pasto variante
      tiles[y * size + x] = type;
    }
  }

  // Props (árboles/rocas) sobre tiles que no sean agua y lejos del spawn.
  const props: PropData[] = [];
  const center = size / 2;
  const target = 20;
  let placed = 0;
  let guard = 0;
  while (placed < target && guard < 800) {
    guard++;
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    if (tiles[y * size + x] === 2) continue;
    if (Math.abs(x - center) < 2 && Math.abs(y - center) < 2) continue;
    props.push({ x, y, kind: rnd() > 0.78 ? 'rock' : 'tree' });
    placed++;
  }

  return { size, tiles, props, seed };
}

// Un paso de simulación de duración fija dt (segundos).
export function stepSim(sim: Sim, dt: number): void {
  const { input } = sim;

  // Movimiento alineado a los ejes de pantalla isométricos.
  let gx = 0;
  let gy = 0;
  if (input.up) {
    gx -= 1;
    gy -= 1;
  }
  if (input.down) {
    gx += 1;
    gy += 1;
  }
  if (input.left) {
    gx -= 1;
    gy += 1;
  }
  if (input.right) {
    gx += 1;
    gy -= 1;
  }

  const moving = gx !== 0 || gy !== 0;
  const len = Math.hypot(gx, gy) || 1;
  const vx = moving ? (gx / len) * PLAYER_SPEED : 0;
  const vy = moving ? (gy / len) * PLAYER_SPEED : 0;

  const ents = playerQuery(sim.world);
  const maxCoord = sim.chunk.size - 1;
  for (let i = 0; i < ents.length; i++) {
    const eid = ents[i];
    Velocity.x[eid] = vx;
    Velocity.y[eid] = vy;
    const nx = Position.x[eid] + vx * dt;
    const ny = Position.y[eid] + vy * dt;
    Position.x[eid] = Math.max(0, Math.min(maxCoord, nx));
    Position.y[eid] = Math.max(0, Math.min(maxCoord, ny));
  }

  sim.tick++;
}
