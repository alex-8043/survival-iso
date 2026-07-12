// Diálogo del aldeano: comercio (compra/venta por monedas) y misión.
// Se abre al hacer clic sobre un aldeano dentro de una aldea.

import { SELL, BUY, questFor } from '../shared/trades';
import { ITEMS } from '../shared/items';
import { countIn, type Slot } from '../shared/inventory';
import { itemSpriteURL } from './itemsprites';

interface VillageCbs {
  onBuy: (item: string) => void;
  onSell: (item: string) => void;
  onAccept: (id: number) => void;
  onComplete: (id: number) => void;
}

let cbs: VillageCbs | null = null;
let open = false;
let curId = 0;
let lastInv: Slot[] = [];
let acceptedIds: number[] = [];

function coinIcon(): string {
  return `<span class="vcoin" style="background-image:url(${itemSpriteURL('coin')})"></span>`;
}

function tradeRow(kind: 'buy' | 'sell', id: string, price: number, ok: boolean, have?: number): string {
  const name = ITEMS[id]?.name || id;
  const haveBadge = kind === 'sell' && have !== undefined ? `<span class="vrow-have">×${have}</span>` : '';
  return `<div class="vrow">`
    + `<span class="vrow-ic" style="background-image:url(${itemSpriteURL(id)})"></span>`
    + `<span class="vrow-name">${name}</span>${haveBadge}`
    + `<button class="vbtn sm" data-act="${kind}" data-id="${id}" ${ok ? '' : 'disabled'}>`
    + `${kind === 'sell' ? 'Vender' : 'Comprar'} ${coinIcon()}${price}</button>`
    + `</div>`;
}

function render(): void {
  const card = document.getElementById('village-body');
  if (!card) return;
  const inv = lastInv;
  const coins = countIn(inv, 'coin');
  const q = questFor(curId);
  const accepted = acceptedIds.includes(curId);
  const have = countIn(inv, q.item);
  const qName = ITEMS[q.item]?.name || q.item;

  const questHtml = accepted
    ? `<div class="vquest"><div class="vq-txt">Trae <b>${q.count}× ${qName}</b><div class="vq-sub">Recompensa: ${coinIcon()}${q.reward} · tienes ${have}/${q.count}</div></div>`
      + `<button class="vbtn" id="vq-complete" ${have >= q.count ? '' : 'disabled'}>Entregar</button></div>`
    : `<div class="vquest"><div class="vq-txt">Misión: trae <b>${q.count}× ${qName}</b><div class="vq-sub">Recompensa: ${coinIcon()}${q.reward}</div></div>`
      + `<button class="vbtn" id="vq-accept">Aceptar</button></div>`;

  const sellItems = Object.keys(SELL).filter((id) => countIn(inv, id) > 0);
  const sellHtml = sellItems.length
    ? sellItems.map((id) => tradeRow('sell', id, SELL[id], true, countIn(inv, id))).join('')
    : '<div class="vempty">No tienes materiales que vender ahora mismo.</div>';
  const buyHtml = Object.keys(BUY).map((id) => tradeRow('buy', id, BUY[id], coins >= BUY[id])).join('');

  card.innerHTML =
    `<div class="vsec"><h4>Misión</h4>${questHtml}</div>`
    + `<div class="vcols">`
    + `<div class="vsec"><h4>Vender</h4>${sellHtml}</div>`
    + `<div class="vsec"><h4>Comprar</h4>${buyHtml}</div>`
    + `</div>`;

  document.getElementById('vq-accept')?.addEventListener('click', () => { if (cbs) cbs.onAccept(curId); });
  document.getElementById('vq-complete')?.addEventListener('click', () => { if (cbs) cbs.onComplete(curId); });
  card.querySelectorAll('button.vbtn.sm').forEach((b) =>
    b.addEventListener('click', () => {
      const el = b as HTMLElement;
      const id = el.dataset.id!;
      if (!cbs) return;
      if (el.dataset.act === 'sell') cbs.onSell(id); else cbs.onBuy(id);
    }),
  );

  const coinEl = document.getElementById('village-coins');
  if (coinEl) coinEl.innerHTML = `${coinIcon()} ${coins}`;
}

function ensure(): HTMLElement {
  let overlay = document.getElementById('village');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'village';
    overlay.innerHTML =
      `<div class="village-card"><button class="panel-close" id="village-close" title="Cerrar">&times;</button>`
      + `<div class="village-head"><h3>Aldeano</h3><span id="village-coins" class="village-coins"></span></div>`
      + `<div id="village-body"></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeVillageDialog(); });
    document.getElementById('village-close')?.addEventListener('click', closeVillageDialog);
  }
  return overlay;
}

export function initVillageDialog(c: VillageCbs): void {
  cbs = c;
  ensure();
}

export function openVillageDialog(id: number, inv: Slot[], accepted: number[]): void {
  ensure();
  curId = id;
  lastInv = inv;
  acceptedIds = accepted;
  open = true;
  render();
  const o = document.getElementById('village');
  if (o) o.style.display = 'flex';
}

export function updateVillageDialog(inv: Slot[], accepted: number[]): void {
  lastInv = inv;
  acceptedIds = accepted;
  if (open) render();
}

export function isVillageOpen(): boolean { return open; }

export function closeVillageDialog(): void {
  open = false;
  const o = document.getElementById('village');
  if (o) o.style.display = 'none';
}
