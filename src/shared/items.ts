// Definiciones data-driven de ítems, nodos, drops y metadatos (herramientas,
// colocables, barca). Compartido entre simulación y cliente.

import type { NodeKind } from './worldgen';

export type AnimalType = 'cow' | 'pig' | 'chicken' | 'sheep' | 'bat';
// Animales de superficie (los que aparecen al aire libre).
export const ANIMAL_TYPES: AnimalType[] = ['cow', 'pig', 'chicken', 'sheep'];
// Mobs que sólo aparecen dentro de cuevas.
export const CAVE_MOBS: AnimalType[] = ['bat'];

export interface AnimalInfo { health: number; speed: number; }
export const ANIMAL_INFO: Record<AnimalType, AnimalInfo> = {
  cow: { health: 3, speed: 1.3 },
  pig: { health: 3, speed: 1.5 },
  chicken: { health: 2, speed: 1.8 },
  sheep: { health: 3, speed: 1.3 },
  bat: { health: 2, speed: 2.6 },
};

export type ToolKind = 'axe' | 'pickaxe' | 'sword';

export interface ItemDef {
  id: string;
  name: string;
  color: number;
  food?: number;
  tool?: { kind: ToolKind; tier: number; speed: number }; // speed = mult. de recolección
  place?: 'block' | 'station' | 'container'; // colocable
  solid?: boolean; // el bloque bloquea el paso
  boat?: boolean;
  defense?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  wood: { id: 'wood', name: 'Madera', color: 0x9c6b3f },
  stone: { id: 'stone', name: 'Piedra', color: 0x9aa0ab },
  meat: { id: 'meat', name: 'Carne cruda', color: 0xd05a4a, food: 12 },
  cooked_meat: { id: 'cooked_meat', name: 'Carne cocinada', color: 0x9a5a2f, food: 40 },
  leather: { id: 'leather', name: 'Cuero', color: 0x7a5433 },
  wool: { id: 'wool', name: 'Lana', color: 0xe8e6de },
  feather: { id: 'feather', name: 'Pluma', color: 0xd7d2c8 },
  coal: { id: 'coal', name: 'Carbón', color: 0x2b2b32 },
  iron_ore: { id: 'iron_ore', name: 'Mineral de hierro', color: 0xa98f74 },
  iron_ingot: { id: 'iron_ingot', name: 'Lingote de hierro', color: 0xd2d9e2 },

  wood_axe: { id: 'wood_axe', name: 'Hacha de madera', color: 0x8a5a2b, tool: { kind: 'axe', tier: 1, speed: 1.5 } },
  wood_pickaxe: { id: 'wood_pickaxe', name: 'Pico de madera', color: 0x8a5a2b, tool: { kind: 'pickaxe', tier: 1, speed: 1.5 } },
  wood_sword: { id: 'wood_sword', name: 'Espada de madera', color: 0x8a5a2b, tool: { kind: 'sword', tier: 1, speed: 1 } },
  stone_axe: { id: 'stone_axe', name: 'Hacha de piedra', color: 0x8f8f9a, tool: { kind: 'axe', tier: 2, speed: 2.1 } },
  stone_pickaxe: { id: 'stone_pickaxe', name: 'Pico de piedra', color: 0x8f8f9a, tool: { kind: 'pickaxe', tier: 2, speed: 2.1 } },
  stone_sword: { id: 'stone_sword', name: 'Espada de piedra', color: 0x8f8f9a, tool: { kind: 'sword', tier: 2, speed: 1 } },
  iron_axe: { id: 'iron_axe', name: 'Hacha de hierro', color: 0xc9d2dc, tool: { kind: 'axe', tier: 3, speed: 2.9 } },
  iron_pickaxe: { id: 'iron_pickaxe', name: 'Pico de hierro', color: 0xc9d2dc, tool: { kind: 'pickaxe', tier: 3, speed: 2.9 } },
  iron_sword: { id: 'iron_sword', name: 'Espada de hierro', color: 0xc9d2dc, tool: { kind: 'sword', tier: 3, speed: 1 } },

  leather_helmet: { id: 'leather_helmet', name: 'Casco de cuero', color: 0x8a6b45, defense: 1 },
  leather_chest: { id: 'leather_chest', name: 'Pechera de cuero', color: 0x8a6b45, defense: 2 },
  iron_helmet: { id: 'iron_helmet', name: 'Casco de hierro', color: 0xc9d2dc, defense: 3 },
  iron_chest: { id: 'iron_chest', name: 'Pechera de hierro', color: 0xc9d2dc, defense: 5 },

  wood_block: { id: 'wood_block', name: 'Bloque de madera', color: 0x9c6b3f, place: 'block', solid: true },
  stone_block: { id: 'stone_block', name: 'Bloque de piedra', color: 0x9aa0ab, place: 'block', solid: true },
  crafting_table: { id: 'crafting_table', name: 'Mesa de crafteo', color: 0x8a5a2b, place: 'station' },
  furnace: { id: 'furnace', name: 'Horno', color: 0x6a6a72, place: 'station', solid: true },
  forge: { id: 'forge', name: 'Herrería', color: 0x4a4a54, place: 'station', solid: true },
  chest: { id: 'chest', name: 'Cofre', color: 0x8a5a2b, place: 'container', solid: true },

  boat: { id: 'boat', name: 'Barca', color: 0x8a5a2b, boat: true },
};

export interface NodeKindDef {
  item: string;
  amount: number;
}

export const NODE_KINDS: Record<NodeKind, NodeKindDef> = {
  tree: { item: 'wood', amount: 6 },
  rock: { item: 'stone', amount: 5 },
  coal: { item: 'coal', amount: 4 },
  iron: { item: 'iron_ore', amount: 4 },
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
  bat: [{ item: 'leather', min: 0, max: 1 }],
};

export function toolFor(item: string | null): ItemDef['tool'] | undefined {
  return item ? ITEMS[item]?.tool : undefined;
}
