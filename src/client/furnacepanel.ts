// Panel del horno: 3 ranuras (material arriba, combustible abajo, salida a la
// derecha) con barra de fundido y llama de combustible. El horno funde con el
// tiempo (no es instantáneo). Debajo, el inventario del jugador para arrastrar.

import { ITEMS } from '../shared/items';
import { itemSpriteURL } from './itemsprites';
import { INV_MAIN, INV_HOTBAR, type Slot } from '../shared/inventory';
import { enableDrag, slotHtml } from './slotdrag';
import type { InvAddr } from '../shared/protocol';

export interface FurnaceView { id: number; fuel: Slot; input: Slot; output: Slot; cook: number; cookMax: number; burn: number; burnMax: number; }

let open = false;
let furnaceId = -1;
let view: FurnaceView = { id: -1, fuel: null, input: null, output: null, cook: 0, cookMax: 0, burn: 0, burnMax: 0 };
let playerSlots: Slot[] = [];
let onMove: (from: InvAddr, to: InvAddr) => void = () => {};
let onClose: () => void = () => {};

export function initFurnace(cb: { onMove: (from: InvAddr, to: InvAddr) => void; onClose: () => void }): void {
  onMove = cb.onMove; onClose = cb.onClose;
}
export function isFurnaceOpen(): boolean { return open; }
export function openFurnacePanel(id: number, playerInv: Slot[]): void {
  open = true; furnaceId = id; playerSlots = playerInv;
  view = { id, fuel: null, input: null, output: null, cook: 0, cookMax: 0, burn: 0, burnMax: 0 };
  render();
}
export function closeFurnacePanel(): void { if (!open) return; open = false; onClose(); render(); }

// Actualiza el horno. Para no romper la interacción (clic en la X, arrastre), solo
// se RECONSTRUYE el panel cuando cambian las RANURAS; el progreso (llama + barra)
// se actualiza tocando dos estilos, sin rehacer el HTML cada tick.
function slotKey(s: Slot): string { return s ? s.id + 'x' + s.count : '-'; }
export function setFurnaceView(v: FurnaceView): void {
  if (v.id !== furnaceId) return;
  const changed = slotKey(v.fuel) + slotKey(v.input) + slotKey(v.output) !== slotKey(view.fuel) + slotKey(view.input) + slotKey(view.output);
  view = v;
  if (!open) return;
  if (changed) render();
  else updateProgress();
}
function updateProgress(): void {
  const flame = document.querySelector<HTMLElement>('#furnace .furnace-flame-fill');
  const arrow = document.querySelector<HTMLElement>('#furnace .furnace-arrow-fill');
  if (flame) flame.style.height = (view.burnMax > 0 ? Math.min(100, (100 * view.burn) / view.burnMax) : 0) + '%';
  if (arrow) arrow.style.width = (view.cookMax > 0 ? Math.min(100, (100 * view.cook) / view.cookMax) : 0) + '%';
}
export function updateFurnaceInv(slots: Slot[]): void { playerSlots = slots; if (open) render(); }

function fslot(i: number, s: Slot, label: string): string {
  const extra = s ? '' : `<span class="armor-hint">${label}</span>`;
  return slotHtml({ c: 'furnace', id: furnaceId, i }, s ? itemSpriteURL(s.id) : null, s ? s.count : 0, s ? (ITEMS[s.id]?.name ?? s.id) : label, extra);
}
function invCell(i: number): string {
  const s = playerSlots[i];
  return slotHtml({ c: 'inv', i }, s ? itemSpriteURL(s.id) : null, s ? s.count : 0, s ? (ITEMS[s.id]?.name ?? s.id) : '');
}

function render(): void {
  let p = document.getElementById('furnace');
  if (!p) { p = document.createElement('div'); p.id = 'furnace'; document.body.appendChild(p); }
  p.style.display = open ? 'flex' : 'none';
  if (!open) return;

  const cookPct = view.cookMax > 0 ? Math.min(100, (100 * view.cook) / view.cookMax) : 0;
  const burnPct = view.burnMax > 0 ? Math.min(100, (100 * view.burn) / view.burnMax) : 0;
  const invGrid = Array.from({ length: INV_MAIN }, (_, i) => invCell(i)).join('');
  const invBar = Array.from({ length: INV_HOTBAR }, (_, i) => invCell(INV_MAIN + i)).join('');

  p.innerHTML = `
    <div class="furnace-card">
      <button class="panel-close" id="furnace-close" title="Cerrar">&times;</button>
      <h3>Horno</h3>
      <div class="furnace-machine">
        <div class="furnace-col">
          ${fslot(1, view.input, 'Material')}
          <div class="furnace-flame" title="Combustible"><div class="furnace-flame-fill" style="height:${burnPct}%"></div></div>
          ${fslot(0, view.fuel, 'Combustible')}
        </div>
        <div class="furnace-arrow"><div class="furnace-arrow-fill" style="width:${cookPct}%"></div></div>
        <div class="furnace-out">${fslot(2, view.output, 'Salida')}</div>
      </div>
      <div class="inv-headrow" style="margin-top:12px"><h3>Inventario</h3></div>
      <div class="inv-grid">${invGrid}</div>
      <div class="inv-bar-label">Acceso rápido</div>
      <div class="inv-bar">${invBar}</div>
    </div>`;

  document.getElementById('furnace-close')?.addEventListener('click', closeFurnacePanel);
  const card = p.querySelector('.furnace-card') as HTMLElement | null;
  if (card) enableDrag(card, onMove, {});
}
