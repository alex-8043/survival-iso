// Menú de pausa (tecla de pausa / Esc): reanudar, guardar, controles, ajustes
// (música + remapeo de teclas) y volver al menú principal.

import { showControls } from './controls';
import { ACTIONS, ACTION_LABELS, getCode, setCode, resetBinds, keyLabel } from './keybinds';

export interface PauseOpts {
  onSave: () => void;
  onMainMenu: () => void;
  musicOn: () => boolean;
  toggleMusic: () => void;
  onPauseChange: (paused: boolean) => void;
}

let opts: PauseOpts | null = null;
let open = false;
let capturing: string | null = null;

function ensure(): HTMLElement {
  let o = document.getElementById('pause');
  if (!o) {
    o = document.createElement('div');
    o.id = 'pause';
    document.body.appendChild(o);
  }
  return o;
}

function mbtn(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'mbtn ' + variant;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function renderMain(): void {
  const o = ensure();
  o.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'pause-card';
  card.innerHTML = '<h2>Pausa</h2>';
  const list = document.createElement('div');
  list.className = 'pause-btns';
  list.appendChild(mbtn('Reanudar', closePause, 'primary'));
  list.appendChild(mbtn('Guardar partida', () => { opts?.onSave(); }));
  list.appendChild(mbtn('Controles', () => showControls()));
  list.appendChild(mbtn('Ajustes', renderSettings));
  list.appendChild(mbtn('Volver al menú principal', () => { opts?.onMainMenu(); }));
  card.appendChild(list);
  o.appendChild(card);
}

function renderSettings(): void {
  const o = ensure();
  o.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'pause-card wide';
  card.innerHTML = '<h2>Ajustes</h2>';

  const mus = mbtn('Música: ' + (opts?.musicOn() ? 'ON' : 'OFF'), () => {
    opts?.toggleMusic();
    mus.textContent = 'Música: ' + (opts?.musicOn() ? 'ON' : 'OFF');
  });
  card.appendChild(mus);

  const h = document.createElement('div');
  h.className = 'keybind-title';
  h.textContent = 'Controles (clic para reasignar)';
  card.appendChild(h);

  const list = document.createElement('div');
  list.className = 'keybind-list';
  for (const a of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'kb-row';
    const label = document.createElement('span');
    label.className = 'kb-act';
    label.textContent = ACTION_LABELS[a];
    const key = document.createElement('button');
    key.className = 'kb-key' + (capturing === a ? ' listening' : '');
    key.textContent = capturing === a ? 'Pulsa una tecla…' : keyLabel(getCode(a));
    key.addEventListener('click', () => beginCapture(a));
    row.appendChild(label);
    row.appendChild(key);
    list.appendChild(row);
  }
  card.appendChild(list);

  const foot = document.createElement('div');
  foot.className = 'pause-btns row';
  foot.appendChild(mbtn('Restablecer', () => { resetBinds(); renderSettings(); }));
  foot.appendChild(mbtn('Volver', renderMain));
  card.appendChild(foot);
  o.appendChild(card);
}

function beginCapture(action: string): void {
  capturing = action;
  renderSettings();
  const onKey = (e: KeyboardEvent): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
    window.removeEventListener('keydown', onKey, true);
    if (e.code !== 'Escape') setCode(action as never, e.code);
    capturing = null;
    renderSettings();
  };
  window.addEventListener('keydown', onKey, true);
}

export function isPaused(): boolean { return open; }
export function isCapturing(): boolean { return capturing !== null; }

export function openPause(): void {
  open = true;
  opts?.onPauseChange(true);
  renderMain();
  ensure().style.display = 'flex';
}
export function closePause(): void {
  open = false;
  capturing = null;
  opts?.onPauseChange(false);
  const o = document.getElementById('pause');
  if (o) o.style.display = 'none';
}
export function togglePause(): void {
  if (open) closePause();
  else openPause();
}

export function initPause(o: PauseOpts): void {
  opts = o;
  ensure().style.display = 'none';
}
