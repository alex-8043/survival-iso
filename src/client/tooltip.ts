// Tooltip de objeto con la estética del inventario (Minecraft): un solo elemento
// global que sigue al cursor y lee el atributo data-name de la ranura bajo él.

let tip: HTMLElement | null = null;

export function initItemTooltip(): void {
  if (tip) return;
  tip = document.createElement('div');
  tip.id = 'item-tip';
  tip.style.display = 'none';
  document.body.appendChild(tip);
  const t = tip;
  document.addEventListener('pointermove', (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('[data-name]') as HTMLElement | null;
    const name = el?.getAttribute('data-name');
    if (name) {
      if (t.textContent !== name) t.textContent = name;
      t.style.display = 'block';
      const x = Math.min(window.innerWidth - t.offsetWidth - 8, e.clientX + 14);
      const y = Math.min(window.innerHeight - t.offsetHeight - 8, e.clientY + 18);
      t.style.left = Math.max(4, x) + 'px';
      t.style.top = Math.max(4, y) + 'px';
    } else if (t.style.display !== 'none') {
      t.style.display = 'none';
    }
  });
}
