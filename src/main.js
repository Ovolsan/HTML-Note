// Точка входа HTML Note: собирает редактор, панели и работу с файлами.
import docCss from './styles/doc.css?raw';
import './styles/app.css';
import { createEditor } from './editor.js';
import { buildTools, editLink } from './toolbar.js';
import { setupLayout } from './layout.js';
import { setupContextBar } from './ctxbar.js';
import { setupSidebar } from './sidebar.js';
import { buildHtml, parseHtml, DEFAULT_SETTINGS } from './document.js';
import { el, toolButton, toast, choiceDialog } from './ui.js';
import * as platform from './platform.js';
import { loadCustomEmoji, preloadEmojiPicker } from './emoji.js';
import { getDefaults } from './defaults.js';
import { setupTitlebar } from './titlebar.js';
import { checkForUpdates, versionLabel, APP_VERSION } from './updater.js';

document.head.append(el('style', {}, docCss));
setupTitlebar(document.querySelector('.filebar'));
// Пальцем или мышью: от этого зависят размер и видимость ручек листов и блоков.
document.body.classList.toggle('hn-touch', matchMedia('(pointer: coarse)').matches);
document.addEventListener('pointerdown', (e) => document.body.classList.toggle('hn-touch', e.pointerType === 'touch'), true);

const state = { path: null, name: null, dirty: false, foreign: false, settings: { ...DEFAULT_SETTINGS } };
const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const sheet = $('editor');

let refreshToolbar = () => {};
let refreshCtx = () => {};
let sidebar = { refresh() {}, refreshSelection() {} };
const refreshSidebar = () => sidebar.refresh();
let suppressDirty = false;

const editor = createEditor(sheet, {
  onChange: () => {
    if (!suppressDirty) setDirty(true);
    sidebar.refresh();
  },
  onSelection: () => {
    refreshToolbar();
    refreshCtx();
    sidebar.refreshSelection();
  },
});

const { tools, refresh: refreshTools } = buildTools(editor);
refreshToolbar = refreshTools;
const fileTool = (id, opts) => {
  const b = toolButton(opts);
  b.dataset.tool = id;
  tools.set(id, b);
};
fileTool('new', { iconName: 'FilePlus', label: 'Новый документ', short: 'Новый', shortcut: 'Ctrl+N', onClick: () => newDocument() });
fileTool('open', { iconName: 'FolderOpen', label: 'Открыть', short: 'Открыть', shortcut: 'Ctrl+O', onClick: () => openDocument() });
fileTool('save', { iconName: 'Save', label: 'Сохранить', short: 'Сохранить', shortcut: 'Ctrl+S', onClick: () => saveDocument() });
fileTool('saveAs', { iconName: 'SaveAll', label: 'Сохранить как', short: 'Сохранить как', shortcut: 'Ctrl+Shift+S', onClick: () => saveDocument({ forceDialog: true }) });
fileTool('browser', { iconName: 'Globe', label: 'Открыть в браузере', text: 'В браузере', onClick: () => openInBrowser() });
fileTool('update', { iconName: 'RefreshCw', label: `Проверить обновления (версия ${versionLabel(APP_VERSION)})`, short: 'Обновления', onClick: () => checkForUpdates({ manual: true }) });

refreshCtx = setupContextBar($('ctxbar'), editor, canvas);
sidebar = setupSidebar($('sidebar'), editor, {
  getSettings: () => state.settings,
  setSettings: (patch) => {
    state.settings = { ...state.settings, ...patch };
    applySettings();
    setDirty(true);
  },
});
const layout = setupLayout(tools, {
  file: $('file-zone'), top: $('toolbar'), side: sidebar.toolZone, bottom: $('toolbar-bottom'), right: $('rightbar'), hidden: sidebar.hiddenZone,
});
sidebar.onLayoutEdit((on) => layout.setEditing(on), () => layout.reset());

function documentTitle() {
  let h1 = null;
  editor.state.doc.descendants((n) => {
    if (!h1 && n.type.name === 'heading' && n.textContent.trim()) h1 = n;
    return !h1;
  });
  return h1?.textContent.trim() || (state.name ? state.name.replace(/\.html?$/i, '') : 'Документ');
}

function suggestedFileName() {
  const base = (state.name && !state.foreign ? state.name.replace(/\.html?$/i, '') : documentTitle())
    .replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Документ';
  return `${state.foreign ? `${base} (HTML Note)` : base}.html`;
}

function setDirty(v) {
  state.dirty = v;
  const name = state.name || 'Новый документ';
  $('doc-name').textContent = `${v ? '● ' : ''}${name}${state.foreign ? ' — открыт для просмотра и правки, сохранится в новый файл' : ''}`;
  platform.setWindowTitle(`${v ? '● ' : ''}${name} — HTML Note`);
}

function applySettings() {
  document.body.classList.toggle('toc-off', !state.settings.toc);
  sheet.classList.toggle('wide', state.settings.width === 'wide');
  refreshSidebar();
}

function loadContent({ html, settings, name, path, foreign }) {
  suppressDirty = true;
  editor.commands.setContent(html || '', false);
  // Новый документ или файл без листов: единственный лист ставим посередине видимой области,
  // с запомненными рамкой и отступами.
  if (!/data-type="frame"/.test(html || '')) {
    const first = editor.state.doc.firstChild;
    const x = Math.max(0, Math.round((canvas.clientWidth - first.attrs.w) / 2 / 4) * 4);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, null, { ...first.attrs, ...getDefaults('frame'), x }).setMeta('addToHistory', false));
  }
  suppressDirty = false;
  editor.commands.focus('start');
  Object.assign(state, { path, name, foreign, settings: { ...DEFAULT_SETTINGS, ...settings } });
  platform.forgetBrowserHandle();
  applySettings();
  setDirty(false);
  canvas.scrollTop = 0;
}

async function confirmDiscard() {
  if (!state.dirty) return true;
  const v = await choiceDialog({
    title: 'Есть несохранённые изменения',
    text: `Сохранить изменения в «${state.name || 'Новый документ'}»?`,
    buttons: [{ label: 'Отмена', value: 'cancel' }, { label: 'Не сохранять', value: 'discard' }, { label: 'Сохранить', value: 'save', primary: true }],
  });
  if (v === 'save') return saveDocument();
  return v === 'discard';
}

async function newDocument() {
  if (!(await confirmDiscard())) return;
  loadContent({ html: '', settings: {}, name: null, path: null, foreign: false });
}

function openParsed(file) {
  const parsed = parseHtml(file.text);
  loadContent({ html: parsed.html, settings: parsed.settings, name: file.name, path: file.path, foreign: !parsed.native });
  if (!parsed.native) {
    toast('Файл создан не в HTML Note: часть оформления могла не перенестись. Оригинал не тронут — «Сохранить» создаст новый файл.', 'warn', 8000);
  }
}

async function openDocument() {
  if (!(await confirmDiscard())) return;
  try {
    const file = await platform.openFile();
    if (file) openParsed(file);
  } catch (e) {
    toast(`Не удалось открыть файл: ${e}`, 'error', 8000);
  }
}

async function saveDocument({ forceDialog = false } = {}) {
  try {
    const text = buildHtml({ html: editor.getHTML(), settings: state.settings, title: documentTitle() });
    // Чужой HTML никогда не перезаписывается: сохраняем в новый файл.
    const saved = await platform.saveFile({
      path: state.foreign ? null : state.path,
      suggestedName: suggestedFileName(),
      text,
      forceDialog: forceDialog || state.foreign,
    });
    if (!saved) return false;
    Object.assign(state, { path: saved.path, name: saved.name, foreign: false });
    setDirty(false);
    toast(`Сохранено: ${saved.name}`, 'ok', 2500);
    return true;
  } catch (e) {
    toast(`Не удалось сохранить: ${e}`, 'error', 8000);
    return false;
  }
}

async function openInBrowser() {
  try {
    const text = buildHtml({ html: editor.getHTML(), settings: state.settings, title: documentTitle() });
    await platform.openInBrowser({ path: state.dirty || state.foreign ? null : state.path, text });
  } catch (e) {
    toast(`Не удалось открыть в браузере: ${e}`, 'error', 8000);
  }
}

window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const actions = {
    s: () => saveDocument({ forceDialog: e.shiftKey }),
    ы: () => saveDocument({ forceDialog: e.shiftKey }),
    o: () => openDocument(),
    щ: () => openDocument(),
    n: () => newDocument(),
    т: () => newDocument(),
    k: () => editLink(editor),
    л: () => editLink(editor),
  };
  if (actions[k]) {
    e.preventDefault();
    actions[k]();
  }
}, true);

platform.onCloseRequested({ canClose: confirmDiscard, isDirty: () => state.dirty });

// Ссылки внутри редактора не открываются по щелчку — для этого есть «Открыть в браузере».
sheet.addEventListener('click', (e) => {
  if (e.target.closest('a')) e.preventDefault();
});

(async () => {
  loadContent({ html: '', settings: {}, name: null, path: null, foreign: false });
  loadCustomEmoji()
    .catch((e) => toast(`Не удалось загрузить свои эмодзи: ${e}`, 'error', 6000))
    .finally(preloadEmojiPicker);
  try {
    const file = await platform.initialFile();
    if (file) openParsed(file);
  } catch (e) {
    toast(`Не удалось открыть файл: ${e}`, 'error', 8000);
  }
  // Проверка обновлений при запуске — не чаще раза в сутки, без шума при ошибке.
  setTimeout(() => checkForUpdates(), 3000);
})();

window.hnEditor = editor;
