// Punto de entrada del cliente: menú (nueva/continuar/opciones) -> partida.
// Conecta input, ratón, HUD, inventario, guardado y música.

import { GameRenderer } from './client/renderer';
import { setupInput } from './client/input';
import { initHud, updateHud } from './client/hud';
import { showMenu } from './client/menu';
import { togglePanel, isPanelOpen, updatePanel, setPanelCustom } from './client/panel';
import { loadGame, saveGame } from './client/save';
import { startMusic, toggleMusic, isMusicOn } from './client/music';
import { AUTOSAVE_S } from './shared/constants';
import type { Customization } from './client/avatar';
import type { InvEntry, SaveState, SimMsg, Stats } from './shared/protocol';

function showError(msg: string): void {
  // eslint-disable-next-line no-console
  console.error('[client] ' + msg);
  let box = document.getElementById('error-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'error-box';
    box.style.cssText =
      'position:fixed;left:12px;bottom:12px;right:12px;max-width:680px;background:#4a1e1e;' +
      'color:#ffd9d9;font:13px/1.5 system-ui,sans-serif;padding:12px 14px;border-radius:8px;white-space:pre-wrap;z-index:99999';
    document.body.appendChild(box);
  }
  box.textContent = 'No se pudo iniciar el juego:\n' + msg;
}

function toast(msg: string): void {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.cssText =
    'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:rgba(0,0,0,.72);' +
    'color:#cdd6f4;padding:8px 16px;border-radius:8px;z-index:9999;font:13px system-ui;transition:opacity .4s;opacity:1';
  const anyT = t as unknown as { _to?: number };
  if (anyT._to) window.clearTimeout(anyT._to);
  anyT._to = window.setTimeout(() => {
    if (t) t.style.opacity = '0';
  }, 1400);
}

async function main(): Promise<void> {
  const parent = document.getElementById('app');
  if (!parent) throw new Error('Falta el contenedor #app');

  const renderer = new GameRenderer();
  await renderer.init(parent);

  const bundle = await loadGame();
  showMenu({
    hasSave: !!bundle,
    onNew: (c) => startGame(renderer, 'new', c, null),
    onContinue: async () => {
      const b = bundle ?? (await loadGame());
      if (b) startGame(renderer, 'continue', b.custom, b.state);
    },
    musicOn: isMusicOn,
    toggleMusic,
  });
}

function startGame(
  renderer: GameRenderer,
  mode: 'new' | 'continue',
  custom: Customization,
  save: SaveState | null
): void {
  startMusic();
  initHud();
  setPanelCustom(custom);

  let lastInv: InvEntry[] = save?.inventory ?? [];
  let lastStats: Stats = save?.stats ?? { health: 100, food: 100, thirst: 100, stamina: 100 };
  let manualSave = false;

  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  worker.onerror = (e) => showError('Fallo en la simulación: ' + (e.message || 'desconocido'));

  worker.onmessage = (e: MessageEvent<SimMsg>) => {
    const m = e.data;
    switch (m.t) {
      case 'ready':
        renderer.start(m.seed, custom, save?.px ?? 0, save?.py ?? 0);
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
      case 'save':
        void saveGame(m.state, custom).then(() => {
          if (manualSave) {
            manualSave = false;
            toast('Partida guardada');
          }
        });
        break;
    }
  };

  worker.postMessage({ t: 'init', mode, save: save ?? undefined });

  renderer.onInteract = (active, target) => worker.postMessage({ t: 'interact', active, target });
  setupInput((state) => worker.postMessage({ t: 'input', input: state }));

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyF') worker.postMessage({ t: 'consume', item: 'meat' });
    else if (e.code === 'KeyG') worker.postMessage({ t: 'drink' });
    else if (e.code === 'KeyM') toggleMusic();
    else if (e.code === 'KeyK') {
      manualSave = true;
      worker.postMessage({ t: 'requestSave' });
    } else if (e.code === 'Tab') {
      e.preventDefault();
      togglePanel();
      updatePanel(lastInv, lastStats);
    }
  });

  window.setInterval(() => worker.postMessage({ t: 'requestSave' }), AUTOSAVE_S * 1000);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') worker.postMessage({ t: 'requestSave' });
  });
}

main().catch((err) => showError(String(err && err.stack ? err.stack : err)));
