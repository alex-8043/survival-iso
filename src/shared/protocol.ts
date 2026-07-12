// Contrato de mensajes cliente <-> simulación (mismo protocolo servirá para MP).
// Mundo infinito determinista: no se envían tiles, ambos lados los generan.

import type { AnimalType } from './items';

export interface AnimalSnap {
  id: number;
  type: AnimalType;
  x: number;
  y: number;
  alive: boolean;
}

export interface Stats {
  health: number;
  food: number;
  thirst: number;
  stamina: number;
}

export interface TimeInfo {
  day: number;
  tod: number; // 0..1
}

export interface InvEntry {
  id: string;
  count: number;
}

export interface Snapshot {
  tick: number;
  px: number;
  py: number;
  animals: AnimalSnap[];
  stats: Stats;
  time: TimeInfo;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

export type InteractTarget =
  | { kind: 'node'; x: number; y: number }
  | { kind: 'animal'; id: number }
  | null;

// Estado serializable para guardar/continuar.
export interface SaveState {
  version: number;
  seed: number;
  px: number;
  py: number;
  timeS: number;
  stats: Stats;
  inventory: InvEntry[];
  harvested: [string, number][];
  depleted: string[];
}

// Cliente -> Simulación
export type ClientMsg =
  | { t: 'init'; mode: 'new' | 'continue'; save?: SaveState }
  | { t: 'input'; input: InputState }
  | { t: 'interact'; active: boolean; target: InteractTarget }
  | { t: 'consume'; item: string }
  | { t: 'drink' }
  | { t: 'requestSave' };

// Simulación -> Cliente
export type SimMsg =
  | { t: 'ready'; seed: number; inventory: InvEntry[]; stats: Stats }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'harvest'; x: number; y: number; depleted: boolean }
  | { t: 'inventory'; inventory: InvEntry[] }
  | { t: 'floater'; text: string; color: number; x: number; y: number }
  | { t: 'save'; state: SaveState };
