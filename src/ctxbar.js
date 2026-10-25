// Плавающая панель для выделенной картинки, видео, кнопки, спойлера или таблицы.
import { NodeSelection } from '@tiptap/pm/state';
import { el, toolButton, formDialog } from './ui.js';
import { pickImages, editButton } from './toolbar.js';

export function setupContextBar(bar, editor, canvas) {
  const chain = () => editor.chain().focus();
  const textBtn = (label, title, onClick) => el('button', { class: 'cbtn', type: 'button', title, onMousedown: (e) => e.preventDefault(), onClick }, label);
  const sizeBtn = (label, attr, value, type) => {
    const b = el('button', { class: 'cbtn', type: 'button', onMousedown: (e) => e.preventDefault(), onClick: () => chain().updateAttributes(type, { [attr]: value }).run() }, label);
    return b;
  };

  function current() {
    const sel = editor.state.selection;
    if (sel instanceof NodeSelection) {
      const name = sel.node.type.name;
      if (['image', 'video', 'hnButton'].includes(name)) return { kind: name, node: sel.node, pos: sel.from };
    }
    if (editor.isActive('table')) return { kind: 'table' };
    if (editor.isActive('spoiler')) return { kind: 'spoiler' };
    return null;
  }

  function content(ctx) {
    const a = ctx.node?.attrs || {};
    switch (ctx.kind) {
      case 'image':
        return [
          el('span', { class: 'clabel' }, 'Картинка'),
          ['25%', '50%', '75%', '100%'].map((w) => mark(sizeBtn(w, 'width', w, 'image'), (a.width || '100%') === w)),
          el('span', { class: 'csep' }),
          el('span', { class: 'clabel' }, 'Обтекание'),
          mark(textBtn('Сверху и снизу', 'Текст только над и под картинкой', () => chain().updateAttributes('image', { wrap: 'none' }).run()), (a.wrap || 'none') === 'none'),
          mark(textBtn('Вокруг рамки ◧', 'Картинка слева, текст обтекает справа', () => chain().updateAttributes('image', { wrap: 'left', width: shrink(a.width) }).run()), a.wrap === 'left'),
          mark(textBtn('Вокруг рамки ◨', 'Картинка справа, текст обтекает слева', () => chain().updateAttributes('image', { wrap: 'right', width: shrink(a.width) }).run()), a.wrap === 'right'),
          (a.wrap || 'none') === 'none' ? [
            el('span', { class: 'csep' }),
            mark(toolButton({ iconName: 'AlignLeft', label: 'Слева', onClick: () => chain().updateAttributes('image', { align: 'left' }).run() }), a.align === 'left'),
            mark(toolButton({ iconName: 'AlignCenter', label: 'По центру', onClick: () => chain().updateAttributes('image', { align: 'center' }).run() }), a.align === 'center'),
            mark(toolButton({ iconName: 'AlignRight', label: 'Справа', onClick: () => chain().updateAttributes('image', { align: 'right' }).run() }), a.align === 'right'),
          ] : [],
          el('span', { class: 'csep' }),
          toolButton({ iconName: 'Type', label: 'Подпись при просмотре (alt)', onClick: () => editAlt(ctx) }),
          toolButton({ iconName: 'Replace', label: 'Заменить картинку', onClick: () => pickImages(editor, ctx.pos) }),
          toolButton({ iconName: 'Trash2', label: 'Удалить', onClick: () => chain().deleteSelection().run() }),
        ];
      case 'video':
        return [
          el('span', { class: 'clabel' }, 'Видео'),
          ['50%', '75%', '100%'].map((w) => mark(sizeBtn(w, 'width', w, 'video'), (a.width || '100%') === w)),
          el('span', { class: 'csep' }),
          toolButton({ iconName: 'Trash2', label: 'Удалить', onClick: () => chain().deleteSelection().run() }),
        ];
      case 'hnButton':
        return [
          el('span', { class: 'clabel' }, 'Кнопка'),
          toolButton({ iconName: 'Pencil', label: 'Изменить', text: 'Изменить', onClick: () => editButton(editor, a) }),
          toolButton({ iconName: 'Trash2', label: 'Удалить', onClick: () => chain().deleteSelection().run() }),
        ];
      case 'spoiler': {
        const open = editor.getAttributes('spoiler').open;
        return [
          el('span', { class: 'clabel' }, 'Спойлер'),
          mark(el('button', { class: 'cbtn', type: 'button', onMousedown: (e) => e.preventDefault(), onClick: () => chain().updateAttributes('spoiler', { open: !open }).run() }, 'Открыт по умолчанию'), open),
        ];
      }
      case 'table':
        return [
          el('span', { class: 'clabel' }, 'Таблица'),
          toolButton({ iconName: 'BetweenHorizontalEnd', label: 'Строка ниже', text: '+ строка', onClick: () => chain().addRowAfter().run() }),
          toolButton({ iconName: 'BetweenVerticalEnd', label: 'Столбец справа', text: '+ столбец', onClick: () => chain().addColumnAfter().run() }),
          toolButton({ iconName: 'Rows3', label: 'Удалить строку', text: '− строка', onClick: () => chain().deleteRow().run() }),
          toolButton({ iconName: 'Columns3', label: 'Удалить столбец', text: '− столбец', onClick: () => chain().deleteColumn().run() }),
          toolButton({ iconName: 'Heading', label: 'Строка заголовков', onClick: () => chain().toggleHeaderRow().run() }),
          toolButton({ iconName: 'TableCellsMerge', label: 'Объединить или разделить ячейки', onClick: () => chain().mergeOrSplit().run() }),
          toolButton({ iconName: 'Trash2', label: 'Удалить таблицу', onClick: () => chain().deleteTable().run() }),
        ];
      default:
        return [];
    }
  }

  async function editAlt(ctx) {
    const v = await formDialog({ title: 'Подпись картинки', fields: [{ name: 'alt', label: 'Подпись (показывается при просмотре)', value: ctx.node.attrs.alt || '' }] });
    if (v) chain().setNodeSelection(ctx.pos).updateAttributes('image', { alt: v.alt }).run();
  }

  let lastKey = '';
  function update() {
    const ctx = current();
    if (!ctx) {
      bar.hidden = true;
      lastKey = '';
      return;
    }
    const key = `${ctx.kind}:${JSON.stringify(ctx.node?.attrs || {})}:${ctx.kind === 'spoiler' ? editor.getAttributes('spoiler').open : ''}`;
    if (key !== lastKey) {
      bar.replaceChildren(...content(ctx).flat());
      lastKey = key;
    }
    bar.hidden = false;
    position(ctx);
  }

  function position(ctx) {
    let rect;
    if (ctx.pos != null) {
      const dom = editor.view.nodeDOM(ctx.pos);
      rect = dom?.getBoundingClientRect?.();
    } else {
      const { $from } = editor.state.selection;
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === ctx.kind) {
          rect = editor.view.nodeDOM($from.before(d))?.getBoundingClientRect?.();
          break;
        }
      }
    }
    if (!rect) return;
    const canvasRect = canvas.getBoundingClientRect();
    const top = Math.max(canvasRect.top + 6, rect.top - bar.offsetHeight - 8);
    const left = Math.min(Math.max(canvasRect.left + 8, rect.left), window.innerWidth - bar.offsetWidth - 12);
    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
  }

  canvas.addEventListener('scroll', () => { if (!bar.hidden) update(); });
  window.addEventListener('resize', () => { if (!bar.hidden) update(); });
  return update;
}

/** При включении обтекания широкая картинка ужимается до 40 %, иначе тексту рядом не останется места. */
function shrink(width) {
  const n = parseInt(width || '100', 10);
  return n > 60 ? '40%' : width;
}

function mark(button, active) {
  button.classList.toggle('active', !!active);
  return button;
}
