// Panel de inventario (Tab): avatar personalizado, estadísticas y recursos.

import { ITEMS } from '../shared/items';
import { drawAvatar, DEFAULT_CUSTOM, type Customization } from './avatar';
import type { InvEntry, Stats } from '../shared/protocol';

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

function css(n: number): string {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}

function ensure(): HTMLElement {
  let p = document.getElementById('panel');
  if (!p) {
    p = document.createElement('div');
    p.id = 'panel';
    document.body.appendChild(p);
  }
  return p;
}

export function setPanelCustom(c: Customization): void {
  custom = c;
}
export function isPanelOpen(): boolean {
  return open;
}
export function togglePanel(): void {
  open = !open;
  render();
}
export function updatePanel(inv: InvEntry[], stats: Stats): void {
  lastInv = inv;
  lastStats = stats;
  if (open) render();
}

function render(): void {
  const p = ensure();
  p.style.display = open ? 'flex' : 'none';
  if (!open) return;

  const statsHtml = STAT_ROWS.map((r) => {
    const v = Math.round((lastStats as unknown as Record<string, number>)[r.key]);
    return `<div class="pstat"><span class="pstat-l">${r.label}</span><div class="pbar"><div style="width:${v}%;background:${r.color}"></div></div><b>${v}</b></div>`;
  }).join('');

  const itemsHtml = lastInv.length
    ? lastInv
        .map((e) => {
          const d = ITEMS[e.id];
          const c = d ? css(d.color) : '#888888';
          const n = d ? d.name : e.id;
          return `<div class="pslot"><span class="pswatch" style="background:${c}"></span><span class="pname">${n}</span><span class="pcount">${e.count}</span></div>`;
        })
        .join('')
    : '<div class="pempty">Sin recursos todavía</div>';

  p.innerHTML = `
    <div class="panel-card">
      <button class="panel-close" id="panel-close" title="Cerrar (Tab)">&times;</button>
      <div class="panel-left">
        <canvas id="panel-av" width="150" height="200"></canvas>
        <div class="pstats">${statsHtml}</div>
      </div>
      <div class="panel-right">
        <h3>Recursos</h3>
        <div class="pslots">${itemsHtml}</div>
      </div>
    </div>`;

  const cv = document.getElementById('panel-av') as HTMLCanvasElement | null;
  if (cv) {
    const ctx = cv.getContext('2d');
    if (ctx) drawAvatar(ctx, custom, cv.width / 2, cv.height - 12, 2.0);
  }
  const close = document.getElementById('panel-close');
  if (close)
    close.addEventListener('click', () => {
      open = false;
      render();
    });
}
