// Своя рамка окна: верхняя полоса программы служит заголовком окна —
// за пустое место она перетаскивает окно, двойной щелчок разворачивает, справа кнопки «свернуть / развернуть / закрыть».
import { getCurrentWindow } from '@tauri-apps/api/window';
import { el, icon } from './ui.js';
import { isDesktop } from './platform.js';

export function setupTitlebar(bar) {
  if (!isDesktop) return;
  const win = getCurrentWindow();
  document.body.classList.add('custom-frame');

  const winBtn = (cls, title, iconName, onClick) => el('button', { class: `win-btn ${cls}`, type: 'button', title, tabindex: '-1', onClick }, icon(iconName, 16));
  const maxBtn = winBtn('max', 'Развернуть', 'Square', () => win.toggleMaximize());
  bar.append(el('div', { class: 'win-controls' },
    winBtn('min', 'Свернуть', 'Minus', () => win.minimize()),
    maxBtn,
    winBtn('close', 'Закрыть', 'X', () => win.close())));

  // Пустые места полосы (название, имя файла, промежутки) — как заголовок окна.
  bar.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, select, a, [data-tool]')) return;
    if (document.body.classList.contains('layout-edit') && e.target.closest('.zone')) return;
    if (e.detail === 2) win.toggleMaximize();
    else win.startDragging();
  });

  const syncMax = async () => {
    const max = await win.isMaximized();
    maxBtn.title = max ? 'Свернуть в окно' : 'Развернуть';
    maxBtn.replaceChildren(icon(max ? 'Copy' : 'Square', 16));
    document.body.classList.toggle('maximized', max);
  };
  syncMax();
  win.onResized(syncMax);
}
