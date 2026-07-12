// Inventario (tecla E): avatar, estadísticas, 27 ranuras (3x9) + barra de hotbar.
// Arrastrar objetos entre ranuras; botón de ordenar.

import { ITEMS } from '../shared/items';
import { itemSpriteURL } from './itemsprites';
import { drawAvatar, DEFAULT_CUSTOM, type Customization } from './avatar';
import { INV_MAIN, INV_HOTBAR, type Slot } from '../shared/inventory';
import { enableDrag, slotHtml } from './slotdrag';
import type { InvAddr, Stats } from '../shared/protocol';

const STAT_ROWS = [
  { key: 'health', label: 'Vida', color: '#e5484d' },
  { key: 'food', label: 'Comida', color: '#e8a13a' },
  { key: 'thirst', label: 'Sed', color: '#3aa0e8' },
  { key: 'stamina', label: 'Estamina', color: '#4cc85a' },
] as const;

let open = false;
let custom: Customization = { ...DEFAULT_CUSTOM };
let slots: Slot[] = [];
let lastStats: Stats = { health: 100, food: 100, thirst: 100, stamina: 100 };
let onMove: (from: InvAddr, to: InvAddr) => void = () => {};
let onSort: () => void = () => {};

export function initPanel(cb: { onMove: (from: InvAddr, to: InvAddr) => void; onSort: () => void }): void {
  onMove = cb.onMove; onSort = cb.onSort;
}
export function setPanelCustom(c: Customization): void { custom = c; }
export function isPanelOpen(): boolean { return open; }
export function togglePanel(): void { open = !open; render(); }
export function updatePanel(inv: Slot[], stats: Stats): void {
  slots = inv; lastStats = stats;
  if (open) render();
}

// Actualiza sólo las barras de estadísticas (sin reconstruir las ranuras),
// para no romper el arrastre ni parpadear cada fotograma.
export function updatePanelStats(stats: Stats): void {
  lastStats = stats;
  if (!open) return;
  for (const r of STAT_ROWS) {
    const v = Math.round((stats as unknown as Record<string, number>)[r.key]);
    const bar = document.querySelector<HTMLElement>(`#panel [data-sbar="${r.key}"]`);
    if (bar) bar.style.width = v + '%';
    const val = document.querySelector<HTMLElement>(`#panel [data-sval="${r.key}"]`);
    if (val) val.textContent = String(v);
  }
}

function cell(i: number): string {
  const s = slots[i];
  return slotHtml({ c: 'inv', i }, s ? itemSpriteURL(s.id) : null, s ? s.count : 0, s ? (ITEMS[s.id]?.name ?? s.id) : '');
}

function render(): void {
  let p = document.getElementById('panel');
  if (!p) { p = document.createElement('div'); p.id = 'panel'; document.body.appendChild(p); }
  p.style.display = open ? 'flex' : 'none';
  if (!open) return;

  const statsHtml = STAT_ROWS.map((r) => {
    const v = Math.round((lastStats as unknown as Record<string, number>)[r.key]);
    return `<div class="pstat"><span class="pstat-l">${r.label}</span><div class="pbar"><div data-sbar="${r.key}" style="width:${v}%;background:${r.color}"></div></div><b data-sval="${r.key}">${v}</b></div>`;
  }).join('');

  const grid = Array.from({ length: INV_MAIN }, (_, i) => cell(i)).join('');
  const bar = Array.from({ length: INV_HOTBAR }, (_, i) => cell(INV_MAIN + i)).join('');

  p.innerHTML = `
    <div class="panel-card">
      <button class="panel-close" id="panel-close" title="Cerrar">&times;</button>
      <div class="panel-left">
        <canvas id="panel-av" width="150" height="200"></canvas>
        <div class="pstats">${statsHtml}</div>
      </div>
      <div class="panel-right">
        <div class="inv-headrow"><h3>Inventario</h3><button class="sort-btn" id="inv-sort">Ordenar</button></div>
        <div class="inv-grid">${grid}</div>
        <div class="inv-bar-label">Acceso rápido</div>
        <div class="inv-bar">${bar}</div>
      </div>
    </div>`;

  const cv = document.getElementById('panel-av') as HTMLCanvasElement | null;
  if (cv) { const ctx = cv.getContext('2d'); if (ctx) drawAvatar(ctx, custom, cv.width / 2, cv.height - 12, 2.0); }
  document.getElementById('panel-close')?.addEventListener('click', () => { open = false; render(); });
  document.getElementById('inv-sort')?.addEventListener('click', () => onSort());
  const card = p.querySelector('.panel-card') as HTMLElement | null;
  if (card) enableDrag(card, onMove);
}
