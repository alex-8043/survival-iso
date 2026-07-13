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

export const RECIPE_CATS = ['Herramientas', 'Armas', 'Armaduras', 'Fundición', 'Comercio', 'Cocina', 'Construcción', 'Estaciones', 'Vehículos'];

export const RECIPES: Recipe[] = [
  { id: 'wood_axe', name: 'Hacha de madera', out: { item: 'wood_axe', count: 1 }, ingredients: { wood: 3 }, cat: 'Herramientas' },
  { id: 'wood_pickaxe', name: 'Pico de madera', out: { item: 'wood_pickaxe', count: 1 }, ingredients: { wood: 3 }, cat: 'Herramientas' },
  { id: 'stone_axe', name: 'Hacha de piedra', out: { item: 'stone_axe', count: 1 }, ingredients: { wood: 2, stone: 3 }, station: 'crafting_table', cat: 'Herramientas' },
  { id: 'stone_pickaxe', name: 'Pico de piedra', out: { item: 'stone_pickaxe', count: 1 }, ingredients: { wood: 2, stone: 3 }, station: 'crafting_table', cat: 'Herramientas' },
  { id: 'iron_axe', name: 'Hacha de hierro', out: { item: 'iron_axe', count: 1 }, ingredients: { wood: 2, iron_ingot: 3 }, station: 'forge', cat: 'Herramientas' },
  { id: 'iron_pickaxe', name: 'Pico de hierro', out: { item: 'iron_pickaxe', count: 1 }, ingredients: { wood: 2, iron_ingot: 3 }, station: 'forge', cat: 'Herramientas' },
  { id: 'gold_axe', name: 'Hacha de oro', out: { item: 'gold_axe', count: 1 }, ingredients: { wood: 2, gold_ingot: 3 }, station: 'forge', cat: 'Herramientas' },
  { id: 'gold_pickaxe', name: 'Pico de oro', out: { item: 'gold_pickaxe', count: 1 }, ingredients: { wood: 2, gold_ingot: 3 }, station: 'forge', cat: 'Herramientas' },
  { id: 'diamond_axe', name: 'Hacha de diamante', out: { item: 'diamond_axe', count: 1 }, ingredients: { wood: 2, diamond: 3 }, station: 'forge', cat: 'Herramientas' },
  { id: 'diamond_pickaxe', name: 'Pico de diamante', out: { item: 'diamond_pickaxe', count: 1 }, ingredients: { wood: 2, diamond: 3 }, station: 'forge', cat: 'Herramientas' },
  { id: 'wood_sword', name: 'Espada de madera', out: { item: 'wood_sword', count: 1 }, ingredients: { wood: 2 }, cat: 'Armas' },
  { id: 'stone_sword', name: 'Espada de piedra', out: { item: 'stone_sword', count: 1 }, ingredients: { wood: 1, stone: 2 }, station: 'crafting_table', cat: 'Armas' },
  { id: 'iron_sword', name: 'Espada de hierro', out: { item: 'iron_sword', count: 1 }, ingredients: { wood: 1, iron_ingot: 2 }, station: 'forge', cat: 'Armas' },
  { id: 'gold_sword', name: 'Espada de oro', out: { item: 'gold_sword', count: 1 }, ingredients: { wood: 1, gold_ingot: 2 }, station: 'forge', cat: 'Armas' },
  { id: 'diamond_sword', name: 'Espada de diamante', out: { item: 'diamond_sword', count: 1 }, ingredients: { wood: 1, diamond: 2 }, station: 'forge', cat: 'Armas' },
  { id: 'leather_helmet', name: 'Casco de cuero', out: { item: 'leather_helmet', count: 1 }, ingredients: { leather: 3 }, station: 'crafting_table', cat: 'Armaduras' },
  { id: 'leather_chest', name: 'Pechera de cuero', out: { item: 'leather_chest', count: 1 }, ingredients: { leather: 5 }, station: 'crafting_table', cat: 'Armaduras' },
  { id: 'iron_helmet', name: 'Casco de hierro', out: { item: 'iron_helmet', count: 1 }, ingredients: { iron_ingot: 5 }, station: 'forge', cat: 'Armaduras' },
  { id: 'iron_chest', name: 'Pechera de hierro', out: { item: 'iron_chest', count: 1 }, ingredients: { iron_ingot: 8 }, station: 'forge', cat: 'Armaduras' },
  { id: 'gold_helmet', name: 'Casco de oro', out: { item: 'gold_helmet', count: 1 }, ingredients: { gold_ingot: 5 }, station: 'forge', cat: 'Armaduras' },
  { id: 'gold_chest', name: 'Pechera de oro', out: { item: 'gold_chest', count: 1 }, ingredients: { gold_ingot: 8 }, station: 'forge', cat: 'Armaduras' },
  { id: 'diamond_helmet', name: 'Casco de diamante', out: { item: 'diamond_helmet', count: 1 }, ingredients: { diamond: 5 }, station: 'forge', cat: 'Armaduras' },
  { id: 'diamond_chest', name: 'Pechera de diamante', out: { item: 'diamond_chest', count: 1 }, ingredients: { diamond: 8 }, station: 'forge', cat: 'Armaduras' },
  // (Fundir hierro/oro y cocinar carne ya NO son recetas: se hacen en el HORNO
  //  poniendo combustible + material y esperando. Ver SMELT en items.ts.)
  { id: 'coin', name: 'Acuñar monedas ×8', out: { item: 'coin', count: 8 }, ingredients: { gold_ingot: 1 }, station: 'crafting_table', cat: 'Comercio' },
  { id: 'chest', name: 'Cofre (27 espacios)', out: { item: 'chest', count: 1 }, ingredients: { wood: 8 }, cat: 'Construcción' },
  { id: 'bed', name: 'Cama', out: { item: 'bed', count: 1 }, ingredients: { wood: 5, wool: 3 }, cat: 'Construcción' },
  { id: 'stick', name: 'Palos ×4', out: { item: 'stick', count: 4 }, ingredients: { wood: 2 }, cat: 'Construcción' },
  { id: 'torch', name: 'Antorcha ×4', out: { item: 'torch', count: 4 }, ingredients: { stick: 1, coal: 1 }, cat: 'Construcción' },
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
