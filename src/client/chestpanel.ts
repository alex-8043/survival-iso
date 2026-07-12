// Panel del cofre: 27 ranuras del cofre arriba y el inventario del jugador
// (27 + hotbar 9) abajo. Arrastrar entre ambos; botones de ordenar.

import { ITEMS } from '../shared/items';
import { itemSpriteURL } from './itemsprites';
import { INV_MAIN, INV_HOTBAR, CHEST_SIZE, type Slot } from '../shared/inventory';
import { enableDrag, slotHtml } from './slotdrag';
import type { InvAddr } from '../shared/protocol';

let open = false;
let chestId = -1;
let chestSlots: Slot[] = [];
let playerSlots: Slot[] = [];
let onMove: (from: InvAddr, to: InvAddr) => void = () => {};
let onSortInv: () => void = () => {};
let onSortChest: (id: number) => void = () => {};

export function initChest(cb: { onMove: (from: InvAddr, to: InvAddr) => void; onSortInv: () => void; onSortChest: (id: number) => void }): void {
  onMove = cb.onMove; onSortInv = cb.onSortInv; onSortChest = cb.onSortChest;
}
export function isChestOpen(): boolean { return open; }
export function openChestPanel(id: number, playerInv: Slot[]): void {
  open = true; chestId = id; playerSlots = playerInv; render();
}
export function closeChest(): void { open = false; render(); }
export function setChestItems(id: number, items: Slot[]): void {
  if (id !== chestId) return;
  chestSlots = items;
  if (open) render();
}
export function updateChestInv(slots: Slot[]): void {
  playerSlots = slots;
  if (open) render();
}

function chestCell(i: number): string {
  const s = chestSlots[i];
  return slotHtml({ c: 'chest', id: chestId, i }, s ? itemSpriteURL(s.id) : null, s ? s.count : 0, s ? (ITEMS[s.id]?.name ?? s.id) : '');
}
function invCell(i: number): string {
  const s = playerSlots[i];
  return slotHtml({ c: 'inv', i }, s ? itemSpriteURL(s.id) : null, s ? s.count : 0, s ? (ITEMS[s.id]?.name ?? s.id) : '');
}

function render(): void {
  let p = document.getElementById('chest');
  if (!p) { p = document.createElement('div'); p.id = 'chest'; document.body.appendChild(p); }
  p.style.display = open ? 'flex' : 'none';
  if (!open) return;

  const chestGrid = Array.from({ length: CHEST_SIZE }, (_, i) => chestCell(i)).join('');
  const invGrid = Array.from({ length: INV_MAIN }, (_, i) => invCell(i)).join('');
  const invBar = Array.from({ length: INV_HOTBAR }, (_, i) => invCell(INV_MAIN + i)).join('');

  p.innerHTML = `
    <div class="chest-card">
      <button class="panel-close" id="chest-close" title="Cerrar">&times;</button>
      <div class="inv-headrow"><h3>Cofre</h3><button class="sort-btn" id="chest-sort">Ordenar</button></div>
      <div class="inv-grid">${chestGrid}</div>
      <div class="inv-headrow" style="margin-top:14px"><h3>Inventario</h3><button class="sort-btn" id="chest-inv-sort">Ordenar</button></div>
      <div class="inv-grid">${invGrid}</div>
      <div class="inv-bar-label">Acceso rápido</div>
      <div class="inv-bar">${invBar}</div>
    </div>`;

  document.getElementById('chest-close')?.addEventListener('click', closeChest);
  document.getElementById('chest-sort')?.addEventListener('click', () => onSortChest(chestId));
  document.getElementById('chest-inv-sort')?.addEventListener('click', () => onSortInv());
  const card = p.querySelector('.chest-card') as HTMLElement | null;
  if (card) enableDrag(card, onMove);
}
