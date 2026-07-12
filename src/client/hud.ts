// UI de inventario (DOM). Barra inferior con ranuras por ítem.

import { ITEMS } from '../shared/items';
import type { InvEntry } from '../shared/protocol';

function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

export function renderInventory(entries: InvEntry[]): void {
  let bar = document.getElementById('inventory');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'inventory';
    document.body.appendChild(bar);
  }

  if (!entries.length) {
    bar.innerHTML =
      '<div class="inv-empty">Inventario vacío — acércate a un árbol o roca y mantén <b>E</b></div>';
    return;
  }

  bar.innerHTML = entries
    .map((e) => {
      const def = ITEMS[e.id];
      const color = def ? hex(def.color) : '#888888';
      const name = def ? def.name : e.id;
      return (
        '<div class="inv-slot">' +
        `<span class="inv-swatch" style="background:${color}"></span>` +
        `<span class="inv-name">${name}</span>` +
        `<span class="inv-count">${e.count}</span>` +
        '</div>'
      );
    })
    .join('');
}
