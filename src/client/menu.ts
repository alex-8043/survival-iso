// Pantalla de inicio con selección de skin.

import { SKINS, hex } from './skins';

export function showMenu(onPlay: (skinId: string) => void): void {
  const overlay = document.createElement('div');
  overlay.id = 'menu';
  let selected = SKINS[0].id;
  overlay.innerHTML = `
    <div class="menu-card">
      <h1>Survival <span>Iso</span></h1>
      <p class="menu-sub">Elige tu personaje</p>
      <div class="skins" id="skins"></div>
      <button class="play-btn" id="play">Jugar</button>
      <p class="menu-hint">Mover <b>WASD</b> · Correr <b>Shift</b> · Recolectar/Atacar <b>Click</b> · Comer <b>F</b> · Beber <b>G</b> · Inventario <b>Tab</b></p>
    </div>`;
  document.body.appendChild(overlay);

  const skinsEl = overlay.querySelector('#skins') as HTMLElement;
  for (const s of SKINS) {
    const b = document.createElement('button');
    b.className = 'skin' + (s.id === selected ? ' sel' : '');
    b.innerHTML =
      `<span class="skin-av"><span class="sk-head" style="background:${hex(s.head)}"></span>` +
      `<span class="sk-body" style="background:${hex(s.body)}"></span></span>` +
      `<span class="skin-name">${s.name}</span>`;
    b.addEventListener('click', () => {
      selected = s.id;
      skinsEl.querySelectorAll('.skin').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
    });
    skinsEl.appendChild(b);
  }

  (overlay.querySelector('#play') as HTMLElement).addEventListener('click', () => {
    overlay.remove();
    onPlay(selected);
  });
}
