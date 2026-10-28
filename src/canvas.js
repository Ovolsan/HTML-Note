// Холст: документ состоит из листов (hnFrame), которые стоят где угодно, двигаются и меняют размер.
// Внутри листов — обычный текст и блоки (hnBlock), блоки можно вкладывать, перетаскивать и растягивать.
import { Node, Extension } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { getDefaults } from './defaults.js';

export const CanvasDocument = Document.extend({ content: 'hnFrame+' });

const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const GRID = 4;
const snap = (v) => Math.round(v / GRID) * GRID;

/** Общие атрибуты оформления листа и блока. */
function looks(defaults) {
  return {
    bg: { default: defaults.bg ?? null, rendered: false },
    fg: { default: null, rendered: false },
    border: { default: defaults.border ?? 'line', rendered: false },
    pad: { default: defaults.pad ?? 'm', rendered: false },
    height: { default: null, rendered: false },
  };
}
function parseLooks(el) {
  return {
    bg: el.dataset.bg || null,
    fg: el.dataset.fg || null,
    border: el.dataset.border || 'line',
    pad: el.dataset.pad || 'm',
    height: el.dataset.height ? Number(el.dataset.height) : null,
  };
}
function looksAttrs(a, attrs, style) {
  attrs['data-border'] = a.border;
  attrs['data-pad'] = a.pad;
  if (a.bg) { attrs['data-bg'] = a.bg; style.push(`background: ${a.bg}`); }
  if (a.fg) { attrs['data-fg'] = a.fg; style.push(`color: ${a.fg}`); }
  if (a.height) { attrs['data-height'] = String(a.height); style.push(`height: ${a.height}px`, 'overflow-y: auto'); }
}

/** Перемещение и изменение размера по указателю. onMove(dx, dy) во время, onDone(dx, dy) в конце. */
function dragPointer(e, onMove, onDone) {
  // Нажатие не отменяем: иначе браузер не пришлёт mousedown, который гасит handle(),
  // и редактор потеряет фокус — а при потере фокуса лист перерисовывается и ручка пропадает.
  e.stopPropagation();
  if (e.button > 0) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let last = e;
  // Перерисовываем не чаще кадра экрана: движений приходит больше, чем браузер успевает отрисовать.
  let frame = 0;
  const move = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    last = ev;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; onMove(last.clientX - sx, last.clientY - sy, last); });
  };
  const up = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    cancelAnimationFrame(frame);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    document.body.classList.remove('hn-dragging');
    // pointercancel приходит без координат движения — берём последнюю известную точку.
    const end = ev.type === 'pointercancel' ? last : ev;
    onDone(end.clientX - sx, end.clientY - sy, end);
  };
  // Захват указателя: палец или мышь не «теряют» ручку, даже если ушли с неё быстрее перерисовки.
  try { e.target.setPointerCapture?.(e.pointerId); } catch { /* элемент уже убран */ }
  document.body.classList.add('hn-dragging');
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

/**
 * Изменения, которые узел делает сам (стили и классы рамки, ручек и самой области содержимого),
 * редактор не должен принимать за правку текста — иначе он перерисует всё содержимое, вместе с видео.
 */
function ignoreOwnMutation(m, content) {
  if (m.type === 'selection') return false;
  if (m.type === 'attributes' && m.target === content) return true;
  return !content.contains(m.target);
}

/** Элемент-ручка: нажатие на него не забирает фокус у редактора и не начинает выделение текста. */
function grabbable(el) {
  el.contentEditable = 'false';
  el.addEventListener('mousedown', (e) => e.preventDefault());
  return el;
}

function handle(cls, title) {
  const h = document.createElement('span');
  h.className = `hn-handle ${cls}`;
  if (title) h.title = title;
  return grabbable(h);
}

/** Ставит узлу в позиции pos новые атрибуты одной транзакцией. */
function setAttrsAt(editor, pos, type, patch) {
  if (typeof pos !== 'number') return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== type) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, null, { ...node.attrs, ...patch }));
}
function setAttrs(editor, getPos, patch, type) {
  const pos = getPos();
  setAttrsAt(editor, pos, type || editor.state.doc.nodeAt(pos)?.type.name, patch);
}

/**
 * Перетаскивание с запоминанием позиции узла в начале: даже если редактор перерисует узел
 * посреди перетаскивания, изменения применятся к актуальному элементу и к нужному узлу.
 */
function dragNode(e, editor, getPos, fallbackDom, onMove, onDone) {
  const pos = getPos();
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  const live = () => {
    const d = editor.view.nodeDOM(pos);
    return d && d.nodeType === 1 ? d : fallbackDom;
  };
  dragPointer(e, (dx, dy, ev) => onMove(live(), node, dx, dy, ev), (dx, dy, ev) => {
    const patch = onDone(live(), node, dx, dy, ev);
    if (patch) setAttrsAt(editor, pos, node.type.name, patch);
  });
}

// ---------- Лист на холсте ----------
export const HnFrame = Node.create({
  name: 'hnFrame',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      x: { default: 40, rendered: false },
      y: { default: 32, rendered: false },
      w: { default: 860, rendered: false },
      ...looks({ bg: '#1f2024', border: 'line', pad: 'xl' }),
    };
  },
  parseHTML() {
    return [{
      tag: 'div[data-type="frame"]',
      getAttrs: (el) => ({ x: num(el.dataset.x, 40), y: num(el.dataset.y, 32), w: num(el.dataset.w, 860), ...parseLooks(el) }),
    }];
  },
  renderHTML({ node }) {
    const a = node.attrs;
    const attrs = { 'data-type': 'frame', class: 'hn-frame', 'data-x': String(a.x), 'data-y': String(a.y), 'data-w': String(a.w) };
    const style = [`left: ${a.x}px`, `top: ${a.y}px`, `width: ${a.w}px`];
    looksAttrs(a, attrs, style);
    attrs.style = style.join('; ');
    return ['div', attrs, 0];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'hn-frame';
      const bar = grabbable(document.createElement('div'));
      bar.className = 'hn-frame-bar';
      bar.title = 'Тяните, чтобы передвинуть лист';
      bar.textContent = '⠿';
      const content = document.createElement('div');
      content.className = 'hn-frame-content';
      const hr = handle('r', 'Ширина');
      const hb = handle('b', 'Высота (двойной щелчок — бесконечная)');
      const hbr = handle('br', 'Размер');
      dom.append(bar, content, hr, hb, hbr);

      let cur = node;
      const apply = (n) => {
        cur = n;
        const a = n.attrs;
        dom.style.left = `${a.x}px`;
        dom.style.top = `${a.y}px`;
        dom.style.width = `${a.w}px`;
        dom.style.height = a.height ? `${a.height}px` : '';
        dom.style.background = a.bg || '';
        dom.style.color = a.fg || '';
        dom.dataset.border = a.border;
        dom.dataset.pad = a.pad;
        // У самого верха полоска для перетаскивания уходит внутрь листа, иначе её не достать.
        dom.classList.toggle('bar-inside', a.y < 28);
        content.classList.toggle('fixed', !!a.height);
      };
      apply(node);

      bar.addEventListener('pointerdown', (e) => {
        dragNode(e, editor, getPos, dom, (d, n, dx, dy) => {
          d.style.left = `${Math.max(0, n.attrs.x + dx)}px`;
          d.style.top = `${Math.max(0, n.attrs.y + dy)}px`;
        }, (d, n, dx, dy) => ({ x: snap(Math.max(0, n.attrs.x + dx)), y: snap(Math.max(0, n.attrs.y + dy)) }));
      });
      const resize = (horiz, vert) => (e) => {
        const w0 = dom.offsetWidth;
        const h0 = dom.offsetHeight;
        const calc = (n, dx, dy) => ({
          w: horiz ? Math.max(160, w0 + dx) : n.attrs.w,
          height: vert ? Math.max(80, h0 + dy) : n.attrs.height,
        });
        if (vert) content.classList.add('fixed');
        dragNode(e, editor, getPos, dom, (d, n, dx, dy) => {
          const s = calc(n, dx, dy);
          d.style.width = `${s.w}px`;
          if (vert) d.style.height = `${s.height}px`;
        }, (d, n, dx, dy) => {
          if (!dx && !dy) { // щелчок без движения — ничего не меняем
            content.classList.toggle('fixed', !!cur.attrs.height);
            return null;
          }
          const s = calc(n, dx, dy);
          return { w: snap(s.w), height: vert ? snap(s.height) : n.attrs.height };
        });
      };
      hr.addEventListener('pointerdown', resize(true, false));
      hb.addEventListener('pointerdown', resize(false, true));
      hbr.addEventListener('pointerdown', resize(true, true));
      hb.addEventListener('dblclick', () => setAttrs(editor, getPos, { height: null }));
      hbr.addEventListener('dblclick', () => setAttrs(editor, getPos, { height: null }));

      return {
        dom,
        contentDOM: content,
        update: (n) => {
          if (n.type.name !== 'hnFrame') return false;
          apply(n);
          return true;
        },
        stopEvent: (e) => e.target === bar || e.target.classList?.contains('hn-handle'),
        ignoreMutation: (m) => ignoreOwnMutation(m, content),
      };
    };
  },
  addCommands() {
    return {
      // Новый лист на холсте: по координатам или справа от последнего.
      insertFrame: (attrs = {}) => ({ state, tr, dispatch }) => {
        let { x, y } = attrs;
        if (x == null) {
          let maxRight = 0;
          let top = 32;
          state.doc.forEach((f) => {
            if (f.attrs.x + f.attrs.w > maxRight) { maxRight = f.attrs.x + f.attrs.w; top = f.attrs.y; }
          });
          x = maxRight + 40;
          y = top;
        }
        const frame = state.schema.nodes.hnFrame.create(
          { w: 420, pad: 'm', bg: '#26282d', border: 'line', ...getDefaults('frame'), ...attrs, x: snap(x), y: snap(y) },
          state.schema.nodes.paragraph.create(),
        );
        if (dispatch) {
          const at = tr.doc.content.size;
          tr.insert(at, frame);
          tr.setSelection(TextSelection.near(tr.doc.resolve(at + 2)));
          tr.scrollIntoView();
        }
        return true;
      },
    };
  },
});

// ---------- Блок внутри листа ----------
export const HnBlock = Node.create({
  name: 'hnBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes() {
    return { ...looks({}), width: { default: null, rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="block"]', getAttrs: (el) => ({ ...parseLooks(el), width: el.dataset.width || null }) }];
  },
  renderHTML({ node }) {
    const a = node.attrs;
    const attrs = { 'data-type': 'block', class: 'hn-block' };
    const style = [];
    looksAttrs(a, attrs, style);
    if (a.width) { attrs['data-width'] = a.width; style.push(`width: ${a.width}`, `flex: 0 0 ${a.width}`); }
    if (style.length) attrs.style = style.join('; ');
    return ['div', attrs, 0];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'hn-block';
      const grip = grabbable(document.createElement('span'));
      grip.className = 'hn-block-grip';
      grip.title = 'Тяните, чтобы перенести блок (за пределы листа — станет отдельным листом)';
      grip.textContent = '⠿';
      const content = document.createElement('div');
      content.className = 'hn-block-content';
      const hr = handle('r', 'Ширина (двойной щелчок — во всю ширину)');
      const hb = handle('b', 'Высота (двойной щелчок — бесконечная)');
      dom.append(grip, content, hr, hb);

      let cur = node;
      const apply = (n) => {
        cur = n;
        const a = n.attrs;
        dom.style.background = a.bg || '';
        dom.style.color = a.fg || '';
        dom.style.height = a.height ? `${a.height}px` : '';
        dom.style.width = a.width || '';
        dom.style.flex = a.width ? `0 0 ${a.width}` : '';
        dom.dataset.border = a.border;
        dom.dataset.pad = a.pad;
        content.classList.toggle('fixed', !!a.height);
      };
      apply(node);

      hr.addEventListener('pointerdown', (e) => {
        const parentW = dom.parentElement.clientWidth || 1;
        const w0 = dom.offsetWidth;
        let pct = null;
        dragNode(e, editor, getPos, dom, (d, n, dx) => {
          pct = `${Math.max(10, Math.min(100, Math.round(((w0 + dx) / parentW) * 100)))}%`;
          d.style.width = pct;
          d.style.flex = `0 0 ${pct}`;
        }, () => (pct ? { width: pct === '100%' ? null : pct } : null));
      });
      hb.addEventListener('pointerdown', (e) => {
        const h0 = dom.offsetHeight;
        let h = null;
        content.classList.add('fixed');
        dragNode(e, editor, getPos, dom, (d, n, dx, dy) => {
          h = Math.max(60, h0 + dy);
          d.style.height = `${h}px`;
        }, () => {
          if (h) return { height: snap(h) };
          content.classList.toggle('fixed', !!cur.attrs.height); // щелчок без движения — как было
          return null;
        });
      });
      hr.addEventListener('dblclick', () => setAttrs(editor, getPos, { width: null }, 'hnBlock'));
      hb.addEventListener('dblclick', () => setAttrs(editor, getPos, { height: null }, 'hnBlock'));
      grip.addEventListener('pointerdown', (e) => moveBlock(e, editor, getPos(), dom));
      // Блок можно тащить и за его поля (рамку и отступы), не только за ручку.
      dom.addEventListener('pointerdown', (e) => {
        if (e.target === dom && e.button === 0) moveBlock(e, editor, getPos(), dom);
      });
      dom.addEventListener('mousedown', (e) => { if (e.target === dom) e.preventDefault(); });

      return {
        dom,
        contentDOM: content,
        update: (n) => {
          if (n.type.name !== 'hnBlock') return false;
          apply(n);
          return true;
        },
        stopEvent: (e) => e.target === grip || e.target === dom || e.target.classList?.contains('hn-handle'),
        ignoreMutation: (m) => ignoreOwnMutation(m, content),
      };
    };
  },
  addCommands() {
    return {
      insertBlock: (attrs = {}) => ({ commands }) => commands.insertContent({ type: this.name, attrs, content: [{ type: 'paragraph' }] }),
      insertRow: (count = 2, attrs = {}) => ({ commands }) => commands.insertContent({
        type: 'hnRow',
        content: Array.from({ length: count }, () => ({ type: this.name, attrs, content: [{ type: 'paragraph' }] })),
      }),
    };
  },
});

/** Ряд — блоки рядом. Ширину каждого можно задать, остальные делят остаток поровну. */
export const HnRow = Node.create({
  name: 'hnRow',
  group: 'block',
  content: 'hnBlock+',
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="row"]' }];
  },
  renderHTML() {
    return ['div', { 'data-type': 'row', class: 'hn-row' }, 0];
  },
});

// ---------- Перенос блока ----------
const CONTAINERS = new Set(['hnFrame', 'hnBlock', 'spoilerContent', 'blockquote', 'hnRow']);

/** Где окажется блок, если отпустить его в точке (x, y): позиция вставки и линия-подсказка, либо «на холст». */
function dropTarget(view, x, y, fromPos, size) {
  const over = document.elementFromPoint(x, y);
  if (!over?.closest('.hn-frame')) {
    return over?.closest('.ProseMirror') ? { canvas: true } : null;
  }
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  // Над полями листа posAtCoords указывает на сам лист — тогда берём ближайшую позицию внутри него.
  const tries = hit.inside >= 0 ? [hit.inside, hit.pos] : [hit.pos];
  for (const p of tries) {
    const found = dropInside(view, view.state.doc.resolve(p), x, y, fromPos, size);
    if (found) return found;
  }
  return null;
}

function dropInside(view, $p, x, y, fromPos, size) {
  for (let d = $p.depth; d >= 1; d--) {
    const container = $p.node(d);
    if (!CONTAINERS.has(container.type.name)) continue;
    const index = Math.min($p.index(d), container.childCount - 1);
    const childPos = $p.posAtIndex(index, d);
    const child = container.child(index);
    const dom = view.nodeDOM(childPos);
    if (!dom?.getBoundingClientRect) continue;
    const r = dom.getBoundingClientRect();
    const horizontal = container.type.name === 'hnRow';
    const before = horizontal ? x < r.left + r.width / 2 : y < r.top + r.height / 2;
    const at = before ? childPos : childPos + child.nodeSize;
    if (at > fromPos && at < fromPos + size) return null; // внутрь самого себя нельзя
    if (horizontal && view.state.doc.nodeAt(fromPos)?.type.name !== 'hnBlock') continue;
    const line = horizontal
      ? { left: before ? r.left - 3 : r.right + 1, top: r.top, width: 3, height: r.height }
      : { left: r.left, top: before ? r.top - 3 : r.bottom + 1, width: r.width, height: 3 };
    return { at, line };
  }
  return null;
}

/** Удаляет узел; если родитель остался бы пустым, оставляет в нём пустой абзац. */
function removeNode(tr, pos) {
  const $pos = tr.doc.resolve(pos);
  const node = tr.doc.nodeAt(pos);
  const parent = $pos.parent;
  if (parent.childCount > 1) return tr.delete(pos, pos + node.nodeSize);
  if (parent.type.name === 'hnRow') return removeNode(tr, $pos.before());
  return tr.replaceWith(pos, pos + node.nodeSize, tr.doc.type.schema.nodes.paragraph.create());
}

function moveBlock(e, editor, from, dom) {
  const view = editor.view;
  const startNode = view.state.doc.nodeAt(from);
  if (startNode?.type.name !== 'hnBlock') return;
  const width = dom.offsetWidth;
  const live = () => { const d = view.nodeDOM(from); return d && d.nodeType === 1 ? d : dom; };
  const indicator = document.createElement('div');
  indicator.className = 'hn-drop-line';
  const ghost = document.createElement('div');
  ghost.className = 'hn-drop-ghost';
  ghost.textContent = 'Блок';
  let target = null;
  dragPointer(e, (dx, dy, ev) => {
    if (!ghost.isConnected) { document.body.append(indicator, ghost); live().classList.add('hn-moving'); }
    ghost.style.left = `${ev.clientX + 12}px`;
    ghost.style.top = `${ev.clientY + 12}px`;
    target = dropTarget(view, ev.clientX, ev.clientY, from, startNode.nodeSize);
    ghost.textContent = target?.canvas ? 'Отдельный лист на холсте' : 'Блок';
    if (target?.line) {
      Object.assign(indicator.style, { display: 'block', left: `${target.line.left}px`, top: `${target.line.top}px`, width: `${target.line.width}px`, height: `${target.line.height}px` });
    } else {
      indicator.style.display = 'none';
    }
  }, (dx, dy, ev) => {
    indicator.remove();
    ghost.remove();
    live().classList.remove('hn-moving');
    if (!target) return;
    const node = view.state.doc.nodeAt(from);
    if (node !== startNode) return;
    const tr = view.state.tr;
    if (target.canvas) {
      // Блок, вынесенный за лист, становится отдельным листом там, где его отпустили.
      const surface = view.dom.getBoundingClientRect();
      const frame = view.state.schema.nodes.hnFrame.create({
        ...node.attrs, x: snap(Math.max(0, ev.clientX - surface.left - 20)), y: snap(Math.max(0, ev.clientY - surface.top - 12)),
        w: Math.max(200, Math.round(width)), pad: node.attrs.pad === 'none' ? 's' : node.attrs.pad,
      }, node.content);
      removeNode(tr, from);
      tr.insert(tr.doc.content.size, frame);
    } else {
      tr.insert(target.at, node);
      removeNode(tr, tr.mapping.map(from, target.at <= from ? 1 : -1));
    }
    view.dispatch(tr.scrollIntoView());
  });
}

/** Подгоняет размер холста под листы и создаёт лист двойным щелчком по пустому месту. */
export const CanvasSurface = Extension.create({
  name: 'canvasSurface',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      view: (view) => {
        const fit = () => {
          let right = 0;
          let bottom = 0;
          for (const f of view.dom.children) {
            if (!f.classList.contains('hn-frame')) continue;
            right = Math.max(right, f.offsetLeft + f.offsetWidth);
            bottom = Math.max(bottom, f.offsetTop + f.offsetHeight);
          }
          // Холст не уже видимой области: тогда он не сдвигается, когда лист уезжает вправо.
          view.dom.style.width = `${Math.max(right + 40, view.dom.parentElement?.clientWidth || 0)}px`;
          view.dom.style.minHeight = `${bottom + 200}px`;
        };
        const ro = new ResizeObserver(fit);
        const observeAll = () => { ro.disconnect(); for (const f of view.dom.children) ro.observe(f); fit(); };
        const dbl = (e) => {
          if (e.target !== view.dom) return;
          const r = view.dom.getBoundingClientRect();
          editor.commands.insertFrame({ x: e.clientX - r.left, y: e.clientY - r.top });
        };
        view.dom.addEventListener('dblclick', dbl);
        observeAll();
        return { update: observeAll, destroy: () => { ro.disconnect(); view.dom.removeEventListener('dblclick', dbl); } };
      },
    })];
  },
});
