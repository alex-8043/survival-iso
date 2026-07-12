// Definiciones data-driven de ítems, nodos, drops y metadatos (herramientas,
// colocables, barca). Compartido entre simulación y cliente.

import type { NodeKind } from './worldgen';

export type AnimalType = 'cow' | 'pig' | 'chicken' | 'sheep';
export const ANIMAL_TYPES: AnimalType[] = ['cow', 'pig', 'chicken', 'sheep'];

export type ToolKind = 'axe' | 'pickaxe' | 'sword';

export interface ItemDef {
  id: string;
  name: string;
  color: number;
  food?: number;
  tool?: { kind: ToolKind; tier: number; speed: number }; // speed = mult. de recolección
  place?: 'block' | 'station'; // colocable
  solid?: boolean; // el bloque bloquea el paso
  boat?: boolean;
  defense?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  wood: { id: 'wood', name: 'Madera', color: 0x9c6b3f },
  stone: { id: 'stone', name: 'Piedra', color: 0x9aa0ab },
  meat: { id: 'meat', name: 'Carne', color: 0xb5462f, food: 28 },
  leather: { id: 'leather', name: 'Cuero', color: 0x7a5433 },
  wool: { id: 'wool', name: 'Lana', color: 0xe8e6de },
  feather: { id: 'feather', name: 'Pluma', color: 0xd7d2c8 },

  wood_axe: { id: 'wood_axe', name: 'Hacha de madera', color: 0x8a5a2b, tool: { kind: 'axe', tier: 1, speed: 1.5 } },
  wood_pickaxe: { id: 'wood_pickaxe', name: 'Pico de madera', color: 0x8a5a2b, tool: { kind: 'pickaxe', tier: 1, speed: 1.5 } },
  wood_sword: { id: 'wood_sword', name: 'Espada de madera', color: 0x8a5a2b, tool: { kind: 'sword', tier: 1, speed: 1 } },
  stone_axe: { id: 'stone_axe', name: 'Hacha de piedra', color: 0x8f8f9a, tool: { kind: 'axe', tier: 2, speed: 2.1 } },
  stone_pickaxe: { id: 'stone_pickaxe', name: 'Pico de piedra', color: 0x8f8f9a, tool: { kind: 'pickaxe', tier: 2, speed: 2.1 } },
  stone_sword: { id: 'stone_sword', name: 'Espada de piedra', color: 0x8f8f9a, tool: { kind: 'sword', tier: 2, speed: 1 } },

  leather_helmet: { id: 'leather_helmet', name: 'Casco de cuero', color: 0x8a6b45, defense: 1 },
  leather_chest: { id: 'leather_chest', name: 'Pechera de cuero', color: 0x8a6b45, defense: 2 },

  wood_block: { id: 'wood_block', name: 'Bloque de madera', color: 0x9c6b3f, place: 'block', solid: true },
  stone_block: { id: 'stone_block', name: 'Bloque de piedra', color: 0x9aa0ab, place: 'block', solid: true },
  crafting_table: { id: 'crafting_table', name: 'Mesa de crafteo', color: 0x8a5a2b, place: 'station' },

  boat: { id: 'boat', name: 'Barca', color: 0x8a5a2b, boat: true },
};

export interface NodeKindDef {
  item: string;
  amount: number;
}

export const NODE_KINDS: Record<NodeKind, NodeKindDef> = {
  tree: { item: 'wood', amount: 6 },
  rock: { item: 'stone', amount: 5 },
};

export interface DropDef {
  item: string;
  min: number;
  max: number;
}

export const ANIMAL_DROPS: Record<AnimalType, DropDef[]> = {
  cow: [
    { item: 'meat', min: 2, max: 3 },
    { item: 'leather', min: 1, max: 2 },
  ],
  pig: [{ item: 'meat', min: 2, max: 3 }],
  chicken: [
    { item: 'meat', min: 1, max: 1 },
    { item: 'feather', min: 1, max: 2 },
  ],
  sheep: [
    { item: 'meat', min: 1, max: 2 },
    { item: 'wool', min: 1, max: 2 },
  ],
};

export function toolFor(item: string | null): ItemDef['tool'] | undefined {
  return item ? ITEMS[item]?.tool : undefined;
}
