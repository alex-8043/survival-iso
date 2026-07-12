// Teclado -> estado de movimiento (WASD/flechas) + correr (Shift).
// Las acciones de un solo toque (comer, beber, inventario) se manejan aparte.

import type { InputState } from '../shared/protocol';

const KEY_MAP: Record<string, keyof InputState> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
};

export function setupInput(onChange: (state: InputState) => void): void {
  const state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
  };

  function apply(code: string, down: boolean): boolean {
    const key = KEY_MAP[code];
    if (!key) return false;
    if (state[key] === down) return false;
    state[key] = down;
    return true;
  }

  window.addEventListener('keydown', (e) => {
    if (apply(e.code, true)) {
      e.preventDefault();
      onChange({ ...state });
    }
  });
  window.addEventListener('keyup', (e) => {
    if (apply(e.code, false)) {
      e.preventDefault();
      onChange({ ...state });
    }
  });
}
