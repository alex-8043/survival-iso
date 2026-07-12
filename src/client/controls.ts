// Lista de controles del juego. Botón "?" (abajo a la derecha) y tecla H.

const CONTROLS: [string, string][] = [
  ['Mover', 'W A S D / Flechas'],
  ['Correr', 'Shift'],
  ['Recolectar · Talar · Atacar', 'Clic (mantener)'],
  ['Colocar bloque / estación', 'Clic (con objeto)'],
  ['Seleccionar objeto', '1 – 9 / Rueda'],
  ['Entrar / salir de cueva', 'E'],
  ['Comer carne', 'F'],
  ['Beber agua (junto al agua)', 'G'],
  ['Crafteo', 'C'],
  ['Inventario', 'Tab'],
  ['Guardar partida', 'K'],
  ['Música', 'M'],
  ['Mostrar / ocultar controles', 'H'],
];

let open = false;

function build(): HTMLElement {
  let overlay = document.getElementById('controls');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'controls';
  const rows = CONTROLS.map(
    ([action, keys]) =>
      `<div class="ctrl-row"><span class="ctrl-act">${action}</span><span class="ctrl-key">${keys}</span></div>`
  ).join('');
  overlay.innerHTML =
    `<div class="ctrl-card"><button class="panel-close" id="ctrl-close" title="Cerrar (H)">&times;</button>` +
    `<h3>Controles</h3>${rows}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const x = document.getElementById('ctrl-close');
  if (x) x.addEventListener('click', close);

  // Botón flotante de ayuda.
  let btn = document.getElementById('controls-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'controls-btn';
    btn.title = 'Controles (H)';
    btn.textContent = '?';
    btn.addEventListener('click', toggleControls);
    document.body.appendChild(btn);
  }
  return overlay;
}

function close(): void {
  open = false;
  const o = document.getElementById('controls');
  if (o) o.style.display = 'none';
}

export function isControlsOpen(): boolean {
  return open;
}

export function toggleControls(): void {
  const o = build();
  open = !open;
  o.style.display = open ? 'flex' : 'none';
}

export function initControls(): void {
  build();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && !e.repeat) { e.preventDefault(); toggleControls(); }
  });
}
