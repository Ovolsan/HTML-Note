// Левая панель инструментов: содержание и блоки (вставка, вложенность, настройки).
import { TextSelection } from '@tiptap/pm/state';
import { el, icon } from './ui.js';
import { collectHeadings } from './document.js';

const PRESETS = [
  { label: 'Карточка', attrs: { bg: '#26282d', fg: null, border: 'line' } },
  { label: 'Акцент', attrs: { bg: '#163d43', fg: '#eef5f2', border: 'none' } },
  { label: 'Светлая', attrs: { bg: '#fbfaf6', fg: '#172f34', border: 'line' } },
  { label: 'Рамка', attrs: { bg: null, fg: null, border: 'accent' } },
  { label: 'Без оформления', attrs: { bg: null, fg: null, border: 'none' } },
];
const BG = ['#1f2024', '#26282d', '#2f3137', '#163d43', '#1f3a5c', '#3d2f5c', '#4a2a2a', '#4a3f22', '#fbfaf6', '#e9eef5'];
const FG = ['#e6e6e9', '#9a9ba3', '#ffffff', '#eef5f2', '#172f34', '#111214', '#5aa9ff', '#ffd43b'];

/** Все блоки вокруг курсора, от внешнего к внутреннему. */
function blocksAround(state) {
  const { $from } = state.selection;
  const list = [];
  for (let d = 1; d <= $from.depth; d++) {
    const node = $from.node(d);
    if (node.type.name === 'hnFrame') {
      list.push({ node, pos: $from.before(d), frame: true, frames: state.doc.childCount });
    } else if (node.type.name === 'hnBlock') {
      const parent = $from.node(d - 1);
      list.push({ node, pos: $from.before(d), inRow: parent.type.name === 'hnRow', rowPos: d > 1 ? $from.before(d - 1) : null, rowSize: parent.childCount });
    }
  }
  return list;
}

export function setupSidebar(container, editor, { getSettings, setSettings }) {
  let level = null; // какой из вложенных блоков настраивается (индекс от внешнего); null — самый внутренний
  let lastInner = null;
  let lastKey = '';

  const tocList = el('nav', { class: 'toc-list', 'aria-label': 'Содержание' });
  const tocSwitch = el('input', { type: 'checkbox', class: 'switch', onChange: (e) => setSettings({ toc: e.target.checked }) });
  const collapse = el('button', { class: 'tbtn collapse', type: 'button', title: 'Свернуть панель', onClick: () => document.body.classList.toggle('sidebar-collapsed') }, icon('PanelLeft'));
  const blockBox = el('div', { class: 'block-settings' });
  const chain = () => editor.chain().focus();
  const keep = (e) => e.preventDefault();
  const sbtn = (label, onClick, title) => el('button', { class: 'sbtn', type: 'button', title: title || label, onMousedown: keep, onClick }, label);

  // Зона инструментов слева и «Скрытые» (видны только в режиме настройки панелей).
  const toolZone = el('div', { class: 'side-tools zone' });
  const hiddenZone = el('div', { class: 'side-tools zone hidden-zone' });
  let onEdit = () => {};
  let onReset = () => {};
  const resetBtn = el('button', { class: 'btn small', type: 'button', onClick: () => onReset() }, 'Как было');
  const editBtn = el('button', { class: 'tbtn', type: 'button', title: 'Настроить панели: перетаскивайте кнопки куда угодно', onClick: () => {
    const on = !document.body.classList.contains('layout-edit');
    editBtn.classList.toggle('active', on);
    onEdit(on);
  } }, icon('Settings2'));

  container.append(
    el('div', { class: 'side-head' }, el('span', {}, 'Инструменты'), el('div', { class: 'side-head-btns' }, editBtn, collapse)),
    el('div', { class: 'layout-hint' }, 'Перетаскивайте кнопки между верхними строками, этой панелью и «Скрытыми». Кнопки пока не нажимаются. ', resetBtn),
    toolZone,
    el('div', { class: 'layout-hint-title' }, 'Скрытые'),
    hiddenZone,
    el('div', { class: 'side-sep' }),
    el('div', { class: 'side-title' }, 'Содержание'),
    el('label', { class: 'side-row' }, tocSwitch, el('span', {}, 'Показывать содержание')),
    el('div', { class: 'side-hint' }, 'Собирается из заголовков. В сохранённом файле его можно скрыть кнопкой.'),
    tocList,
    el('div', { class: 'side-sep' }),
    el('div', { class: 'side-title' }, 'Блоки'),
    el('div', { class: 'side-hint' }, 'Лист на холсте двигается за полоску сверху, размер — за края. Новый лист — двойной щелчок по пустому месту холста.'),
    el('div', { class: 'sbtn-row wrap' },
      sbtn('+ Лист на холсте', () => chain().insertFrame().run(), 'Новый лист справа от остальных; его можно передвинуть'),
      sbtn('+ Блок', () => chain().insertBlock(PRESETS[0].attrs).run(), 'Вставить блок (можно внутрь другого блока)'),
      sbtn('+ 2 колонки', () => chain().insertRow(2, PRESETS[0].attrs).run(), 'Два блока рядом'),
      sbtn('+ 3 колонки', () => chain().insertRow(3, PRESETS[0].attrs).run(), 'Три блока рядом')),
    blockBox,
  );

  function update(target, patch) {
    editor.view.dispatch(editor.state.tr.setNodeMarkup(target.pos, null, { ...target.node.attrs, ...patch }));
    editor.commands.focus();
  }

  function renderBlock() {
    const blocks = blocksAround(editor.state);
    document.querySelectorAll('.hn-block-active').forEach((n) => n.classList.remove('hn-block-active'));
    if (!blocks.length) {
      level = null;
      if (lastKey === 'none') return;
      lastKey = 'none';
      blockBox.replaceChildren(el('div', { class: 'side-hint' }, 'Поставьте курсор внутрь блока, чтобы настроить его.'));
      return;
    }
    const innerPos = blocks[blocks.length - 1].pos;
    if (innerPos !== lastInner) { level = null; lastInner = innerPos; }
    const idx = level == null || level >= blocks.length ? blocks.length - 1 : level;
    const b = blocks[idx];
    const a = b.node.attrs;
    editor.view.nodeDOM(b.pos)?.classList?.add('hn-block-active');
    // При наборе текста курсор двигается постоянно — перестраиваем панель, только если сменился блок или его настройки.
    const key = `${blocks.map((x) => x.pos).join(',')}|${idx}|${JSON.stringify(a)}|${b.rowSize}`;
    if (key === lastKey) return;
    lastKey = key;

    const crumbs = blocks.length > 1
      ? el('div', { class: 'crumbs' }, blocks.map((_, i) => el('button', { class: `crumb${i === idx ? ' active' : ''}`, type: 'button', onMousedown: keep,
        onClick: () => { level = i; lastKey = ''; renderBlock(); } }, blocks[i].frame ? 'Лист' : (i <= 1 ? 'Блок' : `Вложенный ${i - 1}`))))
      : null;
    const swatches = (colors, value, onPick) => el('div', { class: 'mini-swatches' },
      colors.map((c) => el('button', { class: `mini-swatch${value === c ? ' active' : ''}`, type: 'button', title: c, style: `background:${c}`, onMousedown: keep, onClick: () => onPick(c) })),
      el('button', { class: `mini-swatch none${value ? '' : ' active'}`, type: 'button', title: 'Без цвета', onMousedown: keep, onClick: () => onPick(null) }, '∅'));
    const choice = (options, value, onPick) => el('div', { class: 'seg' }, options.map(([v, label]) => el('button', { class: `seg-btn${value === v ? ' active' : ''}`, type: 'button', onMousedown: keep, onClick: () => onPick(v) }, label)));

    const posInput = (label, value, onSet) => el('label', { class: 'pos-field' }, el('span', {}, label),
      el('input', { class: 'num', type: 'number', step: '4', value: String(value), onChange: (e) => onSet(Math.round(Number(e.target.value) || 0)) }));
    const infinite = a.height == null;
    const heightInput = el('input', { class: 'num', type: 'number', min: '60', step: '20', value: String(a.height || 300), disabled: infinite,
      onChange: (e) => update(b, { height: Math.max(60, Number(e.target.value) || 300) }) });

    blockBox.replaceChildren(...[
      el('div', { class: 'side-subtitle' }, b.frame ? 'Лист на холсте' : b.inRow ? 'Блок в колонке' : 'Блок'),
      b.frame ? el('div', { class: 'pos-row' },
        posInput('X', a.x, (v) => update(b, { x: Math.max(0, v) })),
        posInput('Y', a.y, (v) => update(b, { y: Math.max(0, v) })),
        posInput('Ширина', a.w, (v) => update(b, { w: Math.max(160, v) }))) : null,
      crumbs,
      el('div', { class: 'field-label' }, 'Стиль'),
      el('div', { class: 'sbtn-row wrap' }, PRESETS.map((p) => sbtn(p.label, () => update(b, p.attrs)))),
      el('div', { class: 'field-label' }, 'Фон'),
      swatches(BG, a.bg, (c) => update(b, { bg: c })),
      el('div', { class: 'field-label' }, 'Цвет текста'),
      swatches(FG, a.fg, (c) => update(b, { fg: c })),
      el('div', { class: 'field-label' }, 'Рамка'),
      choice([['none', 'Нет'], ['line', 'Линия'], ['accent', 'Акцент']], a.border, (v) => update(b, { border: v })),
      el('div', { class: 'field-label' }, 'Отступы внутри'),
      choice([['none', '0'], ['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']], a.pad, (v) => update(b, { pad: v })),
      el('div', { class: 'field-label' }, 'Высота'),
      el('label', { class: 'side-row' },
        el('input', { type: 'checkbox', class: 'switch', checked: infinite, onChange: (e) => update(b, { height: e.target.checked ? null : Number(heightInput.value) || 300 }) }),
        el('span', {}, 'Бесконечная')),
      el('div', { class: 'height-row' }, heightInput, el('span', {}, 'px, дальше — прокрутка внутри блока')),
      b.inRow ? el('div', { class: 'sbtn-row wrap' },
        sbtn('+ колонка', () => {
          const tr = editor.state.tr.insert(b.pos + b.node.nodeSize, editor.schema.nodes.hnBlock.create(b.node.attrs, editor.schema.nodes.paragraph.create()));
          editor.view.dispatch(tr);
        }, 'Добавить блок справа в этом ряду'),
        b.rowSize > 1 ? sbtn('− колонка', () => editor.view.dispatch(editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize)), 'Удалить этот блок из ряда') : null) : null,
      b.frame ? el('div', { class: 'sbtn-row wrap' },
        b.frames > 1 ? sbtn('Удалить лист', () => editor.view.dispatch(editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize)), 'Удалить лист вместе с содержимым') : null) :
      el('div', { class: 'sbtn-row wrap' },
        sbtn('Абзац после', () => paragraphAfter(b), 'Добавить обычный абзац сразу после блока (или ряда)'),
        !b.inRow ? sbtn('Убрать рамку блока', () => {
          editor.view.dispatch(editor.state.tr.replaceWith(b.pos, b.pos + b.node.nodeSize, b.node.content));
        }, 'Оставить содержимое, убрать сам блок') : null,
        sbtn('Удалить блок', () => {
          const whole = b.inRow && b.rowSize === 1;
          const from = whole ? b.rowPos : b.pos;
          const size = whole ? editor.state.doc.nodeAt(b.rowPos).nodeSize : b.node.nodeSize;
          editor.view.dispatch(editor.state.tr.delete(from, from + size));
        }, 'Удалить блок вместе с содержимым')),
    ].filter(Boolean));
  }

  function paragraphAfter(b) {
    const container = b.inRow ? { pos: b.rowPos, size: editor.state.doc.nodeAt(b.rowPos).nodeSize } : { pos: b.pos, size: b.node.nodeSize };
    const at = container.pos + container.size;
    const tr = editor.state.tr.insert(at, editor.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  }

  function renderToc() {
    const s = getSettings();
    tocSwitch.checked = s.toc;
    tocList.hidden = !s.toc;
    if (!s.toc) return;
    const heads = collectHeadings(editor.state.doc);
    const minLevel = Math.min(...heads.map((h) => h.level), 3);
    tocList.replaceChildren(...(heads.length
      ? heads.map((h) => el('a', { class: `toc-item l${h.level - minLevel + 1}`, href: '#', onClick: (e) => {
        e.preventDefault();
        editor.chain().focus().setTextSelection(h.pos + 1).run();
        editor.view.nodeDOM(h.pos)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } }, h.text))
      : [el('div', { class: 'side-hint' }, 'Пока нет заголовков.')]));
  }

  return {
    toolZone,
    hiddenZone,
    onLayoutEdit(edit, reset) { onEdit = edit; onReset = reset; },
    refresh() { renderToc(); renderBlock(); },
    refreshSelection() { renderBlock(); },
  };
}
