// Punto de entrada del Web Worker. Espera 'init' antes de arrancar.

import {
  createSim, createSimFromSave, serializeSim, stepSim, consume, drink, craft, place,
  timeInfo, animalSnaps, invEntries, playerPos, onWaterOf,
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
      tick: sim.tick, px: p.x, py: p.y, onWater: onWaterOf(sim),
      animals: animalSnaps(sim), stats: sim.stats, time: timeInfo(sim),
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
    post({ t: 'ready', seed: sim.seed, inventory: invEntries(sim.inventory), stats: sim.stats, structures: sim.structures });
    startLoop();
    return;
  }
  if (!sim) return;
  if (m.t === 'input') sim.input = m.input;
  else if (m.t === 'interact') { sim.interactActive = m.active; sim.interactTarget = m.target; }
  else if (m.t === 'selectTool') sim.activeTool = m.item;
  else if (m.t === 'craft') {
    const r = craft(sim, m.id);
    if (r.ok) post({ t: 'inventory', inventory: invEntries(sim.inventory) });
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'place') {
    const r = place(sim, m.item, m.x, m.y);
    if (r.ok) {
      post({ t: 'structures', structures: sim.structures });
      post({ t: 'inventory', inventory: invEntries(sim.inventory) });
    }
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'consume') {
    const r = consume(sim, m.item);
    if (r.ok) { post({ t: 'inventory', inventory: invEntries(sim.inventory) }); if (r.floater) post({ t: 'floater', ...r.floater }); }
  } else if (m.t === 'drink') drink(sim);
  else if (m.t === 'requestSave') post({ t: 'save', state: serializeSim(sim) });
};
