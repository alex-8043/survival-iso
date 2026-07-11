// Contrato de mensajes cliente <-> simulación.
// Tiene "forma de red" a propósito: en single-player el otro extremo es un
// Web Worker; en multiplayer será exactamente el mismo protocolo sobre WebSocket.

export type TileType = number; // 0 = pasto, 1 = pasto variante, 2 = agua

export interface PropData {
  x: number;
  y: number;
  kind: 'tree' | 'rock';
}

export interface ChunkData {
  size: number;
  tiles: Uint8Array; // longitud size*size (compacto; se clona nativamente)
  props: PropData[];
  seed: number;
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
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

// Cliente -> Simulación
export type ClientMsg = { t: 'input'; input: InputState };

// Simulación -> Cliente
export type SimMsg =
  | { t: 'ready'; chunk: ChunkData; playerId: number }
  | { t: 'snapshot'; snap: Snapshot };
