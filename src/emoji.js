// Эмодзи: стандартные Unicode и пользовательские наборы (картинки), как в Telegram и Discord.
import { Node, InputRule } from '@tiptap/core';
import groups from 'unicode-emoji-json/data-by-group.json';
import { el, icon, popover, closePopover, formDialog, choiceDialog, toast } from './ui.js';

const GROUP_RU = {
  smileys_emotion: ['Смайлы', '😀'], people_body: ['Люди', '👋'], animals_nature: ['Природа', '🐱'],
  food_drink: ['Еда', '🍕'], travel_places: ['Места', '✈️'], activities: ['Занятия', '⚽'],
  objects: ['Предметы', '💡'], symbols: ['Символы', '❤️'], flags: ['Флаги', '🏁'],
};
const unicodeBySlug = new Map();
for (const g of groups) for (const e of g.emojis) unicodeBySlug.set(e.slug, e.emoji);

// ---------- Хранилище пользовательских эмодзи (IndexedDB, переживает перезапуск программы) ----------
const DB_NAME = 'html-note';
const STORE = 'emoji';
let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

/** Кэш пользовательских эмодзи в памяти: нужен для мгновенной замены :имя: при наборе. */
let custom = [];
export async function loadCustomEmoji() {
  custom = (await tx('readonly', (s) => s.getAll())) || [];
  custom.sort((a, b) => a.pack.localeCompare(b.pack) || a.added - b.added);
  return custom;
}
const customByName = (name) => custom.find((e) => e.name === name);

function normalizeName(raw) {
  return raw.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'emoji';
}
function uniqueName(base) {
  let name = base;
  for (let i = 2; customByName(name) || unicodeBySlug.has(name); i++) name = `${base}_${i}`;
  return name;
}

/** Картинка эмодзи уменьшается до 128 px, чтобы документ не раздувался. GIF сохраняется как есть, чтобы не пропала анимация. */
async function prepareImage(file) {
  if (file.type === 'image/gif') {
    if (file.size > 1024 * 1024) throw new Error(`«${file.name}» больше 1 МБ`);
    return readDataUrl(file);
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.9);
}
function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function addCustomEmoji() {
  const packs = [...new Set(custom.map((e) => e.pack))];
  const v = await formDialog({
    title: 'Добавить свои эмодзи',
    fields: [
      { name: 'files', label: 'Картинки (можно выбрать сразу несколько)', type: 'file', accept: 'image/png,image/gif,image/webp,image/jpeg', multiple: true,
        hint: 'PNG, GIF (анимация сохранится), WebP или JPG. Имя эмодзи берётся из имени файла.' },
      { name: 'name', label: 'Имя (если картинка одна)', placeholder: 'например, kotik', hint: 'Набрав :имя: в тексте, вы вставите этот эмодзи.' },
      { name: 'pack', label: 'Набор', value: packs[0] || 'Мои', suggestions: packs },
    ],
    okText: 'Добавить',
  });
  if (!v || !v.files?.length) return 0;
  let added = 0;
  for (const file of v.files) {
    try {
      const src = await prepareImage(file);
      const name = uniqueName(normalizeName(v.files.length === 1 && v.name ? v.name : file.name));
      const item = { id: crypto.randomUUID(), name, pack: v.pack || 'Мои', src, added: Date.now() };
      await tx('readwrite', (s) => s.put(item));
      custom.push(item);
      added++;
    } catch (e) {
      toast(`Не удалось добавить ${file.name}: ${e.message || e}`, 'error', 6000);
    }
  }
  if (added) toast(`Добавлено эмодзи: ${added}`, 'ok', 2500);
  return added;
}

async function deleteCustomEmoji(item) {
  const v = await choiceDialog({
    title: 'Удалить эмодзи?',
    text: `:${item.name}: будет убран из набора «${item.pack}». В уже сохранённых документах он останется.`,
    buttons: [{ label: 'Отмена', value: 'no' }, { label: 'Удалить', value: 'yes', primary: true }],
  });
  if (v !== 'yes') return false;
  await tx('readwrite', (s) => s.delete(item.id));
  custom = custom.filter((e) => e.id !== item.id);
  return true;
}

// ---------- Недавние ----------
const RECENT_KEY = 'hn-recent-emoji';
function recent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(entry) {
  const key = entry.char || `c:${entry.id}`;
  const list = [entry, ...recent().filter((e) => (e.char || `c:${e.id}`) !== key)].slice(0, 24);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* хранилище недоступно — просто без истории */ }
}

// ---------- Узел документа ----------
export const HnEmoji = Node.create({
  name: 'hnEmoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { src: { default: null, rendered: false }, name: { default: 'emoji', rendered: false } };
  },
  parseHTML() {
    return [{
      tag: 'img.hn-emoji',
      priority: 100,
      getAttrs: (img) => ({ src: img.getAttribute('src'), name: (img.getAttribute('alt') || ':emoji:').replace(/^:|:$/g, '') }),
    }];
  },
  renderHTML({ node }) {
    const label = `:${node.attrs.name}:`;
    return ['img', { class: 'hn-emoji', src: node.attrs.src, alt: label, title: label, draggable: 'false' }];
  },
  addInputRules() {
    // Как в Discord: набрали :имя: — подставился эмодзи (свой или стандартный по английскому имени).
    return [new InputRule({
      find: /:([\p{L}\p{N}_]{2,32}):$/u,
      handler: ({ state, range, match }) => {
        const name = match[1].toLowerCase();
        const own = customByName(name);
        if (own) {
          state.tr.replaceWith(range.from, range.to, state.schema.nodes.hnEmoji.create({ src: own.src, name: own.name }));
          return undefined;
        }
        const ch = unicodeBySlug.get(name);
        if (ch) {
          state.tr.insertText(ch, range.from, range.to);
          return undefined;
        }
        return null;
      },
    })];
  },
});

// ---------- Меню эмодзи ----------
// Меню строится один раз и потом только показывается. Стандартные разделы (около 1900 значков) рисуются
// по мере прокрутки: раньше все значки создавались сразу, и первое открытие занимало пару секунд.
const CELL_H = 38;
const COLS = 9;
let picker = null;

function buildPicker() {
  const state = { editor: null, manage: false, query: '' };
  const insertUnicode = (ch) => {
    state.editor.chain().focus().insertContent(ch).run();
    pushRecent({ char: ch });
  };
  const insertCustom = (item) => {
    state.editor.chain().focus().insertContent({ type: 'hnEmoji', attrs: { src: item.src, name: item.name } }).run();
    pushRecent({ id: item.id });
  };

  const preview = el('div', { class: 'emoji-preview' }, 'Наведите на эмодзи, чтобы увидеть имя');
  // Один обработчик на всё меню вместо тысяч отдельных.
  const actions = new Map();
  let nextId = 0;
  const cell = (content, title, onClick, onDelete) => {
    const id = String(nextId++);
    actions.set(id, { title, onClick, onDelete });
    const b = el('button', { class: 'emoji-cell', type: 'button', title, dataset: { a: id } }, content);
    if (state.manage && onDelete) b.classList.add('deletable');
    return b;
  };
  const customCell = (item) => cell(el('img', { src: item.src, alt: item.name, draggable: 'false', loading: 'lazy' }), `:${item.name}:`,
    () => insertCustom(item), async () => { if (await deleteCustomEmoji(item)) renderDynamic(); });
  const section = (id, title, content) => el('section', { class: 'emoji-section', dataset: { id } }, el('h4', {}, title), content);

  const search = el('input', { class: 'emoji-search', type: 'search', placeholder: 'Поиск: имя своего эмодзи или по-английски (cat, heart…)',
    onInput: (e) => { state.query = e.target.value.trim().toLowerCase(); renderSearch(); } });
  const tabs = el('div', { class: 'emoji-tabs' });
  const dynamic = el('div');
  const results = el('div', { hidden: true });
  const body = el('div', { class: 'emoji-body' }, dynamic, results);

  body.addEventListener('mousedown', (e) => { if (e.target.closest('.emoji-cell')) e.preventDefault(); });
  body.addEventListener('mouseover', (e) => {
    const a = actions.get(e.target.closest('.emoji-cell')?.dataset.a);
    if (a) preview.textContent = a.title;
  });
  body.addEventListener('click', (e) => {
    const a = actions.get(e.target.closest('.emoji-cell')?.dataset.a);
    if (!a) return;
    if (state.manage && a.onDelete) a.onDelete();
    else a.onClick();
  });

  // Стандартные разделы: пустые заглушки нужной высоты, значки появляются при подлёте к видимой области.
  // Проверка по положению прокрутки, а не IntersectionObserver: тот не срабатывает, пока окно не перерисовывается.
  const fill = new Map();
  const fillVisible = () => {
    const limit = body.scrollTop + body.clientHeight + 400;
    for (const [grid, f] of fill) {
      if (grid.offsetTop < limit) { f(); fill.delete(grid); }
    }
  };
  body.addEventListener('scroll', fillVisible, { passive: true });
  const staticSections = groups.map((g) => {
    const [title] = GROUP_RU[g.slug] || [g.name];
    const grid = el('div', { class: 'emoji-grid', style: `min-height:${Math.ceil(g.emojis.length / COLS) * CELL_H}px` });
    fill.set(grid, () => {
      grid.append(...g.emojis.map((e) => cell(e.emoji, `:${e.slug}:`, () => insertUnicode(e.emoji))));
      grid.style.minHeight = '';
    });
    return section(g.slug, title, grid);
  });
  const staticBox = el('div', {}, staticSections);
  dynamic.after(staticBox);

  function renderDynamic() {
    const packs = [...new Set(custom.map((e) => e.pack))];
    const parts = [];
    const rec = recent().map((r) => {
      if (r.char) return cell(r.char, r.char, () => insertUnicode(r.char));
      const item = custom.find((e) => e.id === r.id);
      return item ? customCell(item) : null;
    }).filter(Boolean);
    if (rec.length) parts.push(section('recent', 'Недавние', el('div', { class: 'emoji-grid' }, rec)));
    for (const p of packs) parts.push(section(`pack:${p}`, p, el('div', { class: 'emoji-grid' }, custom.filter((e) => e.pack === p).map(customCell))));
    if (!packs.length) parts.push(el('div', { class: 'emoji-empty' }, 'Своих эмодзи пока нет. Нажмите «+ Свои» и выберите картинки — можно сразу несколько.'));
    dynamic.replaceChildren(...parts);

    const tabItems = [];
    if (rec.length) tabItems.push(['recent', icon('Clock', 16), 'Недавние']);
    for (const p of packs) tabItems.push([`pack:${p}`, el('img', { src: custom.find((e) => e.pack === p).src, alt: '' }), p]);
    for (const g of groups) {
      const [title, sym] = GROUP_RU[g.slug] || [g.name, g.emojis[0].emoji];
      tabItems.push([g.slug, sym, title]);
    }
    tabs.replaceChildren(...tabItems.map(([id, content, title]) => el('button', { class: 'emoji-tab', type: 'button', title,
      onMousedown: (e) => e.preventDefault(),
      onClick: () => {
        if (state.query) { search.value = ''; state.query = ''; renderSearch(); }
        body.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' });
        fillVisible();
      } }, content)));
  }

  function renderSearch() {
    const q = state.query;
    dynamic.hidden = !!q;
    staticBox.hidden = !!q;
    results.hidden = !q;
    if (!q) return;
    const own = custom.filter((e) => e.name.includes(q) || e.pack.toLowerCase().includes(q));
    const uni = [];
    for (const g of groups) for (const e of g.emojis) if (uni.length < 240 && (e.name.includes(q) || e.slug.includes(q))) uni.push(e);
    const parts = [];
    if (own.length) parts.push(section('own', 'Свои', el('div', { class: 'emoji-grid' }, own.map(customCell))));
    if (uni.length) parts.push(section('uni', 'Стандартные', el('div', { class: 'emoji-grid' }, uni.map((e) => cell(e.emoji, `:${e.slug}:`, () => insertUnicode(e.emoji))))));
    if (!parts.length) parts.push(el('div', { class: 'emoji-empty' }, 'Ничего не найдено'));
    results.replaceChildren(...parts);
    body.scrollTop = 0;
  }

  const manageBtn = el('button', { class: 'btn small', type: 'button', onClick: () => {
    state.manage = !state.manage;
    manageBtn.classList.toggle('primary', state.manage);
    renderDynamic();
    renderSearch();
  } }, 'Управлять');
  const root = el('div', { class: 'emoji-picker' }, search, tabs, body,
    el('div', { class: 'emoji-footer' }, preview,
      el('button', { class: 'btn small', type: 'button', onClick: async () => {
        closePopover();
        if (await addCustomEmoji()) openEmojiPicker(state.anchor, state.editor);
      } }, icon('Plus', 14), ' Свои'),
      manageBtn));

  return {
    root,
    open(anchor, editor) {
      Object.assign(state, { anchor, editor, query: '' });
      search.value = '';
      renderDynamic();
      renderSearch();
      popover(anchor, root);
      body.scrollTop = 0;
      fillVisible();
      search.focus();
    },
  };
}

export function openEmojiPicker(anchor, editor) {
  picker ??= buildPicker();
  picker.open(anchor, editor);
}

/** Готовит меню заранее, пока программа простаивает, чтобы первое открытие было мгновенным. */
export function preloadEmojiPicker() {
  const run = () => { picker ??= buildPicker(); };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1000);
}
