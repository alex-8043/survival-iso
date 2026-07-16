// Punto de entrada del Web Worker. Espera 'init' antes de arrancar.

import {
  createSim, createSimFromSave, serializeSim, stepSim, consume, drink, craft, place, board,
  timeInfo, animalSnaps, invSlots, playerPos, onWaterOf, beginCaveTransition, caveFadeOf, caveEnteringOf, onEntranceOf, bestFood,
  moveItem, quickMove, moveAmount, sortInv, sortChest, chestItems,
  sleep, trade, acceptQuest, completeQuest, jump, respawn, harvestInfo, torchList, armorSlots, furnaceView,
  shootBow, startFishing, projectileSnaps, fishingSnap, debugSpawnEnemies,
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
function postArmor(): void {
  if (sim) post({ t: 'armor', slots: armorSlots(sim) });
}
let openFurnaceId = -1;
function postFurnace(id: number): void {
  if (!sim) return;
  const v = furnaceView(sim, id);
  if (v) post({ t: 'furnace', ...v });
}
function postChest(id: number): void {
  if (!sim) return;
  const items = chestItems(sim, id);
  if (items) post({ t: 'chest', id, items });
}
function postQuests(): void {
  if (sim) post({ t: 'quests', ids: [...sim.acceptedQuests] });
}
function postTorches(): void {
  if (sim) post({ t: 'torches', list: torchList(sim) });
}
function postTerrainAll(): void {
  if (!sim) return;
  const edits = [...sim.edits.entries()].map(([k, v]) => { const [x, y] = k.split(',').map(Number); return { x, y, lvl: v.lvl, top: v.top }; });
  const fluids = [...sim.fluids.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y, add: true }; });
  if (edits.length || fluids.length) post({ t: 'terrain', edits, fluids });
}

let lastLayerKey = '';
function startLoop(): void {
  if (loop !== null) return;
  const dt = TICK_MS / 1000;
  loop = setInterval(() => {
    if (!sim) return;
    const r = stepSim(sim, dt);
    const layerKey = sim.location + ':' + sim.caveSeed;
    if (layerKey !== lastLayerKey) { lastLayerKey = layerKey; postTorches(); } // cambió de capa
    if (openFurnaceId >= 0 && sim.tick % 4 === 0) postFurnace(openFurnaceId); // progreso en vivo
    const p = playerPos(sim);
    const hi = harvestInfo(sim);
    const snap: Snapshot = {
      tick: sim.tick, px: p.x, py: p.y, onWater: onWaterOf(sim),
      animals: animalSnaps(sim), projectiles: projectileSnaps(sim), fishing: fishingSnap(sim),
      stats: sim.stats, time: timeInfo(sim),
      loc: sim.location, caveSeed: sim.caveSeed, onEntrance: onEntranceOf(sim), riding: sim.riding, dead: sim.dead,
      caveFade: caveFadeOf(sim), caveEntering: caveEnteringOf(sim),
      harvestActive: hi.active, harvestProgress: hi.progress, harvestX: hi.x, harvestY: hi.y,
    };
    post({ t: 'snapshot', snap });
    for (const h of r.harvestEvents) post({ t: 'harvest', x: h.x, y: h.y, depleted: h.depleted });
    if (r.inventoryChanged) postInv();
    for (const f of r.floaters) post({ t: 'floater', text: f.text, color: f.color, x: f.x, y: f.y });
    for (const s of r.sfx) post({ t: 'sfx', sound: s.sound, x: s.x, y: s.y });
    if (r.edits.length || r.fluids.length) post({ t: 'terrain', edits: r.edits, fluids: r.fluids });
    if (r.structuresChanged) post({ t: 'structures', structures: sim.structures });
  }, TICK_MS);
}

ctx.onmessage = (e: MessageEvent<ClientMsg>) => {
  const m = e.data;
  if (m.t === 'init') {
    // Partida nueva = seed aleatoria (apareces en un sitio distinto cada vez).
    const newSeed = (Math.floor(Math.random() * 2147483646) + 1) | 0;
    sim = m.mode === 'continue' && m.save ? createSimFromSave(m.save) : createSim(m.mode === 'new' ? newSeed : WORLD_SEED);
    post({ t: 'ready', seed: sim.seed, inv: invSlots(sim), stats: sim.stats, structures: sim.structures, loc: sim.location, caveSeed: sim.caveSeed });
    postQuests();
    postTerrainAll();
    postTorches();
    postArmor();
    startLoop();
    return;
  }
  if (!sim) return;
  if (m.t === 'input') sim.input = m.input;
  else if (m.t === 'interact') { sim.interactActive = m.active; sim.interactTarget = m.target; }
  else if (m.t === 'shoot') {
    const res: StepResult = { floaters: [], harvestEvents: [], inventoryChanged: false, sfx: [], edits: [], fluids: [], structuresChanged: false };
    shootBow(sim, m.x, m.y, res);
    if (res.inventoryChanged) postInv();
    for (const f of res.floaters) post({ t: 'floater', ...f });
    for (const s of res.sfx) post({ t: 'sfx', sound: s.sound, x: s.x, y: s.y });
  } else if (m.t === 'fish') {
    const res: StepResult = { floaters: [], harvestEvents: [], inventoryChanged: false, sfx: [], edits: [], fluids: [], structuresChanged: false };
    startFishing(sim, m.x, m.y, res);
    if (res.inventoryChanged) postInv();
    for (const f of res.floaters) post({ t: 'floater', ...f });
    for (const s of res.sfx) post({ t: 'sfx', sound: s.sound, x: s.x, y: s.y });
  } else if (m.t === 'selectTool') sim.activeTool = m.item;
  else if (m.t === 'craft') {
    const r = craft(sim, m.id);
    if (r.ok) postInv();
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'place') {
    const r = place(sim, m.item, m.x, m.y);
    if (r.ok) {
      if (m.item === 'torch') {
        postTorches();
        post({ t: 'sfx', sound: 'ui:place', x: m.x, y: m.y });
      } else if (r.edit) {
        post({ t: 'terrain', edits: [r.edit], fluids: r.fluidCleared ? [{ x: r.edit.x, y: r.edit.y, add: false }] : [] });
        post({ t: 'sfx', sound: 'ui:place', x: r.edit.x, y: r.edit.y });
      } else {
        post({ t: 'structures', structures: sim.structures });
      }
      postInv();
    }
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'consume') {
    const item = m.item ?? bestFood(sim);
    if (item) {
      const r = consume(sim, item);
      if (r.ok) postInv();
      if (r.floater) post({ t: 'floater', ...r.floater });
    }
  } else if (m.t === 'jump') {
    jump(sim);
  } else if (m.t === 'respawn') {
    respawn(sim);
  } else if (m.t === 'drink') {
    const r = drink(sim);
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'move') {
    moveItem(sim, m.from, m.to);
    postInv();
    postArmor();
    for (const a of [m.from, m.to] as InvAddr[]) {
      if (a.c === 'chest') postChest(a.id);
      if (a.c === 'furnace') postFurnace(a.id);
    }
  } else if (m.t === 'openFurnace') {
    openFurnaceId = m.id;
    postFurnace(m.id);
  } else if (m.t === 'closeFurnace') {
    openFurnaceId = -1;
  } else if (m.t === 'quickMove') {
    quickMove(sim, m.from, m.id);
    postInv(); postChest(m.id);
  } else if (m.t === 'moveAmount') {
    moveAmount(sim, m.from, m.id, m.amount);
    postInv(); postChest(m.id);
  } else if (m.t === 'sortInv') {
    sortInv(sim); postInv();
  } else if (m.t === 'sortChest') {
    sortChest(sim, m.id); postChest(m.id);
  } else if (m.t === 'openChest') {
    postChest(m.id);
  } else if (m.t === 'toggleCave') {
    const res: StepResult = { floaters: [], harvestEvents: [], inventoryChanged: false, sfx: [], edits: [], fluids: [], structuresChanged: false };
    beginCaveTransition(sim, res);
    for (const f of res.floaters) post({ t: 'floater', ...f });
    for (const s of res.sfx) post({ t: 'sfx', sound: s.sound, x: s.x, y: s.y });
  } else if (m.t === 'board') {
    const r = board(sim, m.id);
    post({ t: 'structures', structures: sim.structures });
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'sleep') {
    const r = sleep(sim);
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'trade') {
    const r = trade(sim, m.action, m.item);
    if (r.ok) postInv();
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'acceptQuest') {
    acceptQuest(sim, m.id);
    postQuests();
  } else if (m.t === 'completeQuest') {
    const r = completeQuest(sim, m.id);
    if (r.ok) { postInv(); postQuests(); }
    if (r.floater) post({ t: 'floater', ...r.floater });
  } else if (m.t === 'requestSave') post({ t: 'save', state: serializeSim(sim) });
  else if ((m as { t: string }).t === 'debugSpawn') { debugSpawnEnemies(sim); } // sólo dev (ver main.ts)
};
