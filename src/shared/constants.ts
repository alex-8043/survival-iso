// Constantes compartidas entre la simulación (worker/servidor) y el cliente.

export const TILE_W = 64; // ancho del rombo isométrico (px)
export const TILE_H = 32; // alto del rombo (2:1)

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

export const WORLD_SEED = 1337;

export const PLAYER_SPEED = 3.4; // tiles/segundo (más lento en general)
export const SPRINT_MULT = 1.6; // multiplicador al correr (Shift)

export const INTERACT_RANGE = 2.3; // distancia para recolectar/atacar (tiles)
export const HARVEST_COOLDOWN = 0.35; // segundos entre golpes

export const MAX_ELEV_PX = 74; // altura visual máxima del relieve (px)
export const VIEW_TILES = 30; // radio de render alrededor del jugador (tiles)
export const WATER_SLOW = 0.4; // multiplicador de velocidad nadando (sin barca)
export const BOAT_MULT = 0.95; // con barca: casi como en tierra (ya no más rápido)

export const SAVE_VERSION = 2;
export const AUTOSAVE_S = 20; // autoguardado cada N segundos

// Ciclo día/noche
export const DAY_LENGTH_S = 1200; // 20 min por ciclo completo (~10 día + ~10 noche)
export const NIGHT_MAX_DARK = 0.6; // opacidad máxima del oscurecimiento nocturno

// Supervivencia (unidades por segundo, escala 0..100)
export const FOOD_DECAY = 100 / 1500; // comida se agota en ~25 min
export const THIRST_DECAY = 100 / 1200; // sed se agota en ~20 min
export const STARVE_DAMAGE = 3.0; // vida/s si comida o sed llegan a 0
export const STAMINA_DRAIN = 24; // /s corriendo
export const STAMINA_REGEN = 14; // /s recuperando
export const STAMINA_LOW = 20; // por debajo de esto en comida/sed no se regenera estamina
export const HEALTH_REGEN = 1.2; // /s si comida y sed están ok

// Animales
export const ANIMAL_CAP = 6; // máximo cerca del jugador (superficie)
export const ANIMAL_SPEED = 1.5; // tiles/s (fallback; ver ANIMAL_INFO por tipo)
export const ANIMAL_HEALTH = 3; // golpes para abatir (fallback)
export const SPAWN_RADIUS = 20; // radio de aparición/desaparición (tiles)
export const ANIMAL_SPAWN_S = 3.2; // segundos entre intentos de aparición

// Mobs de cueva (murciélagos)
export const CAVE_MOB_CAP = 4; // máximo dentro de una cueva
export const CAVE_MOB_SPAWN_S = 5; // segundos entre intentos
