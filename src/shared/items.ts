// Definiciones data-driven de ítems, nodos y drops de animales.
// Compartido entre simulación (lógica) y cliente (UI).

import type { NodeKind } from './worldgen';

export type AnimalType = 'cow' | 'pig' | 'chicken' | 'sheep';
export const ANIMAL_TYPES: AnimalType[] = ['cow', 'pig', 'chicken', 'sheep'];

export interface ItemDef {
  id: string;
  name: string;
  color: number;
  food?: number; // si es comestible, cuánta comida restaura
}

export const ITEMS: Record<string, ItemDef> = {
  wood: { id: 'wood', name: 'Madera', color: 0x9c6b3f },
  stone: { id: 'stone', name: 'Piedra', color: 0x9aa0ab },
  meat: { id: 'meat', name: 'Carne', color: 0xb5462f, food: 28 },
  leather: { id: 'leather', name: 'Cuero', color: 0x7a5433 },
  wool: { id: 'wool', name: 'Lana', color: 0xe8e6de },
  feather: { id: 'feather', name: 'Pluma', color: 0xd7d2c8 },
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
