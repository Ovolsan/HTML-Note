// Верхняя панель форматирования в стиле Google Документов.
import { el, icon, toolButton, popover, closePopover, formDialog, toast, readAsDataUrl } from './ui.js';
import { insertMediaFiles } from './editor.js';
import { videoPage } from './extensions.js';
import { openEmojiPicker } from './emoji.js';

const FONTS = [
  ['', 'Segoe UI'], ['Arial', 'Arial'], ['Calibri', 'Calibri'], ['Verdana', 'Verdana'], ['Tahoma', 'Tahoma'],
  ['Trebuchet MS', 'Trebuchet MS'], ['Bahnschrift', 'Bahnschrift'], ['Consolas', 'Consolas'], ['Courier New', 'Courier New'],
  ['Georgia', 'Georgia'], ['Times New Roman', 'Times New Roman'], ['Comic Sans MS', 'Comic Sans MS'],
];
const SIZES = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px'];
const TEXT_COLORS = ['#e6e6e9', '#9a9ba3', '#5c5f66', '#ffffff', '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c',
  '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#c92a2a', '#2b8a3e', '#1864ab'];
const MARK_COLORS = ['#6b2a2a', '#6b4a22', '#665a1c', '#2c5a2e', '#1f5650', '#1f4566', '#3d356e', '#5c2f57'];

/**
 * Создаёт все инструменты форматирования и вставки. Возвращает { tools, refresh }:
 * tools — Map id → элемент; где какой инструмент стоит, решает layout.js (его можно перетаскивать).
 */
export function buildTools(editor) {
  const toggles = [];
  const tools = new Map();
  const chain = () => editor.chain().focus();

  /** short — подпись на левой панели; label — полная подсказка. */
  const add = (id, { iconName, short, label, shortcut, onClick, isActive }) => {
    const b = toolButton({ iconName, label, shortcut, onClick: () => onClick(b), short });
    b.dataset.tool = id;
    if (isActive) toggles.push([b, isActive]);
    tools.set(id, b);
    return b;
  };
  const addControl = (id, short, element) => {
    const wrap = el('div', { class: 'tcontrol', dataset: { tool: id } }, el('span', { class: 'tbtn-label' }, short), element);
    tools.set(id, wrap);
    return element;
  };

  const styleSelect = addControl('style', 'Стиль абзаца', el('select', { class: 'tselect style', title: 'Стиль абзаца', onChange: (e) => {
    const v = e.target.value;
    if (v === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(v) }).run();
  } },
  el('option', { value: 'p' }, 'Обычный текст'),
  [1, 2, 3, 4].map((l) => el('option', { value: String(l) }, `Заголовок ${l}`))));

  const fontSelect = addControl('font', 'Шрифт', el('select', { class: 'tselect font', title: 'Шрифт выделенного текста', onChange: (e) => {
    const v = e.target.value;
    if (v) chain().setFontFamily(v).run();
    else chain().unsetFontFamily().run();
  } }, FONTS.map(([v, label]) => el('option', { value: v, style: `font-family: ${v || 'Segoe UI'}` }, label))));

  const sizeSelect = addControl('size', 'Размер', el('select', { class: 'tselect size', title: 'Размер выделенного текста', onChange: (e) => {
    const v = e.target.value;
    if (v) chain().setFontSize(v).run();
    else chain().unsetFontSize().run();
  } }, el('option', { value: '' }, 'Размер'), SIZES.map((s) => el('option', { value: s }, s.replace('px', '')))));

  function colorPopover(anchor, kind) {
    const colors = kind === 'text' ? TEXT_COLORS : MARK_COLORS;
    const apply = (c) => {
      if (kind === 'text') chain().setColor(c).run();
      else chain().setHighlight({ color: c }).run();
      closePopover();
    };
    const custom = el('input', { type: 'color', value: kind === 'text' ? '#e6e6e9' : '#665a1c', onChange: (e) => apply(e.target.value) });
    popover(anchor, el('div', { class: 'palette' },
      el('div', { class: 'swatches' }, colors.map((c) => el('button', { class: 'swatch', type: 'button', title: c, style: `background:${c}`, onMousedown: (e) => e.preventDefault(), onClick: () => apply(c) }))),
      el('div', { class: 'palette-row' },
        el('label', { class: 'custom-color' }, custom, 'Другой цвет'),
        el('button', { class: 'btn small', type: 'button', onClick: () => {
          if (kind === 'text') chain().unsetColor().run();
          else chain().unsetHighlight().run();
          closePopover();
        } }, 'Сбросить'))));
  }

  add('undo', { iconName: 'Undo2', short: 'Отменить', label: 'Отменить', shortcut: 'Ctrl+Z', onClick: () => chain().undo().run() });
  add('redo', { iconName: 'Redo2', short: 'Повторить', label: 'Повторить', shortcut: 'Ctrl+Y', onClick: () => chain().redo().run() });
  add('bold', { iconName: 'Bold', short: 'Жирный', label: 'Жирный', shortcut: 'Ctrl+B', onClick: () => chain().toggleBold().run(), isActive: () => editor.isActive('bold') });
  add('italic', { iconName: 'Italic', short: 'Курсив', label: 'Курсив', shortcut: 'Ctrl+I', onClick: () => chain().toggleItalic().run(), isActive: () => editor.isActive('italic') });
  add('underline', { iconName: 'Underline', short: 'Подчёркнутый', label: 'Подчёркнутый', shortcut: 'Ctrl+U', onClick: () => chain().toggleUnderline().run(), isActive: () => editor.isActive('underline') });
  add('strike', { iconName: 'Strikethrough', short: 'Зачёркнутый', label: 'Зачёркнутый', shortcut: 'Alt+Shift+5', onClick: () => chain().toggleStrike().run(), isActive: () => editor.isActive('strike') });
  const colorBtn = add('color', { iconName: 'Baseline', short: 'Цвет текста', label: 'Цвет текста', onClick: (b) => colorPopover(b, 'text') });
  add('mark', { iconName: 'Highlighter', short: 'Выделение', label: 'Цвет выделения', onClick: (b) => colorPopover(b, 'mark') });
  add('link', { iconName: 'Link', short: 'Ссылка', label: 'Ссылка', shortcut: 'Ctrl+K', onClick: () => editLink(editor), isActive: () => editor.isActive('link') });
  add('alignLeft', { iconName: 'AlignLeft', short: 'Влево', label: 'По левому краю', onClick: () => chain().setTextAlign('left').run(), isActive: () => editor.isActive({ textAlign: 'left' }) });
  add('alignCenter', { iconName: 'AlignCenter', short: 'По центру', label: 'По центру', onClick: () => chain().setTextAlign('center').run(), isActive: () => editor.isActive({ textAlign: 'center' }) });
  add('alignRight', { iconName: 'AlignRight', short: 'Вправо', label: 'По правому краю', onClick: () => chain().setTextAlign('right').run(), isActive: () => editor.isActive({ textAlign: 'right' }) });
  add('alignJustify', { iconName: 'AlignJustify', short: 'По ширине', label: 'По ширине', onClick: () => chain().setTextAlign('justify').run(), isActive: () => editor.isActive({ textAlign: 'justify' }) });
  add('bullet', { iconName: 'List', short: 'Список', label: 'Маркированный список', onClick: () => chain().toggleBulletList().run(), isActive: () => editor.isActive('bulletList') });
  add('ordered', { iconName: 'ListOrdered', short: 'Нумерация', label: 'Нумерованный список', onClick: () => chain().toggleOrderedList().run(), isActive: () => editor.isActive('orderedList') });
  add('task', { iconName: 'ListTodo', short: 'Задачи', label: 'Список задач', onClick: () => chain().toggleTaskList().run(), isActive: () => editor.isActive('taskList') });
  add('quote', { iconName: 'Quote', short: 'Цитата', label: 'Цитата', onClick: () => chain().toggleBlockquote().run(), isActive: () => editor.isActive('blockquote') });
  add('code', { iconName: 'CodeXml', short: 'Код', label: 'Блок кода', onClick: () => chain().toggleCodeBlock().run(), isActive: () => editor.isActive('codeBlock') });
  add('clear', { iconName: 'RemoveFormatting', short: 'Очистить', label: 'Очистить форматирование', onClick: () => chain().unsetAllMarks().clearNodes().run() });
  add('emoji', { iconName: 'Smile', short: 'Эмодзи', label: 'Эмодзи: свои и стандартные; можно набрать :имя:', onClick: (b) => openEmojiPicker(b, editor) });
  add('image', { iconName: 'Image', short: 'Картинка', label: 'Картинка (можно вставить через Ctrl+V или перетащить)', onClick: () => pickImages(editor) });
  add('video', { iconName: 'Clapperboard', short: 'Видео', label: 'Видео: файл или прямая ссылка на .mp4', onClick: () => insertVideo(editor) });
  add('table', { iconName: 'Table', short: 'Таблица', label: 'Таблица 3×3', onClick: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() });
  add('button', { iconName: 'MousePointerClick', short: 'Кнопка', label: 'Кнопка-ссылка', onClick: () => editButton(editor) });
  add('spoiler', { iconName: 'ChevronsDownUp', short: 'Спойлер', label: 'Спойлер (сворачиваемый блок)', onClick: () => chain().setSpoiler().run() });
  add('hr', { iconName: 'Minus', short: 'Линия', label: 'Горизонтальная линия', onClick: () => chain().setHorizontalRule().run() });

  function refresh() {
    for (const [b, isActive] of toggles) b.classList.toggle('active', !!isActive());
    const h = [1, 2, 3, 4].find((l) => editor.isActive('heading', { level: l }));
    styleSelect.value = h ? String(h) : 'p';
    const ts = editor.getAttributes('textStyle');
    fontSelect.value = FONTS.some(([v]) => v === ts.fontFamily) ? ts.fontFamily : '';
    sizeSelect.value = SIZES.includes(ts.fontSize) ? ts.fontSize : '';
    colorBtn.querySelector('svg')?.style.setProperty('color', ts.color || '');
  }
  return { tools, refresh };
}

export async function editLink(editor) {
  const current = editor.getAttributes('link').href || '';
  const { from, to, empty } = editor.state.selection;
  const fields = [{ name: 'href', label: 'Адрес ссылки', type: 'url', value: current, placeholder: 'https://…' }];
  if (empty && !current) fields.push({ name: 'text', label: 'Текст ссылки', value: '' });
  const v = await formDialog({ title: current ? 'Изменить ссылку' : 'Вставить ссылку', fields, okText: 'Применить' });
  if (!v) return editor.commands.focus();
  const chain = editor.chain().focus();
  if (!v.href) return chain.extendMarkRange('link').unsetLink().run();
  if (empty && !current) {
    return chain.insertContent({ type: 'text', text: v.text || v.href, marks: [{ type: 'link', attrs: { href: v.href } }] }).run();
  }
  return chain.setTextSelection({ from, to }).extendMarkRange('link').setLink({ href: v.href }).run();
}

export function pickImages(editor, replacePos) {
  const input = el('input', { type: 'file', accept: 'image/*', multiple: replacePos == null });
  input.onchange = async () => {
    const files = [...input.files];
    if (!files.length) return;
    if (replacePos != null) {
      const src = await readAsDataUrl(files[0]);
      editor.chain().focus().setNodeSelection(replacePos).updateAttributes('image', { src }).run();
    } else {
      insertMediaFiles(editor, files);
    }
  };
  input.click();
}

export async function insertVideo(editor) {
  const v = await formDialog({
    title: 'Вставить видео',
    fields: [
      { name: 'url', label: 'Ссылка на видео', type: 'url', placeholder: 'Прямая ссылка на .mp4 или .webm', hint: 'Или выберите файл ниже — он будет встроен в документ.' },
      { name: 'file', label: 'Файл с компьютера', type: 'file', accept: 'video/*' },
    ],
    okText: 'Вставить',
  });
  if (!v) return editor.commands.focus();
  if (v.file) return insertMediaFiles(editor, [v.file]);
  if (!v.url) return toast('Укажите ссылку или выберите файл.', 'warn');
  const site = videoPage(v.url);
  if (site) {
    toast(`Видео с ${site.site} вставлено ссылкой: его плеер не играет в файле, открытом с диска.`);
    return editor.chain().focus().insertContent(`<p><a href="${site.page}">Видео на ${site.site} ↗</a></p>`).run();
  }
  return editor.chain().focus().setVideo({ src: v.url }).run();
}

export async function editButton(editor, existing) {
  const v = await formDialog({
    title: existing ? 'Изменить кнопку' : 'Вставить кнопку',
    fields: [
      { name: 'text', label: 'Надпись', value: existing?.text || 'Открыть' },
      { name: 'href', label: 'Ссылка', type: 'url', value: existing?.href || '', placeholder: 'https://…' },
      { name: 'variant', label: 'Вид', type: 'select', value: existing?.variant || 'primary', options: [
        { value: 'primary', label: 'Заливка' }, { value: 'outline', label: 'Контур' }] },
    ],
    okText: existing ? 'Применить' : 'Вставить',
  });
  if (!v) return editor.commands.focus();
  const attrs = { text: v.text || 'Кнопка', href: v.href || '#', variant: v.variant };
  if (existing) return editor.chain().focus().updateAttributes('hnButton', attrs).run();
  return editor.chain().focus().setButton(attrs).run();
}

export { icon };
