// Panel de inventario (Tab): avatar, estadísticas y recursos.

import { ITEMS } from '../shared/items';
import { skinById, hex } from './skins';
import type { InvEntry, Stats } from '../shared/protocol';

const STAT_ROWS = [
  { key: 'health', label: 'Vida', color: '#e5484d' },
  { key: 'food', label: 'Comida', color: '#e8a13a' },
  { key: 'thirst', label: 'Sed', color: '#3aa0e8' },
  { key: 'stamina', label: 'Estamina', color: '#4cc85a' },
] as const;

let open = false;
let skin = 'amber';
let lastInv: InvEntry[] = [];
let lastStats: Stats = { health: 100, food: 100, thirst: 100, stamina: 100 };

function ensure(): HTMLElement {
  let p = document.getElementById('panel');
  if (!p) {
    p = document.createElement('div');
    p.id = 'panel';
    document.body.appendChild(p);
  }
  return p;
}

export function setPanelSkin(id: string): void {
  skin = id;
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

  const sk = skinById(skin);
  const statsHtml = STAT_ROWS.map((r) => {
    const v = Math.round((lastStats as unknown as Record<string, number>)[r.key]);
    return (
      `<div class="pstat"><span class="pstat-l">${r.label}</span>` +
      `<div class="pbar"><div style="width:${v}%;background:${r.color}"></div></div><b>${v}</b></div>`
    );
  }).join('');

  const itemsHtml = lastInv.length
    ? lastInv
        .map((e) => {
          const d = ITEMS[e.id];
          const c = d ? hex(d.color) : '#888888';
          const n = d ? d.name : e.id;
          return (
            `<div class="pslot"><span class="pswatch" style="background:${c}"></span>` +
            `<span class="pname">${n}</span><span class="pcount">${e.count}</span></div>`
          );
        })
        .join('')
    : '<div class="pempty">Sin recursos todavía</div>';

  p.innerHTML = `
    <div class="panel-card">
      <button class="panel-close" id="panel-close" title="Cerrar (Tab)">&times;</button>
      <div class="panel-left">
        <div class="avatar">
          <span class="av-head" style="background:${hex(sk.head)}"></span>
          <span class="av-body" style="background:${hex(sk.body)}"></span>
          <span class="av-belt" style="background:${hex(sk.belt)}"></span>
        </div>
        <div class="av-name">${sk.name}</div>
        <div class="pstats">${statsHtml}</div>
      </div>
      <div class="panel-right">
        <h3>Recursos</h3>
        <div class="pslots">${itemsHtml}</div>
      </div>
    </div>`;

  const close = document.getElementById('panel-close');
  if (close)
    close.addEventListener('click', () => {
      open = false;
      render();
    });
}
