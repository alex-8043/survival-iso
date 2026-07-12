// Inventario por ranuras (autoritativo en la simulación). Compartido con el
// cliente para leer cantidades. La hotbar son las últimas INV_HOTBAR ranuras.

import { ITEMS } from './items';

export type Slot = { id: string; count: number } | null;

export const INV_MAIN = 27;
export const INV_HOTBAR = 9;
export const INV_SIZE = INV_MAIN + INV_HOTBAR; // 36 (0-26 principal, 27-35 hotbar)
export const CHEST_SIZE = 27;

export function maxStack(id: string): number {
  const d = ITEMS[id];
  if (d && (d.tool || d.boat || d.place || d.defense)) return 1;
  return 99;
}

export function makeSlots(n: number): Slot[] {
  return new Array(n).fill(null);
}

export function countIn(slots: Slot[], id: string): number {
  let n = 0;
  for (const s of slots) if (s && s.id === id) n += s.count;
  return n;
}

export function slotCounts(slots: Slot[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const s of slots) if (s) c[s.id] = (c[s.id] || 0) + s.count;
  return c;
}

// Añade n de `id` en el rango [start,end). Apila primero, luego huecos. Devuelve el sobrante.
export function addTo(slots: Slot[], id: string, n: number, start = 0, end = slots.length): number {
  const max = maxStack(id);
  for (let i = start; i < end && n > 0; i++) {
    const s = slots[i];
    if (s && s.id === id && s.count < max) { const add = Math.min(max - s.count, n); s.count += add; n -= add; }
  }
  for (let i = start; i < end && n > 0; i++) {
    if (!slots[i]) { const add = Math.min(max, n); slots[i] = { id, count: add }; n -= add; }
  }
  return n;
}

export function takeFrom(slots: Slot[], id: string, n: number): number {
  let took = 0;
  for (let i = 0; i < slots.length && n > 0; i++) {
    const s = slots[i];
    if (s && s.id === id) { const t = Math.min(s.count, n); s.count -= t; n -= t; took += t; if (s.count <= 0) slots[i] = null; }
  }
  return took;
}

// Mueve/mezcla/intercambia la ranura fi de `from` hacia la ranura ti de `to`.
export function moveSlot(from: Slot[], fi: number, to: Slot[], ti: number): void {
  const a = from[fi];
  if (!a) return;
  const b = to[ti];
  if (!b) { to[ti] = a; from[fi] = null; return; }
  if (b.id === a.id) {
    const max = maxStack(a.id);
    const add = Math.min(max - b.count, a.count);
    b.count += add; a.count -= add;
    if (a.count <= 0) from[fi] = null;
    return;
  }
  to[ti] = a; from[fi] = b; // intercambio
}

// Ordena y compacta el rango [start,end) por nombre de ítem.
export function sortRange(slots: Slot[], start: number, end: number): void {
  const acc: Record<string, number> = {};
  for (let i = start; i < end; i++) { const s = slots[i]; if (s) acc[s.id] = (acc[s.id] || 0) + s.count; slots[i] = null; }
  const ids = Object.keys(acc).sort((a, b) => (ITEMS[a]?.name || a).localeCompare(ITEMS[b]?.name || b));
  let i = start;
  for (const id of ids) {
    let n = acc[id];
    const max = maxStack(id);
    while (n > 0 && i < end) { const add = Math.min(max, n); slots[i++] = { id, count: add }; n -= add; }
  }
}

export function cloneSlots(slots: Slot[]): Slot[] {
  return slots.map((s) => (s ? { id: s.id, count: s.count } : null));
}
