// Punto de entrada del Web Worker. Espera un mensaje 'init' (nueva o continuar)
// antes de arrancar. En multiplayer, se reemplaza por un servidor Node.

import {
  createSim,
  createSimFromSave,
  serializeSim,
  stepSim,
  consume,
  drink,
  timeInfo,
  animalSnaps,
  invEntries,
  playerPos,
  Position,
} from './world';
import type { Sim } from './world';
import { WORLD_SEED, TICK_MS } from '../shared/constants';
import type { ClientMsg, SimMsg, Snapshot } from '../shared/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let sim: Sim | null = null;
let loop: ReturnType<typeof setInterval> | null = null;

function post(msg: SimMsg): void {
  ctx.postMessage(msg);
}

function startLoop(): void {
  if (loop !== null) return;
  const dt = TICK_MS / 1000;
  loop = setInterval(() => {
    if (!sim) return;
    const r = stepSim(sim, dt);
    const p = playerPos(sim);
    const snap: Snapshot = {
      tick: sim.tick,
      px: p.x,
      py: p.y,
      animals: animalSnaps(sim),
      stats: sim.stats,
      time: timeInfo(sim),
    };
    post({ t: 'snapshot', snap });
    for (const h of r.harvestEvents) post({ t: 'harvest', x: h.x, y: h.y, depleted: h.depleted });
    if (r.inventoryChanged) post({ t: 'inventory', inventory: invEntries(sim.inventory) });
    for (const f of r.floaters) post({ t: 'floater', text: f.text, color: f.color, x: f.x, y: f.y });
  }, TICK_MS);
}

ctx.onmessage = (e: MessageEvent<ClientMsg>) => {
  const m = e.data;
  if (m.t === 'init') {
    sim = m.mode === 'continue' && m.save ? createSimFromSave(m.save) : createSim(WORLD_SEED);
    post({ t: 'ready', seed: sim.seed, inventory: invEntries(sim.inventory), stats: sim.stats });
    startLoop();
    return;
  }
  if (!sim) return;
  if (m.t === 'input') {
    sim.input = m.input;
  } else if (m.t === 'interact') {
    sim.interactActive = m.active;
    sim.interactTarget = m.target;
  } else if (m.t === 'consume') {
    const r = consume(sim, m.item);
    if (r.ok) {
      post({ t: 'inventory', inventory: invEntries(sim.inventory) });
      if (r.floater) post({ t: 'floater', ...r.floater });
    }
  } else if (m.t === 'drink') {
    drink(sim);
  } else if (m.t === 'requestSave') {
    post({ t: 'save', state: serializeSim(sim) });
  }
};

// evita el warning de import no usado (Position se reexporta para el cliente si hiciera falta)
void Position;
