// Punto de entrada del Web Worker: hospeda la simulación y habla el protocolo.
// En multiplayer, este archivo se reemplaza por un servidor Node que reutiliza
// createSim/stepSim tal cual (mismo contrato de mensajes).

import { createSim, stepSim, Position } from './world';
import { TICK_MS } from '../shared/constants';
import type { ClientMsg, SimMsg, Snapshot } from '../shared/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const SEED = 1337;
const sim = createSim(SEED);

function post(msg: SimMsg): void {
  ctx.postMessage(msg);
}

// Estado inicial del mundo (una sola vez).
post({ t: 'ready', chunk: sim.chunk, playerId: sim.playerId });

ctx.onmessage = (e: MessageEvent<ClientMsg>) => {
  const msg = e.data;
  if (msg.t === 'input') {
    sim.input = msg.input;
  }
};

const dt = TICK_MS / 1000;
setInterval(() => {
  stepSim(sim, dt);
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
  };
  post({ t: 'snapshot', snap });
}, TICK_MS);
