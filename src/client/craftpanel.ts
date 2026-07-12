// Panel de crafteo (tecla C). Recetas agrupadas por categoría.

import { RECIPES, RECIPE_CATS, type Recipe } from '../shared/recipes';
import { ITEMS } from '../shared/items';
import type { InvEntry } from '../shared/protocol';

let open = false;
let counts: Record<string, number> = {};
let onCraft: (id: string) => void = () => {};

function have(item: string): number {
  return counts[item] || 0;
}
function canAfford(r: Recipe): boolean {
  return Object.keys(r.ingredients).every((k) => have(k) >= r.ingredients[k]);
}

export function initCraft(cb: (id: string) => void): void {
  onCraft = cb;
}
export function isCraftOpen(): boolean {
  return open;
}
export function toggleCraft(): void {
  open = !open;
  render();
}
export function updateCraft(inv: InvEntry[]): void {
  counts = {};
  for (const e of inv) counts[e.id] = e.count;
  if (open) render();
}

function render(): void {
  let panel = document.getElementById('craft');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'craft';
    document.body.appendChild(panel);
  }
  panel.style.display = open ? 'flex' : 'none';
  if (!open) return;

  const cats = RECIPE_CATS.map((cat) => {
    const rs = RECIPES.filter((r) => r.cat === cat);
    if (!rs.length) return '';
    const cards = rs
      .map((r) => {
        const afford = canAfford(r);
        const ing = Object.keys(r.ingredients)
          .map((k) => {
            const ok = have(k) >= r.ingredients[k];
            const nm = ITEMS[k]?.name ?? k;
            return `<span class="ing ${ok ? 'ok' : 'no'}">${r.ingredients[k]} ${nm}</span>`;
          })
          .join('');
        const st = r.station ? `<div class="needs">Requiere: ${ITEMS[r.station]?.name ?? r.station}</div>` : '';
        return (
          `<div class="craft-card">` +
          `<div class="craft-name">${r.name}</div>` +
          `<div class="craft-ing">${ing}</div>${st}` +
          `<button class="craft-btn" data-id="${r.id}" ${afford ? '' : 'disabled'}>Craftear</button>` +
          `</div>`
        );
      })
      .join('');
    return `<div class="craft-cat"><h4>${cat}</h4><div class="craft-grid">${cards}</div></div>`;
  }).join('');

  panel.innerHTML = `<div class="craft-card-wrap"><button class="panel-close" id="craft-close" title="Cerrar (C)">&times;</button><h3>Crafteo</h3>${cats}</div>`;
  panel.querySelectorAll('.craft-btn').forEach((b) =>
    b.addEventListener('click', () => onCraft((b as HTMLElement).dataset.id!))
  );
  const close = document.getElementById('craft-close');
  if (close) close.addEventListener('click', () => { open = false; render(); });
}
