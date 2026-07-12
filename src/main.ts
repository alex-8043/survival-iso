// Punto de entrada del cliente: menú -> partida. Conecta input, ratón, HUD,
// inventario, hotbar, crafteo, colocación, guardado y música.

import { GameRenderer } from './client/renderer';
import { setupInput, setInputEnabled } from './client/input';
import { initHud, updateHud, pushPickup } from './client/hud';
import { showMenu } from './client/menu';
import { initPanel, togglePanel, isPanelOpen, updatePanel, updatePanelStats, setPanelCustom } from './client/panel';
import { initChest, openChestPanel, setChestItems, updateChestInv } from './client/chestpanel';
import { initHotbar, updateHotbar, type HotbarSel } from './client/hotbar';
import { initCraft, toggleCraft, updateCraft, openStationCraft } from './client/craftpanel';
import { initControls, toggleControls, showControls } from './client/controls';
import { initPause, togglePause, isPaused, isCapturing } from './client/pausemenu';
import { initMinimap, updateMinimap, toggleBigMap } from './client/minimap';
import { initVillageDialog, openVillageDialog, updateVillageDialog, isVillageOpen, closeVillageDialog } from './client/villagedialog';
import { loadBinds, actionFor } from './client/keybinds';
import { loadGame, saveGame, saveGameSync } from './client/save';
import { startMusic, toggleMusic, isMusicOn } from './client/music';
import { initSfx, gameSfx } from './client/sfx';
import { AUTOSAVE_S } from './shared/constants';
import { ITEMS } from './shared/items';
import { slotCounts, countIn, type Slot } from './shared/inventory';
import type { Customization } from './client/avatar';
import type { SaveState, SimMsg, Stats } from './shared/protocol';

function showError(msg: string): void {
  // eslint-disable-next-line no-console
  console.error('[client] ' + msg);
  let box = document.getElementById('error-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'error-box';
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;right:12px;max-width:680px;background:#4a1e1e;color:#ffd9d9;font:13px/1.5 system-ui,sans-serif;padding:12px 14px;border-radius:8px;white-space:pre-wrap;z-index:99999';
    document.body.appendChild(box);
  }
  box.textContent = 'No se pudo iniciar el juego:\n' + msg;
}

function toast(msg: string): void {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:rgba(0,0,0,.72);color:#cdd6f4;padding:8px 16px;border-radius:8px;z-index:9999;font:13px system-ui;transition:opacity .4s;opacity:1';
  const anyT = t as unknown as { _to?: number };
  if (anyT._to) window.clearTimeout(anyT._to);
  anyT._to = window.setTimeout(() => { if (t) t.style.opacity = '0'; }, 1400);
}

async function main(): Promise<void> {
  loadBinds();
  const parent = document.getElementById('app');
  if (!parent) throw new Error('Falta el contenedor #app');
  const renderer = new GameRenderer();
  await renderer.init(parent);
  const bundle = await loadGame();
  showMenu({
    hasSave: !!bundle,
    onNew: (c) => startGame(renderer, 'new', c, null),
    onContinue: async () => { const b = bundle ?? (await loadGame()); if (b) startGame(renderer, 'continue', b.custom, b.state); },
    musicOn: isMusicOn,
    toggleMusic,
  });
}

function startGame(renderer: GameRenderer, mode: 'new' | 'continue', custom: Customization, save: SaveState | null): void {
  startMusic();
  initSfx();
  initHud();
  initControls();
  setPanelCustom(custom);

  let lastSlots: Slot[] = save?.inv ?? [];
  let lastStats: Stats = save?.stats ?? { health: 100, food: 100, thirst: 100, stamina: 100 };
  let acceptedQuests: number[] = save?.acceptedQuests ?? [];
  let latestSave: SaveState | null = save;
  let manualSave = false;
  let pendingMenu = false;

  const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  worker.onerror = (e) => showError('Fallo en la simulación: ' + (e.message || 'desconocido'));

  const refreshInv = (inv: Slot[], silent = false) => {
    if (!silent) {
      const prev = slotCounts(lastSlots);
      const now = slotCounts(inv);
      for (const id of Object.keys(now)) {
        const d = now[id] - (prev[id] || 0);
        if (d > 0) pushPickup('+' + d + ' ' + (ITEMS[id]?.name || id), id);
      }
    }
    lastSlots = inv;
    updateHotbar(inv);
    updateCraft(inv);
    updatePanel(lastSlots, lastStats);
    updateChestInv(lastSlots);
    if (isVillageOpen()) updateVillageDialog(lastSlots, acceptedQuests);
    renderer.hasBoat = countIn(inv, 'boat') > 0;
  };

  worker.onmessage = (e: MessageEvent<SimMsg>) => {
    const m = e.data;
    switch (m.t) {
      case 'ready':
        renderer.start(m.seed, custom, save?.px ?? 0, save?.py ?? 0);
        renderer.setStructures(m.structures);
        renderer.setLayer(m.loc, m.caveSeed);
        initMinimap(m.seed);
        lastStats = m.stats;
        refreshInv(m.inv, true);
        worker.postMessage({ t: 'requestSave' }); // cachea un estado inicial pronto
        break;
      case 'snapshot':
        renderer.setLayer(m.snap.loc, m.snap.caveSeed);
        renderer.applySnapshot(m.snap);
        updateMinimap(m.snap.px, m.snap.py, m.snap.loc, m.snap.caveSeed);
        lastStats = m.snap.stats;
        if (m.snap.tick % 6 === 0) updateHud(m.snap.stats, m.snap.time);
        if (m.snap.tick % 6 === 0 && isPanelOpen()) updatePanelStats(lastStats);
        break;
      case 'harvest':
        renderer.onHarvest(m.x, m.y, m.depleted);
        break;
      case 'inventory':
        refreshInv(m.inv);
        break;
      case 'quests':
        acceptedQuests = m.ids;
        if (isVillageOpen()) updateVillageDialog(lastSlots, acceptedQuests);
        break;
      case 'chest':
        setChestItems(m.id, m.items);
        break;
      case 'structures':
        renderer.setStructures(m.structures);
        break;
      case 'terrain':
        renderer.applyTerrain(m.edits, m.fluids);
        break;
      case 'floater':
        renderer.spawnFloat(m.text, m.color, m.x, m.y);
        break;
      case 'sfx': {
        const gain = Math.max(0, 1 - Math.hypot(m.x - renderer.prx, m.y - renderer.pry) / 16);
        if (gain > 0.02) gameSfx(m.sound, gain);
        break;
      }
      case 'save':
        latestSave = m.state;
        saveGameSync(m.state, custom); // durable de inmediato (localStorage)
        void saveGame(m.state, custom).then(() => {
          if (manualSave) { manualSave = false; toast('Partida guardada'); }
          if (pendingMenu) window.location.reload();
        });
        break;
    }
  };

  worker.postMessage({ t: 'init', mode, save: save ?? undefined });

  renderer.onInteract = (active, target) => worker.postMessage({ t: 'interact', active, target });
  renderer.onPlace = (x, y, item) => worker.postMessage({ t: 'place', item, x, y });
  renderer.onOpenStation = (type) => openStationCraft(type);
  renderer.onOpenChest = (id) => { worker.postMessage({ t: 'openChest', id }); openChestPanel(id, lastSlots); };
  renderer.onBoardBoat = (id) => worker.postMessage({ t: 'board', id });
  renderer.onSleep = () => worker.postMessage({ t: 'sleep' });
  renderer.onTalk = (id) => openVillageDialog(id, lastSlots, acceptedQuests);
  const sendEat = (item: string): void => worker.postMessage({ t: 'consume', item });
  renderer.onEat = sendEat;
  initVillageDialog({
    onBuy: (item) => worker.postMessage({ t: 'trade', action: 'buy', item }),
    onSell: (item) => worker.postMessage({ t: 'trade', action: 'sell', item }),
    onAccept: (id) => worker.postMessage({ t: 'acceptQuest', id }),
    onComplete: (id) => worker.postMessage({ t: 'completeQuest', id }),
  });

  type Addr = import('./shared/protocol').InvAddr;
  const sendMove = (from: Addr, to: Addr): void => worker.postMessage({ t: 'move', from, to });
  initPanel({ onMove: sendMove, onSort: () => worker.postMessage({ t: 'sortInv' }), onEat: sendEat });
  initChest({
    onMove: sendMove,
    onSortInv: () => worker.postMessage({ t: 'sortInv' }),
    onSortChest: (id) => worker.postMessage({ t: 'sortChest', id }),
    onQuick: (from, id) => worker.postMessage({ t: 'quickMove', from, id }),
    onMoveAmount: (from, id, amount) => worker.postMessage({ t: 'moveAmount', from, id, amount }),
    onEat: sendEat,
  });

  initHotbar((sel: HotbarSel) => {
    renderer.selected = sel;
    renderer.setHeldFromItem(sel.kind === 'tool' ? sel.item : null);
    worker.postMessage({ t: 'selectTool', item: sel.kind === 'tool' ? sel.item : null });
  });
  initCraft((id) => worker.postMessage({ t: 'craft', id }));

  const requestSave = (): void => { manualSave = true; worker.postMessage({ t: 'requestSave' }); };
  initPause({
    onSave: requestSave,
    onMainMenu: () => { pendingMenu = true; worker.postMessage({ t: 'requestSave' }); window.setTimeout(() => window.location.reload(), 1500); },
    musicOn: isMusicOn,
    toggleMusic,
    onPauseChange: (p) => setInputEnabled(!p),
  });

  setupInput((state) => worker.postMessage({ t: 'input', input: state }));

  window.addEventListener('keydown', (e) => {
    if (e.repeat || isCapturing()) return;
    const a = actionFor(e.code);
    if (!a) return;
    e.preventDefault();
    if (a === 'pause' && isVillageOpen()) { closeVillageDialog(); return; }
    if (a === 'pause') { togglePause(); return; }
    if (isPaused()) return; // el resto de acciones se bloquean en pausa
    switch (a) {
      case 'inventory': togglePanel(); updatePanel(lastSlots, lastStats); break;
      case 'craft': toggleCraft(); break;
      case 'map': toggleBigMap(); break;
      case 'jump': renderer.jump(); worker.postMessage({ t: 'jump' }); break;
      case 'drink': worker.postMessage({ t: 'drink' }); break;
      case 'save': requestSave(); break;
      case 'music': toggleMusic(); break;
      case 'controls': toggleControls(); break;
    }
  });

  // Muestra los controles una vez, la primera partida nueva.
  if (mode === 'new') {
    try {
      if (!localStorage.getItem('survival-seen-controls')) { localStorage.setItem('survival-seen-controls', '1'); showControls(); }
    } catch { /* ignora */ }
  }

  window.setInterval(() => worker.postMessage({ t: 'requestSave' }), AUTOSAVE_S * 1000);
  // Vuelca el último estado cacheado de forma SÍNCRONA al ocultar/cerrar la
  // pestaña (IndexedDB no llegaría a completar su escritura asíncrona).
  const flushSave = (): void => { if (latestSave) saveGameSync(latestSave, custom); };
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushSave(); worker.postMessage({ t: 'requestSave' }); } });
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('beforeunload', flushSave);
}

main().catch((err) => showError(String(err && err.stack ? err.stack : err)));
