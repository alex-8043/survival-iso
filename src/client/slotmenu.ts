// Menú contextual de ranura (clic derecho): comer y/o pasar cantidad.

export interface SlotMenuOpts {
  count: number;
  canEat?: boolean;
  canMove?: boolean;
  onEat?: () => void;
  onMove?: (amount: number) => void;
}

function outside(e: PointerEvent): void {
  const menu = document.getElementById('slot-menu');
  if (menu && !menu.contains(e.target as Node)) closeSlotMenu();
}

export function closeSlotMenu(): void {
  document.removeEventListener('pointerdown', outside, true);
  document.getElementById('slot-menu')?.remove();
}

export function openSlotMenu(x: number, y: number, opts: SlotMenuOpts): void {
  closeSlotMenu();
  const menu = document.createElement('div');
  menu.id = 'slot-menu';
  menu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 160) + 'px';
  let html = '';
  if (opts.canEat) html += `<button data-a="eat">Comer</button>`;
  if (opts.canMove && opts.count > 0) {
    const half = Math.max(1, Math.floor(opts.count / 2));
    html += `<div class="sm-split"><input id="sm-amt" type="number" min="1" max="${opts.count}" value="${half}"><button data-a="move">Pasar</button></div>`;
    html += `<button data-a="movehalf">Pasar la mitad</button><button data-a="moveall">Pasar todo</button>`;
  }
  menu.innerHTML = html;
  document.body.appendChild(menu);
  menu.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    const a = (b as HTMLElement).dataset.a;
    if (a === 'eat') opts.onEat?.();
    else if (a === 'move') { const v = parseInt((document.getElementById('sm-amt') as HTMLInputElement).value, 10); if (v > 0) opts.onMove?.(v); }
    else if (a === 'movehalf') opts.onMove?.(Math.max(1, Math.floor(opts.count / 2)));
    else if (a === 'moveall') opts.onMove?.(opts.count);
    closeSlotMenu();
  });
  window.setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}
