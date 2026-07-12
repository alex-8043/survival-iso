// HUD: iconos de supervivencia flanqueando la hotbar (vida+estamina a la
// izquierda, hambre+sed a la derecha), reloj día/hora y feed de recolección.

import { itemSpriteURL } from './itemsprites';
import type { Stats, TimeInfo } from '../shared/protocol';

const ICONS = 10;

function uri(inner: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'>${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const HEART = `<path d='M10 16.6C4 12 4.4 6.2 8 6.2C9.5 6.2 10 7.7 10 7.7C10 7.7 10.5 6.2 12 6.2C15.6 6.2 16 12 10 16.6Z' fill='@'/>`;
const DROP = `<path d='M10 3.2C10 3.2 15.3 10.4 15.3 13.4A5.3 5.3 0 1 1 4.7 13.4C4.7 10.4 10 3.2 10 3.2Z' fill='@'/>`;
const BOLT = `<path d='M11.5 2L4.5 11.2H8.6L7.4 18L15.2 8.4H10.6L11.5 2Z' fill='@'/>`;
function drum(meat: string, bone: string): string {
  return `<path d='M9 9L15.6 15.6' stroke='${bone}' stroke-width='3.4' stroke-linecap='round'/><circle cx='16' cy='16' r='2.3' fill='${bone}'/><circle cx='7.4' cy='7.4' r='5' fill='${meat}'/><circle cx='5.8' cy='5.8' r='1.5' fill='${meat === '#c9743a' ? '#dd9560' : meat}'/>`;
}

interface StatIcon { key: keyof Stats; side: 'left' | 'right'; on: string; off: string; }
const STATS: StatIcon[] = [
  { key: 'health', side: 'left', on: uri(HEART.replace('@', '#e5484d')), off: uri(HEART.replace('@', '#45272a')) },
  { key: 'stamina', side: 'left', on: uri(BOLT.replace('@', '#3f86e0')), off: uri(BOLT.replace('@', '#26344a')) },
  { key: 'food', side: 'right', on: uri(drum('#c9743a', '#f0e6cc')), off: uri(drum('#3f3229', '#4a4438')) },
  { key: 'thirst', side: 'right', on: uri(DROP.replace('@', '#3aa0e8')), off: uri(DROP.replace('@', '#223a49')) },
];

const iconEls: Partial<Record<keyof Stats, HTMLElement[]>> = {};

function group(id: string): HTMLElement {
  let g = document.getElementById(id);
  if (!g) { g = document.createElement('div'); g.id = id; document.body.appendChild(g); }
  return g;
}

export function initHud(): void {
  const left = group('hud-left'), right = group('hud-right');
  if (!left.childElementCount && !right.childElementCount) {
    for (const s of STATS) {
      const row = document.createElement('div');
      row.className = 'hud-row';
      const els: HTMLElement[] = [];
      for (let i = 0; i < ICONS; i++) {
        const ic = document.createElement('span');
        ic.className = 'hud-ic';
        ic.style.backgroundImage = s.off;
        row.appendChild(ic);
        els.push(ic);
      }
      iconEls[s.key] = els;
      (s.side === 'left' ? left : right).appendChild(row);
    }
  }
  if (!document.getElementById('hud-clock')) {
    const clock = document.createElement('div');
    clock.id = 'hud-clock';
    clock.innerHTML = '<span id="clock-dot"></span><span id="clock-day"></span><span id="clock-time"></span>';
    document.body.appendChild(clock);
  }
  if (!document.getElementById('pickup-feed')) {
    const feed = document.createElement('div');
    feed.id = 'pickup-feed';
    document.body.appendChild(feed);
  }
}

export function updateHud(stats: Stats, time: TimeInfo): void {
  for (const s of STATS) {
    const els = iconEls[s.key];
    if (!els) continue;
    const v = Math.max(0, Math.min(100, stats[s.key]));
    const filled = Math.round((v / 100) * ICONS);
    for (let i = 0; i < ICONS; i++) els[i].style.backgroundImage = i < filled ? s.on : s.off;
  }
  const h = time.tod * 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const isDay = time.tod > 0.27 && time.tod < 0.73;
  const day = document.getElementById('clock-day');
  if (day) day.textContent = 'Día ' + time.day;
  const t = document.getElementById('clock-time');
  if (t) t.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  const dot = document.getElementById('clock-dot');
  if (dot) dot.style.background = isDay ? '#f5c96b' : '#8aa0e8';
}

// Feed de recolección (izquierda): sprite + "+N Nombre".
export function pushPickup(text: string, itemId: string): void {
  const feed = document.getElementById('pickup-feed');
  if (!feed) return;
  const row = document.createElement('div');
  row.className = 'pf-row';
  row.innerHTML = `<span class="pf-ic" style="background-image:url(${itemSpriteURL(itemId)})"></span><span>${text}</span>`;
  feed.prepend(row);
  while (feed.childElementCount > 7) feed.lastElementChild?.remove();
  requestAnimationFrame(() => row.classList.add('show'));
  window.setTimeout(() => { row.classList.remove('show'); }, 2400);
  window.setTimeout(() => { row.remove(); }, 2900);
}
