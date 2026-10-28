// Настраиваемое расположение кнопок: любую можно перетащить в строку файла, на верхнюю, нижнюю, левую или правую
// панель или убрать в «Скрытые». Пустые панели не видны, пока не включён режим настройки.
import { el } from './ui.js';

const KEY = 'hn-layout-v1';
export const DEFAULT_LAYOUT = {
  file: ['undo', 'redo', '|', 'new', 'open', 'save', 'saveAs', 'browser', 'update'],
  top: ['style', 'font', 'size', '|', 'bold', 'italic', 'underline', 'strike', 'color', 'mark', '|', 'link', '|',
    'alignLeft', 'alignCenter', 'alignRight', 'alignJustify', '|', 'bullet', 'ordered', 'task', 'quote', 'code'],
  side: ['emoji', 'image', 'video', 'table', 'button', 'spoiler', 'hr', 'clear'],
  bottom: [],
  right: [],
  hidden: [],
};
const ZONES = ['file', 'top', 'side', 'bottom', 'right', 'hidden'];

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    // Расположение из прошлых версий: недостающие панели (нижняя, правая) добавляются пустыми.
    if (saved && ['file', 'top', 'side'].every((z) => Array.isArray(saved[z]))) {
      for (const z of ZONES) if (!Array.isArray(saved[z])) saved[z] = [];
      return saved;
    }
  } catch { /* повреждённые настройки — берём стандартные */ }
  return structuredClone(DEFAULT_LAYOUT);
}

/**
 * tools — Map id → элемент; zones — { file, top, side, bottom, right, hidden } контейнеры.
 * Возвращает { setEditing(bool), reset() }.
 */
export function setupLayout(tools, zones) {
  let dragged = null;

  function separator() {
    return el('div', { class: 'tsep', dataset: { tool: '|' } });
  }

  function apply(layout) {
    const placed = new Set();
    for (const z of ZONES) {
      const items = [];
      for (const id of layout[z] || []) {
        if (id === '|') { items.push(separator()); continue; }
        const t = tools.get(id);
        if (t && !placed.has(id)) { items.push(t); placed.add(id); }
      }
      zones[z].replaceChildren(...items);
    }
    // Новые инструменты, которых не было в сохранённом расположении, встают на своё стандартное место
    // (или на левую панель, если его нет).
    for (const [id, t] of tools) {
      if (placed.has(id)) continue;
      const home = ZONES.find((z) => DEFAULT_LAYOUT[z].includes(id)) || 'side';
      zones[home].append(t);
    }
    markEmpty();
  }

  function current() {
    const layout = {};
    for (const z of ZONES) layout[z] = [...zones[z].children].map((c) => c.dataset.tool).filter(Boolean);
    return layout;
  }

  function save() {
    markEmpty();
    try { localStorage.setItem(KEY, JSON.stringify(current())); } catch { /* не запомнится — не страшно */ }
  }

  /** Панель без кнопок (разделители не в счёт) помечается пустой — такие скрываются вне режима настройки. */
  function markEmpty() {
    for (const z of ZONES) {
      zones[z].classList.toggle('is-empty', ![...zones[z].children].some((c) => c.dataset.tool && c.dataset.tool !== '|'));
    }
  }

  // Своё перетаскивание на событиях указателя. Стандартное (HTML5 drag & drop) не годится: кнопки отменяют
  // нажатие мыши, чтобы не сбрасывать выделение текста, и браузер из-за этого не начинает перетаскивание.
  const zoneAt = (x, y) => {
    for (const z of ZONES) {
      const zone = zones[z];
      if (!zone.offsetParent && zone !== zones.hidden) continue;
      const r = zone.getBoundingClientRect();
      if (r.width && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return zone;
    }
    return null;
  };
  const placeIn = (zone, x, y) => {
    let before = null;
    for (const c of zone.children) {
      if (c === dragged) continue;
      const r = c.getBoundingClientRect();
      const inRow = y >= r.top && y <= r.bottom;
      // И строки сверху, и панель слева заполняются слева направо, сверху вниз.
      if (inRow ? x < r.left + r.width / 2 : y < r.top) { before = c; break; }
    }
    if (before) { if (before.previousSibling !== dragged) zone.insertBefore(dragged, before); }
    else if (zone.lastChild !== dragged) zone.append(dragged);
    markEmpty();
  };

  document.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('layout-edit') || e.button !== 0) return;
    const item = e.target.closest('.zone > [data-tool]');
    if (!item) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 4) return;
        dragged = item;
        ghost = item.cloneNode(true);
        ghost.classList.add('drag-ghost');
        ghost.style.width = `${item.offsetWidth}px`;
        document.body.append(ghost);
        item.classList.add('dragging');
      }
      ghost.style.left = `${ev.clientX - 14}px`;
      ghost.style.top = `${ev.clientY - 14}px`;
      const zone = zoneAt(ev.clientX, ev.clientY);
      if (zone) placeIn(zone, ev.clientX, ev.clientY);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      if (ghost) {
        ghost.remove();
        dragged.classList.remove('dragging');
        dragged = null;
        save();
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
  }, true);
  // Списки (шрифт, размер) иначе раскрываются по нажатию и «съедают» отпускание мыши.
  document.addEventListener('mousedown', (e) => {
    if (document.body.classList.contains('layout-edit') && e.target.closest('.zone > [data-tool]')) e.preventDefault();
  }, true);

  // В режиме настройки кнопки не срабатывают, только перетаскиваются.
  for (const z of ZONES) {
    zones[z].dataset.zone = z;
    zones[z].addEventListener('click', (e) => {
      if (document.body.classList.contains('layout-edit')) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  // Меню по правой кнопке в режиме настройки: добавить разделитель после кнопки или убрать его.
  let menu = null;
  const closeMenu = () => { menu?.remove(); menu = null; };
  document.addEventListener('contextmenu', (e) => {
    if (!document.body.classList.contains('layout-edit')) return;
    const zone = e.target.closest('.zone');
    if (!zone) return;
    e.preventDefault();
    closeMenu();
    const item = e.target.closest('.zone > [data-tool]');
    const action = (label, run) => el('button', { class: 'ctx-item', type: 'button', onClick: () => { run(); closeMenu(); save(); } }, label);
    const items = [action('Добавить разделитель', () => {
      if (item) item.after(separator());
      else zone.append(separator());
    })];
    if (item?.dataset.tool === '|') items.push(action('Убрать разделитель', () => item.remove()));
    menu = el('div', { class: 'ctx-menu', role: 'menu' }, items);
    document.body.append(menu);
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8)}px`;
  });
  document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  apply(load());

  return {
    setEditing(on) {
      document.body.classList.toggle('layout-edit', on);
      if (!on) { save(); closeMenu(); }
    },
    reset() {
      apply(structuredClone(DEFAULT_LAYOUT));
      save();
    },
  };
}
