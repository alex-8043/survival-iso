// Paneles de crafteo. Tab = crafteo básico (sin estación). Acceder a una mesa /
// horno / herrería colocados abre su panel con sus recetas.

import { RECIPES, RECIPE_CATS, type Recipe } from '../shared/recipes';
import { ITEMS } from '../shared/items';
import { itemSpriteURL } from './itemsprites';
import { slotCounts, type Slot } from '../shared/inventory';

let open = false;
let station: string | null = null; // null = crafteo básico
let counts: Record<string, number> = {};
let onCraft: (id: string) => void = () => {};

function have(item: string): number { return counts[item] || 0; }
function canAfford(r: Recipe): boolean {
  return Object.keys(r.ingredients).every((k) => have(k) >= r.ingredients[k]);
}
function recipesFor(st: string | null): Recipe[] {
  return RECIPES.filter((r) => (st === null ? !r.station : r.station === st));
}

export function initCraft(cb: (id: string) => void): void { onCraft = cb; }
export function isCraftOpen(): boolean { return open; }

export function toggleCraft(): void { // crafteo básico (Tab)
  if (open && station === null) { open = false; render(); return; }
  open = true; station = null; render();
}
export function openStationCraft(type: string): void {
  open = true; station = type; render();
}
export function closeCraft(): void { open = false; render(); }

export function updateCraft(inv: Slot[]): void {
  counts = slotCounts(inv);
  if (open) render();
}

function cardHtml(r: Recipe): string {
  const afford = canAfford(r);
  const ing = Object.keys(r.ingredients).map((k) => {
    const ok = have(k) >= r.ingredients[k];
    return `<span class="ing ${ok ? 'ok' : 'no'}"><span class="ing-ic" style="background-image:url(${itemSpriteURL(k)})"></span>${r.ingredients[k]} ${ITEMS[k]?.name ?? k}</span>`;
  }).join('');
  const cnt = r.out.count > 1 ? ` ×${r.out.count}` : '';
  return `<div class="craft-card">` +
    `<div class="craft-head"><span class="craft-out" style="background-image:url(${itemSpriteURL(r.out.item)})"></span><span class="craft-name">${r.name}${cnt}</span></div>` +
    `<div class="craft-ing">${ing}</div>` +
    `<button class="craft-btn" data-id="${r.id}" ${afford ? '' : 'disabled'}>Fabricar</button></div>`;
}

function render(): void {
  let panel = document.getElementById('craft');
  if (!panel) { panel = document.createElement('div'); panel.id = 'craft'; document.body.appendChild(panel); }
  panel.style.display = open ? 'flex' : 'none';
  if (!open) return;

  const list = recipesFor(station);
  const cats = RECIPE_CATS.map((cat) => {
    const rs = list.filter((r) => r.cat === cat);
    if (!rs.length) return '';
    return `<div class="craft-cat"><h4>${cat}</h4><div class="craft-grid">${rs.map(cardHtml).join('')}</div></div>`;
  }).join('');

  const title = station
    ? `<span class="craft-title-ic" style="background-image:url(${itemSpriteURL(station)})"></span>${ITEMS[station]?.name ?? station}`
    : 'Crafteo básico';
  const empty = cats ? '' : '<p class="craft-empty">Nada que fabricar aquí todavía.</p>';

  panel.innerHTML = `<div class="craft-card-wrap"><button class="panel-close" id="craft-close" title="Cerrar">&times;</button><h3 class="craft-title">${title}</h3>${cats}${empty}</div>`;
  panel.querySelectorAll('.craft-btn').forEach((b) =>
    b.addEventListener('click', () => onCraft((b as HTMLElement).dataset.id!))
  );
  document.getElementById('craft-close')?.addEventListener('click', () => { open = false; render(); });
}
