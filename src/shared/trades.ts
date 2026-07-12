// Economía de aldea: precios de compraventa (en monedas) y generación de misiones.

import { hash2 } from './noise';

// El aldeano te compra estos materiales (jugador -> monedas).
export const SELL: Record<string, number> = {
  wood: 1, stone: 1, leather: 2, wool: 2, feather: 1, meat: 2, cooked_meat: 4,
  coal: 2, iron_ore: 4, iron_ingot: 6, gold_ore: 7, gold_ingot: 10, diamond: 25,
};
// Le compras estos objetos (monedas -> objeto).
export const BUY: Record<string, number> = {
  cooked_meat: 5, wood: 2, wool: 4, iron_ingot: 9, bed: 20, chest: 14, crafting_table: 8,
};

export interface Quest { item: string; count: number; reward: number; }
const QUEST_ITEMS = ['wood', 'stone', 'leather', 'meat', 'wool', 'iron_ore', 'coal'];

// Misión determinista para un aldeano (misma id -> misma misión).
export function questFor(villagerId: number): Quest {
  const a = hash2(villagerId, 11, 0x9a1);
  const b = hash2(villagerId, 23, 0x5c3);
  const item = QUEST_ITEMS[Math.floor(a * QUEST_ITEMS.length) % QUEST_ITEMS.length];
  const count = 5 + Math.floor(b * 11); // 5..15
  return { item, count, reward: count * 3 + 6 };
}

// Id determinista de un aldeano por su posición.
export function villagerId(x: number, y: number, seed: number): number {
  return (Math.imul(x | 0, 40503) ^ Math.imul(y | 0, 366613) ^ (seed | 0)) | 0;
}
