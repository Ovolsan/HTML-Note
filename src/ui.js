// Небольшие элементы интерфейса: значки, всплывающие окна, диалоги и уведомления.
import {
  createElement, Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Baseline, Highlighter, Link, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, ListTodo, Quote, CodeXml, Image, Clapperboard, Table, MousePointerClick,
  ChevronsDownUp, Minus, RemoveFormatting, Type, Replace, Trash2, Pencil, BetweenHorizontalEnd, BetweenVerticalEnd, Rows3,
  Columns3, Heading, TableCellsMerge, FilePlus, FolderOpen, Save, SaveAll, Globe, PanelLeft, Smile, Clock, Plus, Settings2,
} from 'lucide';

// Только используемые значки, чтобы не тащить в программу всю библиотеку.
const icons = {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Baseline, Highlighter, Link, AlignLeft, AlignCenter, AlignRight,
  AlignJustify, List, ListOrdered, ListTodo, Quote, CodeXml, Image, Clapperboard, Table, MousePointerClick, ChevronsDownUp,
  Minus, RemoveFormatting, Type, Replace, Trash2, Pencil, BetweenHorizontalEnd, BetweenVerticalEnd, Rows3, Columns3, Heading,
  TableCellsMerge, FilePlus, FolderOpen, Save, SaveAll, Globe, PanelLeft, Smile, Clock, Plus, Settings2,
};

export function icon(name, size = 18) {
  const def = icons[name];
  if (!def) {
    const span = document.createElement('span');
    span.textContent = name.slice(0, 2);
    return span;
  }
  const svg = createElement(def);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  return svg;
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

/** Кнопка панели инструментов со значком и всплывающей подсказкой. */
/** short — подпись, которая видна, когда кнопка стоит на левой панели. */
export function toolButton({ iconName, label, shortcut, onClick, text, short }) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  const btn = el('button', { class: 'tbtn', type: 'button', title, 'aria-label': label, onMousedown: (e) => e.preventDefault(), onClick });
  btn.append(iconName ? icon(iconName) : text);
  if (iconName && text) btn.append(el('span', { class: 'tbtn-text' }, text));
  if (short && !text) btn.append(el('span', { class: 'tbtn-label' }, short));
  return btn;
}

let openPopover = null;
export function closePopover() {
  openPopover?.remove();
  openPopover = null;
}
/** Показывает всплывающую панель под элементом anchor. */
export function popover(anchor, content) {
  closePopover();
  const box = el('div', { class: 'popover' }, content);
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(r.left, window.innerWidth - box.offsetWidth - 8);
  box.style.left = `${Math.max(8, left)}px`;
  box.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - box.offsetHeight - 8))}px`;
  openPopover = box;
  setTimeout(() => {
    const onDown = (e) => {
      if (e.target.closest?.('dialog')) return; // диалог поверх панели не должен её закрывать
      if (!box.contains(e.target) && !anchor.contains(e.target)) {
        if (openPopover === box) closePopover();
        document.removeEventListener('mousedown', onDown, true);
      }
    };
    document.addEventListener('mousedown', onDown, true);
  });
  return box;
}

/**
 * Модальная форма. fields: [{ name, label, type: text|url|select|file|radio, value, options, placeholder, accept, hint }].
 * Возвращает объект значений или null, если окно закрыли.
 */
export function formDialog({ title, fields, okText = 'Готово', cancelText = 'Отмена' }) {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'hn-dialog' });
    const form = el('form', { method: 'dialog' });
    form.append(el('h3', {}, title));
    const inputs = {};
    for (const f of fields) {
      const row = el('label', { class: 'field' }, el('span', { class: 'field-label' }, f.label));
      let input;
      if (f.type === 'select' || f.type === 'radio') {
        input = el('select', { name: f.name }, f.options.map((o) => el('option', { value: o.value, selected: o.value === f.value }, o.label)));
      } else if (f.type === 'file') {
        input = el('input', { type: 'file', name: f.name, accept: f.accept || '', multiple: !!f.multiple });
      } else {
        input = el('input', { type: f.type || 'text', name: f.name, value: f.value ?? '', placeholder: f.placeholder || '' });
        if (f.suggestions?.length) {
          // Подсказки из уже существующих значений (например, названий наборов эмодзи).
          const listId = `dl-${f.name}-${Date.now()}`;
          input.setAttribute('list', listId);
          row.append(el('datalist', { id: listId }, f.suggestions.map((s) => el('option', { value: s }))));
        }
      }
      inputs[f.name] = input;
      row.append(input);
      if (f.hint) row.append(el('span', { class: 'field-hint' }, f.hint));
      form.append(row);
    }
    const actions = el('div', { class: 'dialog-actions' },
      el('button', { type: 'button', class: 'btn', onClick: () => dlg.close('cancel') }, cancelText),
      el('button', { type: 'submit', class: 'btn primary', value: 'ok' }, okText));
    form.append(actions);
    dlg.append(form);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'ok';
      const values = {};
      for (const [name, input] of Object.entries(inputs)) {
        if (input.type === 'file') values[name] = input.multiple ? [...(input.files || [])] : input.files?.[0] || null;
        else values[name] = input.value.trim();
      }
      dlg.remove();
      resolve(ok ? values : null);
    });
    dlg.showModal();
    const first = Object.values(inputs)[0];
    first?.focus();
    first?.select?.();
  });
}

/** Простое окно с вопросом и кнопками; возвращает value нажатой кнопки или null. */
export function choiceDialog({ title, text, buttons }) {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'hn-dialog' });
    const form = el('form', { method: 'dialog' },
      el('h3', {}, title),
      text ? el('p', { class: 'dialog-text' }, text) : null,
      el('div', { class: 'dialog-actions' }, buttons.map((b) => el('button', { type: 'submit', class: `btn ${b.primary ? 'primary' : ''}`, value: b.value }, b.label))));
    dlg.append(form);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue || null;
      dlg.remove();
      resolve(v);
    });
    dlg.showModal();
  });
}

export function toast(message, kind = 'info', ms = 4000) {
  const box = document.getElementById('toasts');
  const t = el('div', { class: `toast ${kind}` }, message);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function formatBytes(n) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}
