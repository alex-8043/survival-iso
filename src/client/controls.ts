// Lista de controles del juego. Se muestra con el botón "?" o desde el menú de
// pausa. Refleja los controles remapeados actuales.

import { ACTIONS, ACTION_LABELS, getCode, keyLabel } from './keybinds';

let open = false;

function rowsHtml(): string {
  const fixed: [string, string][] = [
    ['Mover', 'W A S D / Flechas'],
    ['Correr', 'Shift'],
    ['Recolectar · Talar · Atacar', 'Clic (mantener)'],
    ['Colocar bloque / estación / barca', 'Clic (con objeto)'],
    ['Comer (comida seleccionada)', 'Clic derecho'],
    ['Abrir mesa / cofre · Subir a barca', 'Clic sobre ella'],
    ['Seleccionar objeto', '1 – 9 / Rueda'],
  ];
  const dyn = ACTIONS.map((a) => [ACTION_LABELS[a], keyLabel(getCode(a))] as [string, string]);
  return [...fixed, ...dyn]
    .map(([act, keys]) => `<div class="ctrl-row"><span class="ctrl-act">${act}</span><span class="ctrl-key">${keys}</span></div>`)
    .join('');
}

function ensure(): HTMLElement {
  let overlay = document.getElementById('controls');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'controls';
    overlay.innerHTML = `<div class="ctrl-card"><button class="panel-close" id="ctrl-close" title="Cerrar">&times;</button><h3>Controles</h3><div class="ctrl-rows"></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hideControls(); });
    document.getElementById('ctrl-close')?.addEventListener('click', hideControls);
  }
  if (!document.getElementById('controls-btn')) {
    const btn = document.createElement('button');
    btn.id = 'controls-btn';
    btn.title = 'Controles';
    btn.textContent = '?';
    btn.addEventListener('click', toggleControls);
    document.body.appendChild(btn);
  }
  return overlay;
}

export function isControlsOpen(): boolean { return open; }

export function showControls(): void {
  const o = ensure();
  (o.querySelector('.ctrl-rows') as HTMLElement).innerHTML = rowsHtml();
  o.style.display = 'flex';
  open = true;
}

export function hideControls(): void {
  open = false;
  const o = document.getElementById('controls');
  if (o) o.style.display = 'none';
}

export function toggleControls(): void {
  if (open) hideControls();
  else showControls();
}

export function initControls(): void {
  ensure();
}
