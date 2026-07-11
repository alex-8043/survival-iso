// Punto de entrada del cliente: arranca el render, lanza la simulación en un
// Web Worker y conecta input <-> simulación <-> render.

import { GameRenderer } from './client/renderer';
import { setupInput } from './client/input';
import type { SimMsg } from './shared/protocol';

// Muestra un error visible en pantalla (nunca más una pantalla en blanco muda).
function showError(msg: string): void {
  // eslint-disable-next-line no-console
  console.error('[client] ' + msg);
  let box = document.getElementById('error-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'error-box';
    box.style.cssText =
      'position:fixed;left:12px;bottom:12px;right:12px;max-width:680px;' +
      'background:#4a1e1e;color:#ffd9d9;font:13px/1.5 system-ui,sans-serif;' +
      'padding:12px 14px;border-radius:8px;white-space:pre-wrap;z-index:9999';
    document.body.appendChild(box);
  }
  box.textContent = 'No se pudo iniciar el juego:\n' + msg;
}

async function main(): Promise<void> {
  const parent = document.getElementById('app');
  if (!parent) throw new Error('Falta el contenedor #app');

  const renderer = new GameRenderer();
  await renderer.init(parent);

  // La simulación corre en su propio hilo. En multiplayer, este Worker se
  // sustituye por una conexión al servidor usando el mismo protocolo.
  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onerror = (e) =>
    showError('Fallo en la simulación (worker): ' + (e.message || e.filename || 'desconocido'));

  let firstSnapshot = true;
  worker.onmessage = (e: MessageEvent<SimMsg>) => {
    const msg = e.data;
    if (msg.t === 'ready') {
      // eslint-disable-next-line no-console
      console.log('[client] sim ready');
      renderer.setChunk(msg.chunk, msg.playerId);
    } else if (msg.t === 'snapshot') {
      if (firstSnapshot) {
        firstSnapshot = false;
        // eslint-disable-next-line no-console
        console.log('[client] first snapshot, tick', msg.snap.tick);
      }
      renderer.applySnapshot(msg.snap);
    }
  };

  setupInput((state) => worker.postMessage({ t: 'input', input: state }));
}

main().catch((err) => showError(String(err && err.stack ? err.stack : err)));
