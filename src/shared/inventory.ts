// Inventario por ranuras (autoritativo en la simulación). Compartido con el
// cliente para leer cantidades. La hotbar son las últimas INV_HOTBAR ranuras.

import { ITEMS, toolMaxDur } from './items';

export type Slot = { id: string; count: number; dur?: number } | null; // dur = durabilidad restante (herramientas)

export const INV_MAIN = 27;
export const INV_HOTBAR = 9;
export const INV_SIZE = INV_MAIN + INV_HOTBAR; // 36 (0-26 principal, 27-35 hotbar)
export const CHEST_SIZE = 27;

export function maxStack(id: string): number {
  const d = ITEMS[id];
  // Solo el equipo va de uno en uno; los bloques colocables (tierra, arena,
  // piedra, madera, estaciones…) se apilan como cualquier recurso.
  if (d && (d.tool || d.boat || d.defense)) return 1;
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
    if (!slots[i]) {
      const add = Math.min(max, n);
      const md = toolMaxDur(id); // herramienta nueva -> durabilidad al máximo
      slots[i] = md > 0 ? { id, count: add, dur: md } : { id, count: add };
      n -= add;
    }
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

// Ordena y compacta el rango [start,end) por nombre de ítem. Las herramientas
// (con durabilidad) se conservan como ranuras individuales para no perder su `dur`.
export function sortRange(slots: Slot[], start: number, end: number): void {
  const acc: Record<string, number> = {};
  const uniq: NonNullable<Slot>[] = [];
  for (let i = start; i < end; i++) {
    const s = slots[i];
    if (s) { if (s.dur !== undefined) uniq.push(s); else acc[s.id] = (acc[s.id] || 0) + s.count; }
    slots[i] = null;
  }
  const cmp = (a: string, b: string) => (ITEMS[a]?.name || a).localeCompare(ITEMS[b]?.name || b);
  uniq.sort((a, b) => cmp(a.id, b.id));
  let i = start;
  for (const u of uniq) if (i < end) slots[i++] = u;
  for (const id of Object.keys(acc).sort(cmp)) {
    let n = acc[id];
    const max = maxStack(id);
    while (n > 0 && i < end) { const add = Math.min(max, n); slots[i++] = { id, count: add }; n -= add; }
  }
}

export function cloneSlots(slots: Slot[]): Slot[] {
  return slots.map((s) => (s ? (s.dur !== undefined ? { id: s.id, count: s.count, dur: s.dur } : { id: s.id, count: s.count }) : null));
}
