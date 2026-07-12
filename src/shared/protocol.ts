// Contrato de mensajes cliente <-> simulación.
// Tiene "forma de red" a propósito: en single-player el otro extremo es un
// Web Worker; en multiplayer será el mismo protocolo sobre WebSocket.

export type TileType = number; // 0 = pasto, 1 = pasto variante, 2 = agua
export type NodeKind = 'tree' | 'rock';

export interface ChunkData {
  size: number;
  tiles: Uint8Array; // longitud size*size (compacto; se clona nativamente)
  seed: number;
}

// Estado de un nodo recolectable enviado al cliente.
export interface NodeSnap {
  id: number;
  x: number;
  y: number;
  kind: NodeKind;
  amount: number;
  alive: boolean;
}

export interface InvEntry {
  id: string; // id de ítem
  count: number;
}

export type EntityKind = 'player';

export interface EntitySnap {
  id: number;
  x: number;
  y: number;
  kind: EntityKind;
}

export interface Snapshot {
  tick: number;
  entities: EntitySnap[];
  targetNodeId: number; // nodo enfocado para recolectar (-1 = ninguno)
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean; // recolectar (E / Espacio)
}

// Cliente -> Simulación
export type ClientMsg = { t: 'input'; input: InputState };

// Simulación -> Cliente
export type SimMsg =
  | { t: 'ready'; chunk: ChunkData; nodes: NodeSnap[]; playerId: number; inventory: InvEntry[] }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'nodes'; nodes: NodeSnap[] } // deltas de nodos que cambiaron
  | { t: 'inventory'; inventory: InvEntry[] } // inventario cambió
  | { t: 'harvested'; item: string; x: number; y: number }; // feedback de recolección
