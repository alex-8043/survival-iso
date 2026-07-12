// Hotbar: herramientas / colocables / barca. Teclas 1-9, rueda, o clic.

import { ITEMS } from '../shared/items';
import type { InvEntry } from '../shared/protocol';

export interface HotbarSel {
  kind: 'hand' | 'tool' | 'place' | 'boat';
  item: string | null;
}

let slots: string[] = ['hand'];
let idx = 0;
let counts: Record<string, number> = {};
let onSel: (s: HotbarSel) => void = () => {};

function css(n: number): string {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}

function selOf(item: string): HotbarSel {
  if (item === 'hand') return { kind: 'hand', item: null };
  const d = ITEMS[item];
  if (d?.tool) return { kind: 'tool', item };
  if (d?.boat) return { kind: 'boat', item };
  if (d?.place) return { kind: 'place', item };
  return { kind: 'hand', item: null };
}

export function currentSel(): HotbarSel {
  return selOf(slots[idx] || 'hand');
}

function emit(): void {
  onSel(currentSel());
}

export function initHotbar(onSelect: (s: HotbarSel) => void): void {
  onSel = onSelect;
  window.addEventListener('keydown', (e) => {
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9 && n - 1 < slots.length) {
        idx = n - 1;
        render();
        emit();
      }
    }
  });
  window.addEventListener('wheel', (e) => {
    if (slots.length < 2) return;
    idx = (idx + (e.deltaY > 0 ? 1 : -1) + slots.length) % slots.length;
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
  const cur = slots[idx];
  slots = ['hand', ...tools, ...places, ...boats];
  const ni = slots.indexOf(cur);
  idx = ni >= 0 ? ni : Math.min(idx, slots.length - 1);
  render();
  emit();
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
      const key = i + 1 <= 9 ? `<span class="hkey">${i + 1}</span>` : '';
      if (it === 'hand') return `<div class="hslot${sel}" data-i="${i}" title="Mano">${key}<span class="hicon" style="background:#f2d3a8"></span></div>`;
      const d = ITEMS[it];
      const c = d ? css(d.color) : '#888888';
      const badge = d?.place ? `<span class="hcount">${counts[it] || 0}</span>` : '';
      return `<div class="hslot${sel}" data-i="${i}" title="${d ? d.name : it}">${key}<span class="hicon" style="background:${c}"></span>${badge}</div>`;
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
