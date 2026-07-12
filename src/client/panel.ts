// Panel de inventario (tecla por defecto E): avatar, estadísticas, cuadrícula de
// 27 ranuras (3x9) y barra de acceso rápido (hotbar) abajo, todo con sprites.

import { ITEMS } from '../shared/items';
import { itemSpriteURL } from './itemsprites';
import { drawAvatar, DEFAULT_CUSTOM, type Customization } from './avatar';
import type { InvEntry, Stats } from '../shared/protocol';

const GRID = 27;
const BAR = 9;
const STAT_ROWS = [
  { key: 'health', label: 'Vida', color: '#e5484d' },
  { key: 'food', label: 'Comida', color: '#e8a13a' },
  { key: 'thirst', label: 'Sed', color: '#3aa0e8' },
  { key: 'stamina', label: 'Estamina', color: '#4cc85a' },
] as const;

let open = false;
let custom: Customization = { ...DEFAULT_CUSTOM };
let lastInv: InvEntry[] = [];
let lastStats: Stats = { health: 100, food: 100, thirst: 100, stamina: 100 };

function ensure(): HTMLElement {
  let p = document.getElementById('panel');
  if (!p) { p = document.createElement('div'); p.id = 'panel'; document.body.appendChild(p); }
  return p;
}

export function setPanelCustom(c: Customization): void { custom = c; }
export function isPanelOpen(): boolean { return open; }
export function togglePanel(): void { open = !open; render(); }
export function updatePanel(inv: InvEntry[], stats: Stats): void {
  lastInv = inv; lastStats = stats;
  if (open) render();
}

function slotHtml(e: InvEntry | undefined): string {
  if (!e) return `<div class="islot"></div>`;
  const d = ITEMS[e.id];
  const badge = e.count > 1 ? `<span class="icount">${e.count}</span>` : '';
  return `<div class="islot" title="${d ? d.name : e.id}"><span class="isprite" style="background-image:url(${itemSpriteURL(e.id)})"></span>${badge}</div>`;
}

function render(): void {
  const p = ensure();
  p.style.display = open ? 'flex' : 'none';
  if (!open) return;

  const statsHtml = STAT_ROWS.map((r) => {
    const v = Math.round((lastStats as unknown as Record<string, number>)[r.key]);
    return `<div class="pstat"><span class="pstat-l">${r.label}</span><div class="pbar"><div style="width:${v}%;background:${r.color}"></div></div><b>${v}</b></div>`;
  }).join('');

  const hotbar = lastInv.filter((e) => ITEMS[e.id]?.tool || ITEMS[e.id]?.place || ITEMS[e.id]?.boat);
  const main = lastInv.filter((e) => !(ITEMS[e.id]?.tool || ITEMS[e.id]?.place || ITEMS[e.id]?.boat));
  const grid = Array.from({ length: GRID }, (_, i) => slotHtml(main[i])).join('');
  const bar = Array.from({ length: BAR }, (_, i) => slotHtml(hotbar[i])).join('');

  p.innerHTML = `
    <div class="panel-card">
      <button class="panel-close" id="panel-close" title="Cerrar">&times;</button>
      <div class="panel-left">
        <canvas id="panel-av" width="150" height="200"></canvas>
        <div class="pstats">${statsHtml}</div>
      </div>
      <div class="panel-right">
        <h3>Inventario</h3>
        <div class="inv-grid">${grid}</div>
        <div class="inv-bar-label">Acceso rápido</div>
        <div class="inv-bar">${bar}</div>
      </div>
    </div>`;

  const cv = document.getElementById('panel-av') as HTMLCanvasElement | null;
  if (cv) { const ctx = cv.getContext('2d'); if (ctx) drawAvatar(ctx, custom, cv.width / 2, cv.height - 12, 2.0); }
  document.getElementById('panel-close')?.addEventListener('click', () => { open = false; render(); });
}
