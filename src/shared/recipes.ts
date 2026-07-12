// Recetas de crafteo data-driven. `station` (si existe) exige tener esa
// estación colocada cerca.

export interface Recipe {
  id: string;
  name: string;
  out: { item: string; count: number };
  ingredients: Record<string, number>;
  station?: string;
  cat: string;
}

export const RECIPE_CATS = ['Herramientas', 'Armas', 'Armaduras', 'Fundición', 'Cocina', 'Construcción', 'Estaciones', 'Vehículos'];

export const RECIPES: Recipe[] = [
  { id: 'wood_axe', name: 'Hacha de madera', out: { item: 'wood_axe', count: 1 }, ingredients: { wood: 3 }, cat: 'Herramientas' },
  { id: 'wood_pickaxe', name: 'Pico de madera', out: { item: 'wood_pickaxe', count: 1 }, ingredients: { wood: 3 }, cat: 'Herramientas' },
  { id: 'stone_axe', name: 'Hacha de piedra', out: { item: 'stone_axe', count: 1 }, ingredients: { wood: 2, stone: 3 }, station: 'crafting_table', cat: 'Herramientas' },
  { id: 'stone_pickaxe', name: 'Pico de piedra', out: { item: 'stone_pickaxe', count: 1 }, ingredients: { wood: 2, stone: 3 }, station: 'crafting_table', cat: 'Herramientas' },
  { id: 'iron_axe', name: 'Hacha de hierro', out: { item: 'iron_axe', count: 1 }, ingredients: { wood: 2, iron_ingot: 3 }, station: 'forge', cat: 'Herramientas' },
  { id: 'iron_pickaxe', name: 'Pico de hierro', out: { item: 'iron_pickaxe', count: 1 }, ingredients: { wood: 2, iron_ingot: 3 }, station: 'forge', cat: 'Herramientas' },
  { id: 'wood_sword', name: 'Espada de madera', out: { item: 'wood_sword', count: 1 }, ingredients: { wood: 2 }, cat: 'Armas' },
  { id: 'stone_sword', name: 'Espada de piedra', out: { item: 'stone_sword', count: 1 }, ingredients: { wood: 1, stone: 2 }, station: 'crafting_table', cat: 'Armas' },
  { id: 'iron_sword', name: 'Espada de hierro', out: { item: 'iron_sword', count: 1 }, ingredients: { wood: 1, iron_ingot: 2 }, station: 'forge', cat: 'Armas' },
  { id: 'leather_helmet', name: 'Casco de cuero', out: { item: 'leather_helmet', count: 1 }, ingredients: { leather: 3 }, station: 'crafting_table', cat: 'Armaduras' },
  { id: 'leather_chest', name: 'Pechera de cuero', out: { item: 'leather_chest', count: 1 }, ingredients: { leather: 5 }, station: 'crafting_table', cat: 'Armaduras' },
  { id: 'iron_helmet', name: 'Casco de hierro', out: { item: 'iron_helmet', count: 1 }, ingredients: { iron_ingot: 5 }, station: 'forge', cat: 'Armaduras' },
  { id: 'iron_chest', name: 'Pechera de hierro', out: { item: 'iron_chest', count: 1 }, ingredients: { iron_ingot: 8 }, station: 'forge', cat: 'Armaduras' },
  { id: 'iron_ingot', name: 'Fundir hierro', out: { item: 'iron_ingot', count: 1 }, ingredients: { iron_ore: 1, coal: 1 }, station: 'furnace', cat: 'Fundición' },
  { id: 'cooked_meat', name: 'Cocinar carne', out: { item: 'cooked_meat', count: 1 }, ingredients: { meat: 1, wood: 1 }, station: 'furnace', cat: 'Cocina' },
  { id: 'chest', name: 'Cofre (27 espacios)', out: { item: 'chest', count: 1 }, ingredients: { wood: 8 }, cat: 'Construcción' },
  { id: 'wood_block', name: 'Bloque de madera ×4', out: { item: 'wood_block', count: 4 }, ingredients: { wood: 1 }, cat: 'Construcción' },
  { id: 'stone_block', name: 'Bloque de piedra ×4', out: { item: 'stone_block', count: 4 }, ingredients: { stone: 1 }, cat: 'Construcción' },
  { id: 'crafting_table', name: 'Mesa de crafteo', out: { item: 'crafting_table', count: 1 }, ingredients: { wood: 4 }, cat: 'Estaciones' },
  { id: 'furnace', name: 'Horno', out: { item: 'furnace', count: 1 }, ingredients: { stone: 8 }, station: 'crafting_table', cat: 'Estaciones' },
  { id: 'forge', name: 'Herrería', out: { item: 'forge', count: 1 }, ingredients: { stone: 4, iron_ingot: 3 }, station: 'crafting_table', cat: 'Estaciones' },
  { id: 'boat', name: 'Barca', out: { item: 'boat', count: 1 }, ingredients: { wood: 5 }, station: 'crafting_table', cat: 'Vehículos' },
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
