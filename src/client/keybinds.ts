// Controles remapeables. Persisten en localStorage. El movimiento (WASD/flechas)
// y correr (Shift) son fijos; el resto de acciones son reasignables.

export type Action =
  | 'inventory' | 'craft' | 'map' | 'jump' | 'cave' | 'drink' | 'save' | 'music' | 'controls' | 'pause';

export const ACTIONS: Action[] = ['inventory', 'craft', 'map', 'jump', 'cave', 'drink', 'save', 'music', 'controls', 'pause'];

export const ACTION_LABELS: Record<Action, string> = {
  inventory: 'Inventario',
  craft: 'Crafteo básico',
  map: 'Mapa grande',
  jump: 'Saltar',
  cave: 'Entrar / salir de cueva',
  drink: 'Beber agua',
  save: 'Guardar partida',
  music: 'Música',
  controls: 'Mostrar controles',
  pause: 'Pausa / menú',
};

const DEFAULTS: Record<Action, string> = {
  inventory: 'KeyE',
  craft: 'Tab',
  map: 'KeyM',
  jump: 'Space',
  cave: 'KeyR',
  drink: 'KeyG',
  save: 'KeyK',
  music: 'KeyN',
  controls: 'KeyH',
  pause: 'Escape',
};

const LS = 'survival-keybinds-v3';
let binds: Record<Action, string> = { ...DEFAULTS };

export function loadBinds(): void {
  try {
    const j = localStorage.getItem(LS);
    if (j) binds = { ...DEFAULTS, ...(JSON.parse(j) as Partial<Record<Action, string>>) };
  } catch { /* ignora */ }
}
function persist(): void {
  try { localStorage.setItem(LS, JSON.stringify(binds)); } catch { /* ignora */ }
}
export function getCode(a: Action): string { return binds[a]; }
export function setCode(a: Action, code: string): void {
  // evita duplicados: si otra acción usaba este code, la deja libre
  for (const k of ACTIONS) if (k !== a && binds[k] === code) return; // ya en uso: no reasignar
  binds[a] = code;
  persist();
}
export function resetBinds(): void { binds = { ...DEFAULTS }; persist(); }
export function actionFor(code: string): Action | null {
  for (const a of ACTIONS) if (binds[a] === code) return a;
  return null;
}

// Etiqueta legible para una tecla.
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Espacio', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
    Backquote: '`', Minus: '-', Equal: '=',
  };
  return map[code] ?? code;
}
