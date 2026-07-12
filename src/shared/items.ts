// Definiciones data-driven de ítems y tipos de nodo recolectable.
// Compartido entre la simulación (lógica) y el cliente (nombres/colores en la UI).

import type { NodeKind } from './protocol';

export interface ItemDef {
  id: string;
  name: string;
  color: number; // color para el icono/UI
}

export const ITEMS: Record<string, ItemDef> = {
  wood: { id: 'wood', name: 'Madera', color: 0x9c6b3f },
  stone: { id: 'stone', name: 'Piedra', color: 0x9aa0ab },
};

export interface NodeKindDef {
  item: string; // ítem que entrega al recolectar
  amount: number; // cuántas unidades antes de agotarse
}

export const NODE_KINDS: Record<NodeKind, NodeKindDef> = {
  tree: { item: 'wood', amount: 6 },
  rock: { item: 'stone', amount: 5 },
};
