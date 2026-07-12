// Punto de entrada del Web Worker: hospeda la simulación y habla el protocolo.
// En multiplayer, se reemplaza por un servidor Node que reutiliza world.ts.

import {
  createSim,
  stepSim,
  consume,
  drink,
  timeInfo,
  animalSnaps,
  invEntries,
  playerPos,
} from './world';
import { WORLD_SEED, TICK_MS } from '../shared/constants';
import type { ClientMsg, SimMsg, Snapshot } from '../shared/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const sim = createSim(WORLD_SEED);

function post(msg: SimMsg): void {
  ctx.postMessage(msg);
}

post({ t: 'ready', seed: WORLD_SEED, inventory: invEntries(sim.inventory), stats: sim.stats });

ctx.onmessage = (e: MessageEvent<ClientMsg>) => {
  const m = e.data;
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
  }
};

const dt = TICK_MS / 1000;
setInterval(() => {
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
