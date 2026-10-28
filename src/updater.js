// Проверка обновлений: сравнивает версию программы с последним выпуском на GitHub
// и предлагает скачать установщик. Сама ничего не скачивает и не устанавливает.
import pkg from '../package.json';
import { choiceDialog, toast } from './ui.js';
import { isDesktop, openUrl } from './platform.js';

const REPO = 'Ovolsan/HTML-Note';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const DAY = 24 * 60 * 60 * 1000;
const CHECKED_KEY = 'hn-update-checked';
const SKIP_KEY = 'hn-update-skip';

export const APP_VERSION = pkg.version;

/** Версия как список чисел: «2026.10.28» и метка выпуска «20261028» дают одно и то же [2026, 10, 28]. */
function parts(v) {
  const s = String(v).trim().replace(/^v/i, '');
  const date = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (date) return date.slice(1).map(Number);
  return s.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
}
function newer(a, b) {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}
/** «2026.10.28» → «20261028», как подписаны выпуски на GitHub. */
export const versionLabel = (v) => {
  const p = parts(v);
  return p.length === 3 && p[0] > 2000 ? `${p[0]}${String(p[1]).padStart(2, '0')}${String(p[2]).padStart(2, '0')}` : v;
};

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* без запоминания */ } };

/**
 * manual — по кнопке: сообщает и «обновлений нет», и об ошибке, и показывает пропущенную версию.
 * Без manual (при запуске) проверяет не чаще раза в сутки и молчит, если что-то не так.
 */
export async function checkForUpdates({ manual = false } = {}) {
  if (!manual) {
    if (!isDesktop) return;
    if (Date.now() - Number(read(CHECKED_KEY) || 0) < DAY) return;
  }
  let release;
  try {
    const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
    release = await res.json();
  } catch (e) {
    if (manual) toast(`Не удалось проверить обновления: ${e.message || e}`, 'error', 6000);
    return;
  }
  write(CHECKED_KEY, String(Date.now()));

  const latest = release.tag_name;
  if (!latest || !newer(latest, APP_VERSION)) {
    if (manual) toast(`У вас последняя версия: ${versionLabel(APP_VERSION)}.`, 'ok', 3500);
    return;
  }
  if (!manual && read(SKIP_KEY) === latest) return;

  const setup = (release.assets || []).find((a) => /setup\.exe$/i.test(a.name));
  const notes = (release.body || '').trim().split('\n').slice(0, 8).join('\n');
  const choice = await choiceDialog({
    title: 'Доступно обновление HTML Note',
    text: `Новая версия: ${versionLabel(latest)}. У вас: ${versionLabel(APP_VERSION)}.${notes ? `\n\n${notes}` : ''}`,
    buttons: [
      { label: 'Пропустить эту версию', value: 'skip' },
      { label: 'Позже', value: 'later' },
      { label: setup ? 'Скачать установщик' : 'Открыть страницу выпуска', value: 'get', primary: true },
    ],
  });
  if (choice === 'skip') write(SKIP_KEY, latest);
  if (choice === 'get') {
    await openUrl(setup ? setup.browser_download_url : release.html_url);
    toast('Когда установщик скачается, закройте HTML Note и запустите его.', 'info', 8000);
  }
}
