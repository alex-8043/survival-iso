// Menú principal (Nueva partida / Continuar / Opciones) y pantalla de
// personalización de personaje con previsualización en vivo.

import { CATEGORIES, DEFAULT_CUSTOM, drawAvatar, type Customization, type Category } from './avatar';

export interface MenuOpts {
  hasSave: boolean;
  onNew: (c: Customization) => void;
  onContinue: () => void;
  musicOn: () => boolean;
  toggleMusic: () => void;
}

function css(n: number): string {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}
function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
function button(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'mbtn ' + variant;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

export function showMenu(opts: MenuOpts): void {
  const overlay = el('div', '');
  overlay.id = 'menu';
  document.body.appendChild(overlay);
  const custom: Customization = { ...DEFAULT_CUSTOM };

  const clear = () => (overlay.innerHTML = '');

  function main(): void {
    clear();
    const card = el('div', 'menu-card');
    card.innerHTML = '<h1>Survival <span>Iso</span></h1><p class="menu-sub">Aventura de supervivencia isométrica</p>';
    const btns = el('div', 'menu-btns col');
    btns.appendChild(button('Nueva partida', customize, 'primary'));
    const cont = button('Continuar partida', opts.onContinue);
    if (!opts.hasSave) {
      cont.disabled = true;
      cont.title = 'No hay partida guardada';
    }
    btns.appendChild(cont);
    btns.appendChild(button('Opciones', options));
    card.appendChild(btns);
    overlay.appendChild(card);
  }

  function catRow(cat: Category, redraw: () => void): HTMLElement {
    const row = el('div', 'cat-row');
    const lab = el('span', 'cat-label');
    lab.textContent = cat.label;
    row.appendChild(lab);
    const box = el('div', 'cat-box');
    if (cat.colors) {
      cat.colors.forEach((col, i) => {
        const sw = document.createElement('button');
        sw.className = 'sw' + (custom[cat.key] === i ? ' sel' : '');
        sw.style.background = css(col);
        sw.addEventListener('click', () => {
          custom[cat.key] = i;
          box.querySelectorAll('.sw').forEach((x) => x.classList.remove('sel'));
          sw.classList.add('sel');
          redraw();
        });
        box.appendChild(sw);
      });
    } else {
      const list = cat.options ?? [];
      const n = list.length;
      const prev = button('‹', () => {}, 'arrow');
      const val = el('span', 'cat-val');
      val.textContent = list[custom[cat.key]];
      const next = button('›', () => {}, 'arrow');
      prev.onclick = () => {
        custom[cat.key] = (custom[cat.key] + n - 1) % n;
        val.textContent = list[custom[cat.key]];
        redraw();
      };
      next.onclick = () => {
        custom[cat.key] = (custom[cat.key] + 1) % n;
        val.textContent = list[custom[cat.key]];
        redraw();
      };
      box.appendChild(prev);
      box.appendChild(val);
      box.appendChild(next);
    }
    row.appendChild(box);
    return row;
  }

  function customize(): void {
    clear();
    const card = el('div', 'menu-card wide');
    card.innerHTML = '<h2>Personaliza tu personaje</h2>';
    const row = el('div', 'cust-row');

    const pv = el('div', 'cust-preview');
    const cv = document.createElement('canvas');
    cv.width = 190;
    cv.height = 250;
    pv.appendChild(cv);
    const ctx = cv.getContext('2d')!;
    const redraw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      drawAvatar(ctx, custom, cv.width / 2, cv.height - 16, 2.5);
    };

    const ctrls = el('div', 'cust-ctrls');
    for (const cat of CATEGORIES) ctrls.appendChild(catRow(cat, redraw));

    row.appendChild(pv);
    row.appendChild(ctrls);
    card.appendChild(row);

    const foot = el('div', 'menu-btns');
    foot.appendChild(button('Volver', main));
    foot.appendChild(
      button('Empezar', () => {
        overlay.remove();
        opts.onNew({ ...custom });
      }, 'primary')
    );
    card.appendChild(foot);
    overlay.appendChild(card);
    redraw();
  }

  function options(): void {
    clear();
    const card = el('div', 'menu-card');
    card.innerHTML = '<h2>Opciones</h2>';
    const list = el('div', 'opt-list');
    const mus = button('Música: ' + (opts.musicOn() ? 'ON' : 'OFF'), () => {
      opts.toggleMusic();
      mus.textContent = 'Música: ' + (opts.musicOn() ? 'ON' : 'OFF');
    });
    list.appendChild(mus);
    card.appendChild(list);
    const foot = el('div', 'menu-btns');
    foot.appendChild(button('Volver', main));
    card.appendChild(foot);
    overlay.appendChild(card);
  }

  main();
}
