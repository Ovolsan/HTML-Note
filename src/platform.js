// Работа с файлами и окном. В программе (Tauri) — через Rust, в обычном браузере — через стандартные средства.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog, ask } from '@tauri-apps/plugin-dialog';

export const isDesktop = '__TAURI_INTERNALS__' in window;
const HTML_FILTER = [{ name: 'HTML-документ', extensions: ['html', 'htm'] }];

const baseName = (path) => path.split(/[\\/]/).pop();

/** Открыть файл. Возвращает { path, name, text } или null. */
export async function openFile() {
  if (isDesktop) {
    const path = await openDialog({ multiple: false, directory: false, filters: HTML_FILTER });
    if (!path) return null;
    return { path, name: baseName(path), text: await invoke('read_file', { path }) };
  }
  const file = await pickBrowserFile('.html,.htm,text/html');
  return file ? { path: null, name: file.name, text: await file.text(), handle: null } : null;
}

let browserHandle = null;

/** Сохранить текст. Без path (или с forceDialog) спрашивает, куда сохранить. Возвращает { path, name } или null. */
export async function saveFile({ path, suggestedName, text, forceDialog }) {
  if (isDesktop) {
    let target = path;
    if (!target || forceDialog) {
      target = await saveDialog({ defaultPath: suggestedName, filters: HTML_FILTER });
      if (!target) return null;
      if (!/\.html?$/i.test(target)) target += '.html';
    }
    await invoke('write_file', { path: target, contents: text });
    return { path: target, name: baseName(target) };
  }
  if ('showSaveFilePicker' in window) {
    if (!browserHandle || forceDialog) {
      try {
        browserHandle = await window.showSaveFilePicker({ suggestedName, types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] });
      } catch {
        return null;
      }
    }
    const w = await browserHandle.createWritable();
    await w.write(text);
    await w.close();
    return { path: null, name: browserHandle.name };
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return { path: null, name: suggestedName };
}

export function forgetBrowserHandle() {
  browserHandle = null;
}

/** Файл, с которым запустили программу (двойной щелчок по .html). */
export async function initialFile() {
  if (!isDesktop) return null;
  const path = await invoke('initial_file');
  if (!path) return null;
  return { path, name: baseName(path), text: await invoke('read_file', { path }) };
}

/** Открыть документ в браузере по умолчанию. Несохранённый документ открывается из временной копии. */
export async function openInBrowser({ path, text }) {
  if (isDesktop) {
    const target = path || await invoke('write_preview', { contents: text });
    await invoke('open_path', { path: target });
    return;
  }
  window.open(URL.createObjectURL(new Blob([text], { type: 'text/html' })), '_blank');
}

export async function setWindowTitle(title) {
  document.title = title;
  if (isDesktop) await getCurrentWindow().setTitle(title);
}

export async function confirmDialog(message, { title = 'HTML Note', okLabel = 'Да', cancelLabel = 'Отмена' } = {}) {
  if (isDesktop) return ask(message, { title, kind: 'warning', okLabel, cancelLabel });
  return window.confirm(message);
}

/** canClose() — асинхронный вопрос пользователю; isDirty() — есть ли несохранённые изменения (для браузера). */
export function onCloseRequested({ canClose, isDirty }) {
  if (isDesktop) {
    getCurrentWindow().onCloseRequested(async (event) => {
      if (!(await canClose())) event.preventDefault();
    });
  } else {
    window.addEventListener('beforeunload', (e) => {
      if (isDirty()) e.preventDefault();
    });
  }
}

function pickBrowserFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
