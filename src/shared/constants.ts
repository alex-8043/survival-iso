// Constantes compartidas entre la simulación (worker/servidor) y el cliente (render).

export const TILE_W = 64; // ancho del rombo isométrico en píxeles
export const TILE_H = 32; // alto del rombo (proporción 2:1 clásica)

export const CHUNK_SIZE = 24; // tiles por lado (Fase 1: un único chunk)

export const TICK_HZ = 60; // frecuencia de simulación (Hz)
export const TICK_MS = 1000 / TICK_HZ;

export const PLAYER_SPEED = 4.5; // velocidad del jugador en tiles/segundo

export const HARVEST_RANGE = 1.7; // distancia (en tiles) para poder recolectar un nodo
export const HARVEST_COOLDOWN = 0.35; // segundos entre cada golpe de recolección
