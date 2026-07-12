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

export const RECIPE_CATS = ['Herramientas', 'Armas', 'Armaduras', 'Construcción', 'Estaciones', 'Vehículos'];

export const RECIPES: Recipe[] = [
  { id: 'wood_axe', name: 'Hacha de madera', out: { item: 'wood_axe', count: 1 }, ingredients: { wood: 3 }, cat: 'Herramientas' },
  { id: 'wood_pickaxe', name: 'Pico de madera', out: { item: 'wood_pickaxe', count: 1 }, ingredients: { wood: 3 }, cat: 'Herramientas' },
  { id: 'stone_axe', name: 'Hacha de piedra', out: { item: 'stone_axe', count: 1 }, ingredients: { wood: 2, stone: 3 }, station: 'crafting_table', cat: 'Herramientas' },
  { id: 'stone_pickaxe', name: 'Pico de piedra', out: { item: 'stone_pickaxe', count: 1 }, ingredients: { wood: 2, stone: 3 }, station: 'crafting_table', cat: 'Herramientas' },
  { id: 'wood_sword', name: 'Espada de madera', out: { item: 'wood_sword', count: 1 }, ingredients: { wood: 2 }, cat: 'Armas' },
  { id: 'stone_sword', name: 'Espada de piedra', out: { item: 'stone_sword', count: 1 }, ingredients: { wood: 1, stone: 2 }, station: 'crafting_table', cat: 'Armas' },
  { id: 'leather_helmet', name: 'Casco de cuero', out: { item: 'leather_helmet', count: 1 }, ingredients: { leather: 3 }, station: 'crafting_table', cat: 'Armaduras' },
  { id: 'leather_chest', name: 'Pechera de cuero', out: { item: 'leather_chest', count: 1 }, ingredients: { leather: 5 }, station: 'crafting_table', cat: 'Armaduras' },
  { id: 'wood_block', name: 'Bloque de madera ×4', out: { item: 'wood_block', count: 4 }, ingredients: { wood: 1 }, cat: 'Construcción' },
  { id: 'stone_block', name: 'Bloque de piedra ×4', out: { item: 'stone_block', count: 4 }, ingredients: { stone: 1 }, cat: 'Construcción' },
  { id: 'crafting_table', name: 'Mesa de crafteo', out: { item: 'crafting_table', count: 1 }, ingredients: { wood: 4 }, cat: 'Estaciones' },
  { id: 'boat', name: 'Barca', out: { item: 'boat', count: 1 }, ingredients: { wood: 5 }, station: 'crafting_table', cat: 'Vehículos' },
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
