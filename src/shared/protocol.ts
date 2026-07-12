// Contrato de mensajes cliente <-> simulación (mismo protocolo servirá para MP).

import type { AnimalType } from './items';

export interface AnimalSnap {
  id: number;
  type: AnimalType;
  x: number;
  y: number;
  alive: boolean;
}

export interface Structure {
  id: number;
  type: string; // id de ítem colocable (crafting_table, wood_block, ...)
  x: number;
  y: number;
}

export interface Stats {
  health: number;
  food: number;
  thirst: number;
  stamina: number;
}

export interface TimeInfo {
  day: number;
  tod: number;
}

export interface InvEntry {
  id: string;
  count: number;
}

export type Location = 'surface' | 'cave';

export interface Snapshot {
  tick: number;
  px: number;
  py: number;
  onWater: boolean;
  animals: AnimalSnap[];
  stats: Stats;
  time: TimeInfo;
  loc: Location;
  caveSeed: number;
  onEntrance: boolean; // sobre una entrada de cueva (superficie) o salida (cueva)
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
  structures: Structure[];
  loc?: Location;
  caveSeed?: number;
  surfaceReturn?: { x: number; y: number };
  caveEntrance?: { x: number; y: number };
}

// Cliente -> Simulación
export type ClientMsg =
  | { t: 'init'; mode: 'new' | 'continue'; save?: SaveState }
  | { t: 'input'; input: InputState }
  | { t: 'interact'; active: boolean; target: InteractTarget }
  | { t: 'selectTool'; item: string | null }
  | { t: 'craft'; id: string }
  | { t: 'place'; item: string; x: number; y: number }
  | { t: 'consume'; item: string }
  | { t: 'drink' }
  | { t: 'toggleCave' }
  | { t: 'requestSave' };

// Simulación -> Cliente
export type SimMsg =
  | { t: 'ready'; seed: number; inventory: InvEntry[]; stats: Stats; structures: Structure[]; loc: Location; caveSeed: number }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'harvest'; x: number; y: number; depleted: boolean }
  | { t: 'inventory'; inventory: InvEntry[] }
  | { t: 'structures'; structures: Structure[] }
  | { t: 'floater'; text: string; color: number; x: number; y: number }
  | { t: 'save'; state: SaveState };
