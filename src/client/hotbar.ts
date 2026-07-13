// Hotbar: refleja las 9 últimas ranuras del inventario (INV_MAIN..). Teclas 1-9,
// rueda o clic. Una ranura vacía = manos.

import { ITEMS, toolMaxDur } from '../shared/items';
import { itemSpriteURL } from './itemsprites';
import { INV_MAIN, INV_HOTBAR } from '../shared/inventory';
import type { Slot } from '../shared/inventory';

// Barra de durabilidad para una ranura de herramienta (verde -> rojo).
export function durBar(s: NonNullable<Slot>): string {
  if (s.dur === undefined) return '';
  const max = toolMaxDur(s.id) || 1;
  const f = Math.max(0, Math.min(1, s.dur / max));
  const col = f > 0.5 ? '#5fd35f' : f > 0.25 ? '#e0c040' : '#e05555';
  return `<span class="durbar"><span style="width:${(f * 100).toFixed(0)}%;background:${col}"></span></span>`;
}

export interface HotbarSel {
  kind: 'hand' | 'tool' | 'place' | 'boat';
  item: string | null;
}

let hot: Slot[] = new Array(INV_HOTBAR).fill(null);
let idx = 0;
let onSel: (s: HotbarSel) => void = () => {};

function selOf(item: string | null): HotbarSel {
  if (!item) return { kind: 'hand', item: null };
  const d = ITEMS[item];
  if (d?.tool) return { kind: 'tool', item };
  if (d?.boat) return { kind: 'boat', item };
  if (d?.place) return { kind: 'place', item };
  return { kind: 'hand', item: null };
}

export function currentSel(): HotbarSel {
  return selOf(hot[idx]?.id ?? null);
}
function emit(): void { onSel(currentSel()); }

export function initHotbar(onSelect: (s: HotbarSel) => void): void {
  onSel = onSelect;
  window.addEventListener('keydown', (e) => {
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= INV_HOTBAR) { idx = n - 1; render(); emit(); }
    }
  });
  // La rueda del ratón ahora hace zoom; la hotbar se cambia con 1-9 o clic.
  render();
  emit();
}

export function updateHotbar(slots: Slot[]): void {
  hot = slots.slice(INV_MAIN, INV_MAIN + INV_HOTBAR);
  while (hot.length < INV_HOTBAR) hot.push(null);
  render();
  emit();
}

function render(): void {
  let bar = document.getElementById('hotbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'hotbar'; document.body.appendChild(bar); }
  bar.innerHTML = hot
    .map((s, i) => {
      const sel = i === idx ? ' sel' : '';
      const key = `<span class="hkey">${i + 1}</span>`;
      if (!s) return `<div class="hslot empty${sel}" data-i="${i}">${key}</div>`;
      const d = ITEMS[s.id];
      const badge = s.count > 1 ? `<span class="hcount">${s.count}</span>` : '';
      return `<div class="hslot${sel}" data-i="${i}" title="${d ? d.name : s.id}">${key}<span class="hicon himg" style="background-image:url(${itemSpriteURL(s.id)})"></span>${badge}${durBar(s)}</div>`;
    })
    .join('');
  bar.querySelectorAll('.hslot').forEach((elm) =>
    elm.addEventListener('click', () => { idx = parseInt((elm as HTMLElement).dataset.i!, 10); render(); emit(); })
  );
}
