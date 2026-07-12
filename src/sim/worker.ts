// Punto de entrada del Web Worker: hospeda la simulación y habla el protocolo.
// En multiplayer, este archivo se reemplaza por un servidor Node que reutiliza
// createSim/stepSim tal cual (mismo contrato de mensajes).

import { createSim, stepSim, Position, nodeSnap, invEntries } from './world';
import { TICK_MS } from '../shared/constants';
import type { ClientMsg, SimMsg, Snapshot } from '../shared/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const SEED = 1337;
const sim = createSim(SEED);

function post(msg: SimMsg): void {
  ctx.postMessage(msg);
}

// Estado inicial del mundo (una sola vez).
post({
  t: 'ready',
  chunk: sim.chunk,
  nodes: sim.nodes.map(nodeSnap),
  playerId: sim.playerId,
  inventory: invEntries(sim.inventory),
});

ctx.onmessage = (e: MessageEvent<ClientMsg>) => {
  const msg = e.data;
  if (msg.t === 'input') {
    sim.input = msg.input;
  }
};

const dt = TICK_MS / 1000;
setInterval(() => {
  const r = stepSim(sim, dt);

  const snap: Snapshot = {
    tick: sim.tick,
    entities: [
      {
        id: sim.playerId,
        x: Position.x[sim.playerId],
        y: Position.y[sim.playerId],
        kind: 'player',
      },
    ],
    targetNodeId: r.targetNodeId,
  };
  post({ t: 'snapshot', snap });

  if (r.changedNodes.length) post({ t: 'nodes', nodes: r.changedNodes.map(nodeSnap) });
  if (r.inventoryChanged) post({ t: 'inventory', inventory: invEntries(sim.inventory) });
  if (r.harvested) post({ t: 'harvested', item: r.harvested.item, x: r.harvested.x, y: r.harvested.y });
}, TICK_MS);
