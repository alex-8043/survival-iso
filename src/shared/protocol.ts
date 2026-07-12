// Contrato de mensajes cliente <-> simulación (mismo protocolo servirá para MP).
// El mundo es infinito y determinista: NO se envían tiles; ambos lados los
// generan desde la semilla (ver worldgen.ts). Solo viaja el estado dinámico.

import type { AnimalType } from './items';

export interface AnimalSnap {
  id: number;
  type: AnimalType;
  x: number;
  y: number;
  alive: boolean;
}

export interface Stats {
  health: number; // 0..100
  food: number;
  thirst: number;
  stamina: number;
}

export interface TimeInfo {
  day: number; // día 1, 2, 3...
  tod: number; // hora del día 0..1 (0 = medianoche, 0.5 = mediodía)
}

export interface InvEntry {
  id: string;
  count: number;
}

export interface Snapshot {
  tick: number;
  px: number; // jugador
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

// Objetivo de interacción (bajo el cursor del ratón).
export type InteractTarget =
  | { kind: 'node'; x: number; y: number }
  | { kind: 'animal'; id: number }
  | null;

// Cliente -> Simulación
export type ClientMsg =
  | { t: 'input'; input: InputState }
  | { t: 'interact'; active: boolean; target: InteractTarget }
  | { t: 'consume'; item: string }
  | { t: 'drink' };

// Simulación -> Cliente
export type SimMsg =
  | { t: 'ready'; seed: number; inventory: InvEntry[]; stats: Stats }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'harvest'; x: number; y: number; depleted: boolean } // golpe a un nodo (pulso/quitar)
  | { t: 'inventory'; inventory: InvEntry[] }
  | { t: 'floater'; text: string; color: number; x: number; y: number };
