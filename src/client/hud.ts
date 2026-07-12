// HUD: barras de supervivencia (vida/comida/sed/estamina) y reloj día/hora.

import type { Stats, TimeInfo } from '../shared/protocol';

const BARS = [
  { key: 'health', label: 'Vida', color: '#e5484d' },
  { key: 'food', label: 'Comida', color: '#e8a13a' },
  { key: 'thirst', label: 'Sed', color: '#3aa0e8' },
  { key: 'stamina', label: 'Estamina', color: '#4cc85a' },
] as const;

export function initHud(): void {
  if (document.getElementById('hud-stats')) return;

  const stats = document.createElement('div');
  stats.id = 'hud-stats';
  stats.innerHTML = BARS.map(
    (b) =>
      `<div class="stat"><span class="stat-label">${b.label}</span>` +
      `<div class="stat-track"><div class="stat-fill" id="bar-${b.key}" style="background:${b.color}"></div></div></div>`
  ).join('');
  document.body.appendChild(stats);

  const clock = document.createElement('div');
  clock.id = 'hud-clock';
  clock.innerHTML =
    '<span id="clock-dot"></span><span id="clock-day"></span><span id="clock-time"></span>';
  document.body.appendChild(clock);
}

export function updateHud(stats: Stats, time: TimeInfo): void {
  for (const b of BARS) {
    const el = document.getElementById('bar-' + b.key);
    if (el) {
      const v = Math.max(0, Math.min(100, (stats as unknown as Record<string, number>)[b.key]));
      el.style.width = v + '%';
    }
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
