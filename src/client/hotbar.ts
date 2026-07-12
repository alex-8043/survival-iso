// Hotbar de 9 ranuras fijas: mano (1) + herramientas / colocables / barca.
// Teclas 1-9, rueda o clic. Las herramientas muestran su sprite.

import { ITEMS } from '../shared/items';
import { toolIconCanvas } from './avatar';
import type { InvEntry } from '../shared/protocol';

export interface HotbarSel {
  kind: 'hand' | 'tool' | 'place' | 'boat';
  item: string | null;
}

const SLOT_COUNT = 9;
let slots: (string | null)[] = new Array(SLOT_COUNT).fill(null);
slots[0] = 'hand';
let idx = 0;
let counts: Record<string, number> = {};
let onSel: (s: HotbarSel) => void = () => {};
const iconCache: Record<string, string> = {};

function css(n: number): string {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}

function selOf(item: string | null): HotbarSel {
  if (!item || item === 'hand') return { kind: 'hand', item: null };
  const d = ITEMS[item];
  if (d?.tool) return { kind: 'tool', item };
  if (d?.boat) return { kind: 'boat', item };
  if (d?.place) return { kind: 'place', item };
  return { kind: 'hand', item: null };
}

export function currentSel(): HotbarSel {
  return selOf(slots[idx]);
}

function emit(): void {
  onSel(currentSel());
}

export function initHotbar(onSelect: (s: HotbarSel) => void): void {
  onSel = onSelect;
  window.addEventListener('keydown', (e) => {
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= SLOT_COUNT) {
        idx = n - 1;
        render();
        emit();
      }
    }
  });
  window.addEventListener('wheel', (e) => {
    // avanza a la siguiente ranura no vacía
    for (let s = 0; s < SLOT_COUNT; s++) {
      idx = (idx + (e.deltaY > 0 ? 1 : -1) + SLOT_COUNT) % SLOT_COUNT;
      if (slots[idx]) break;
    }
    render();
    emit();
  }, { passive: true });
  render();
  emit();
}

export function updateHotbar(inv: InvEntry[]): void {
  counts = {};
  for (const e of inv) counts[e.id] = e.count;
  const tools = inv.filter((e) => ITEMS[e.id]?.tool).map((e) => e.id);
  const places = inv.filter((e) => ITEMS[e.id]?.place).map((e) => e.id);
  const boats = inv.filter((e) => ITEMS[e.id]?.boat).map((e) => e.id);
  const items = [...tools, ...places, ...boats];
  const cur = slots[idx];
  slots = new Array(SLOT_COUNT).fill(null);
  slots[0] = 'hand';
  for (let i = 0; i < items.length && i + 1 < SLOT_COUNT; i++) slots[i + 1] = items[i];
  const ni = cur ? slots.indexOf(cur) : -1;
  idx = ni >= 0 ? ni : Math.min(idx, SLOT_COUNT - 1);
  render();
  emit();
}

function toolIconUrl(item: string, kind: string, tier: number): string {
  if (!iconCache[item]) iconCache[item] = toolIconCanvas(kind, tier).toDataURL();
  return iconCache[item];
}

function iconHtml(it: string): string {
  if (it === 'hand') return `<span class="hicon" style="background:#f2d3a8"></span>`;
  const d = ITEMS[it];
  if (d?.tool) return `<span class="hicon himg" style="background-image:url(${toolIconUrl(it, d.tool.kind, d.tool.tier)})"></span>`;
  const c = d ? css(d.color) : '#888888';
  return `<span class="hicon" style="background:${c}"></span>`;
}

function render(): void {
  let bar = document.getElementById('hotbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'hotbar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = slots
    .map((it, i) => {
      const sel = i === idx ? ' sel' : '';
      const key = `<span class="hkey">${i + 1}</span>`;
      if (!it) return `<div class="hslot empty${sel}" data-i="${i}">${key}</div>`;
      if (it === 'hand') return `<div class="hslot${sel}" data-i="${i}" title="Mano">${key}${iconHtml(it)}</div>`;
      const d = ITEMS[it];
      const badge = d?.place || d?.boat ? `<span class="hcount">${counts[it] || 0}</span>` : '';
      return `<div class="hslot${sel}" data-i="${i}" title="${d ? d.name : it}">${key}${iconHtml(it)}${badge}</div>`;
    })
    .join('');
  bar.querySelectorAll('.hslot').forEach((elm) =>
    elm.addEventListener('click', () => {
      idx = parseInt((elm as HTMLElement).dataset.i!, 10);
      render();
      emit();
    })
  );
}
