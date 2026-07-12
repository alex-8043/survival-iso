// Teclado -> estado de movimiento (WASD/flechas) + correr (Shift).
// Las acciones de un solo toque se manejan en main.ts vía keybinds.

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

const state: InputState = { up: false, down: false, left: false, right: false, sprint: false };
let onChange: (s: InputState) => void = () => {};
let enabled = true;

function apply(code: string, down: boolean): boolean {
  const key = KEY_MAP[code];
  if (!key) return false;
  if (state[key] === down) return false;
  state[key] = down;
  return true;
}

export function setupInput(cb: (state: InputState) => void): void {
  onChange = cb;
  window.addEventListener('keydown', (e) => {
    if (!enabled) return;
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

// Al pausar, se congela el movimiento (suelta todas las teclas).
export function setInputEnabled(on: boolean): void {
  enabled = on;
  if (!on) {
    let changed = false;
    for (const k of Object.keys(state) as (keyof InputState)[]) if (state[k]) { state[k] = false; changed = true; }
    if (changed) onChange({ ...state });
  }
}
