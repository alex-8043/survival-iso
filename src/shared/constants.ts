// Constantes compartidas entre la simulación (worker/servidor) y el cliente.

export const TILE_W = 64; // ancho del rombo isométrico (px)
export const TILE_H = 32; // alto del rombo (2:1)

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

export const WORLD_SEED = 1337;

export const PLAYER_SPEED = 4.5; // tiles/segundo
export const SPRINT_MULT = 1.7; // multiplicador al correr (Shift)

export const INTERACT_RANGE = 2.3; // distancia para recolectar/atacar (tiles)
export const HARVEST_COOLDOWN = 0.35; // segundos entre golpes

export const MAX_ELEV_PX = 44; // altura visual máxima del relieve (px)
export const VIEW_TILES = 30; // radio de render alrededor del jugador (tiles)

// Ciclo día/noche
export const DAY_LENGTH_S = 480; // 8 minutos por día completo
export const NIGHT_MAX_DARK = 0.6; // opacidad máxima del oscurecimiento nocturno

// Supervivencia (unidades por segundo, escala 0..100)
export const FOOD_DECAY = 100 / 300; // comida se agota en ~5 min
export const THIRST_DECAY = 100 / 220; // sed se agota en ~3.7 min
export const STARVE_DAMAGE = 3.0; // vida/s si comida o sed llegan a 0
export const STAMINA_DRAIN = 24; // /s corriendo
export const STAMINA_REGEN = 14; // /s recuperando
export const HEALTH_REGEN = 1.2; // /s si comida y sed están ok

// Animales
export const ANIMAL_CAP = 14; // máximo cerca del jugador
export const ANIMAL_SPEED = 1.5; // tiles/s
export const ANIMAL_HEALTH = 3; // golpes para abatir
export const SPAWN_RADIUS = 17; // radio de aparición/desaparición (tiles)
