// Punto de entrada del cliente: menú -> partida. Conecta input, ratón, HUD,
// inventario y la simulación (Web Worker).

import { GameRenderer } from './client/renderer';
import { setupInput } from './client/input';
import { initHud, updateHud } from './client/hud';
import { showMenu } from './client/menu';
import { togglePanel, isPanelOpen, updatePanel, setPanelSkin } from './client/panel';
import type { InvEntry, SimMsg, Stats } from './shared/protocol';

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
      'padding:12px 14px;border-radius:8px;white-space:pre-wrap;z-index:99999';
    document.body.appendChild(box);
  }
  box.textContent = 'No se pudo iniciar el juego:\n' + msg;
}

async function main(): Promise<void> {
  const parent = document.getElementById('app');
  if (!parent) throw new Error('Falta el contenedor #app');

  const renderer = new GameRenderer();
  await renderer.init(parent);

  showMenu((skinId) => startGame(renderer, skinId));
}

function startGame(renderer: GameRenderer, skinId: string): void {
  initHud();
  setPanelSkin(skinId);

  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  worker.onerror = (e) => showError('Fallo en la simulación: ' + (e.message || 'desconocido'));

  let lastInv: InvEntry[] = [];
  let lastStats: Stats = { health: 100, food: 100, thirst: 100, stamina: 100 };

  worker.onmessage = (e: MessageEvent<SimMsg>) => {
    const m = e.data;
    switch (m.t) {
      case 'ready':
        renderer.start(m.seed, skinId);
        lastInv = m.inventory;
        lastStats = m.stats;
        updatePanel(lastInv, lastStats);
        break;
      case 'snapshot':
        renderer.applySnapshot(m.snap);
        lastStats = m.snap.stats;
        if (m.snap.tick % 6 === 0) updateHud(m.snap.stats, m.snap.time);
        if (isPanelOpen()) updatePanel(lastInv, lastStats);
        break;
      case 'harvest':
        renderer.onHarvest(m.x, m.y, m.depleted);
        break;
      case 'inventory':
        lastInv = m.inventory;
        updatePanel(lastInv, lastStats);
        break;
      case 'floater':
        renderer.spawnFloat(m.text, m.color, m.x, m.y);
        break;
    }
  };

  // ratón -> objetivo de interacción
  renderer.onInteract = (active, target) =>
    worker.postMessage({ t: 'interact', active, target });

  // teclado de movimiento + correr
  setupInput((state) => worker.postMessage({ t: 'input', input: state }));

  // acciones de un toque
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyF') worker.postMessage({ t: 'consume', item: 'meat' });
    else if (e.code === 'KeyG') worker.postMessage({ t: 'drink' });
    else if (e.code === 'Tab') {
      e.preventDefault();
      togglePanel();
      updatePanel(lastInv, lastStats);
    }
  });
}

main().catch((err) => showError(String(err && err.stack ? err.stack : err)));
