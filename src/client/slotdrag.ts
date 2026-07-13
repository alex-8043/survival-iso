// Arrastrar y soltar ranuras (pointer). Cada ranura lleva data-addr:
//   "inv:<i>"  o  "chest:<id>:<i>".

import type { InvAddr } from '../shared/protocol';

export function addrStr(a: InvAddr): string {
  if (a.c === 'inv') return 'inv:' + a.i;
  if (a.c === 'armor') return 'armor:' + a.i;
  return 'chest:' + a.id + ':' + a.i;
}
export function parseAddr(s: string | undefined): InvAddr | null {
  if (!s) return null;
  const p = s.split(':');
  if (p[0] === 'inv') return { c: 'inv', i: +p[1] };
  if (p[0] === 'armor') return { c: 'armor', i: +p[1] };
  if (p[0] === 'chest') return { c: 'chest', id: +p[1], i: +p[2] };
  return null;
}

export interface DragOpts {
  onShift?: (a: InvAddr) => void;
  onContext?: (a: InvAddr, x: number, y: number) => void;
}

// Habilita arrastre en todas las .islot[data-addr] dentro de root.
export function enableDrag(root: HTMLElement, onMove: (from: InvAddr, to: InvAddr) => void, opts: DragOpts = {}): void {
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.querySelectorAll<HTMLElement>('.islot[data-addr]').forEach((el) => {
    el.addEventListener('pointerdown', (ev) => {
      const from = parseAddr(el.dataset.addr);
      if (!from) return;
      const spriteEl = el.querySelector<HTMLElement>('.isprite');
      const bg = spriteEl?.style.backgroundImage;
      if (!bg || bg === 'none') return; // ranura vacía
      if (ev.button === 2) { ev.preventDefault(); opts.onContext?.(from, ev.clientX, ev.clientY); return; }
      if (ev.shiftKey) { ev.preventDefault(); opts.onShift?.(from); return; }
      ev.preventDefault();
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.style.backgroundImage = bg;
      document.body.appendChild(ghost);
      const move = (e: PointerEvent): void => { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; };
      move(ev as PointerEvent);
      const up = (e: PointerEvent): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        ghost.remove();
        const targetEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.islot[data-addr]');
        const to = parseAddr(targetEl?.dataset.addr);
        if (to && !(to.c === from.c && to.i === from.i && (to.c !== 'chest' || to.id === (from as { id: number }).id))) onMove(from, to);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
}

// HTML de una ranura con su sprite (o vacía). `extra` = contenido adicional
// (p.ej. barra de durabilidad), que se pinta incluso en ranuras vacías.
export function slotHtml(addr: InvAddr, spriteUrl: string | null, count: number, title: string, extra = ''): string {
  const inner = spriteUrl
    ? `<span class="isprite" style="background-image:url(${spriteUrl})"></span>${count > 1 ? `<span class="icount">${count}</span>` : ''}`
    : '';
  return `<div class="islot" data-addr="${addrStr(addr)}"${spriteUrl ? ` title="${title}"` : ''}>${inner}${extra}</div>`;
}
