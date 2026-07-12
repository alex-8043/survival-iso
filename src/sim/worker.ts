// Punto de entrada del Web Worker. Espera 'init' antes de arrancar.

import {
  createSim, createSimFromSave, serializeSim, stepSim, consume, drink, craft, place,
  timeInfo, animalSnaps, invSlots, playerPos, onWaterOf, toggleCave, onEntranceOf, bestFood,
  moveItem, sortInv, sortChest, chestItems,
} from './world';
import type { Sim, StepResult } from './world';
import { WORLD_SEED, TICK_MS } from '../shared/constants';
import type { ClientMsg, SimMsg, Snapshot, InvAddr } from '../shared/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let sim: Sim | null = null;
let loop: ReturnType<typeof setInterval> | null = null;

function post(msg: SimMsg): void {
  ctx.postMessage(msg);
}
function postInv(): void {
  if (sim) post({ t: 'inventory', inv: invSlots(sim) });
}
function postChest(id: number): void {
  if (!sim) return;
  const items = chestItems(sim, id);
  if (items) post({ t: 'chest', id, items });
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
      loc: sim.location, caveSeed: sim.caveSeed, onEntrance: onEntranceOf(sim),
    };
    post({ t: 'snapshot', snap });
    for (const h of r.harvestEvents) post({ t: 'harvest', x: h.x, y: h.y, depleted: h.depleted });
    if (r.inventoryChanged) postInv();
    for (const f of r.floaters) post({ t: 'floater', text: f.text, color: f.color, x: f.x, y: f.y });
  }, TICK_MS);
}

ctx.onmessage = (e: MessageEvent<ClientMsg>) => {
  const m = e.data;
  if (m.t === 'init') {
    sim = m.mode === 'continue' && m.save ? createSimFromSave(m.save) : createSim(WORLD_SEED);
    post({ t: 'ready', seed: sim.seed, inv: invSlots(sim), stats: sim.stats, structures: sim.structures, loc: sim.location, caveSeed: sim.caveSeed });
    startLoop();
    return;
  }
  if (!sim) return;
  if (m.t === 'input') sim.input = m.input;
  else if (m.t === 'interact') { sim.interactActive = m.active; sim.interactTarget = m.target; }
  else if (m.t === 'selectTool') sim.activeTool = m.item;
  else if (m.t === 'craft') {
    const r = craft(sim, m.id);
    if (r.ok) postInv();
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'place') {
    const r = place(sim, m.item, m.x, m.y);
    if (r.ok) { post({ t: 'structures', structures: sim.structures }); postInv(); }
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'consume') {
    const item = m.item ?? bestFood(sim);
    if (item) {
      const r = consume(sim, item);
      if (r.ok) postInv();
      if (r.floater) post({ t: 'floater', ...r.floater });
    }
  } else if (m.t === 'drink') {
    const r = drink(sim);
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'move') {
    moveItem(sim, m.from, m.to);
    postInv();
    for (const a of [m.from, m.to] as InvAddr[]) if (a.c === 'chest') postChest(a.id);
  } else if (m.t === 'sortInv') {
    sortInv(sim); postInv();
  } else if (m.t === 'sortChest') {
    sortChest(sim, m.id); postChest(m.id);
  } else if (m.t === 'openChest') {
    postChest(m.id);
  } else if (m.t === 'toggleCave') {
    const res: StepResult = { floaters: [], harvestEvents: [], inventoryChanged: false };
    toggleCave(sim, res);
    for (const f of res.floaters) post({ t: 'floater', ...f });
  } else if (m.t === 'requestSave') post({ t: 'save', state: serializeSim(sim) });
};
