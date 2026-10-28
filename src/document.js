// Превращение содержимого редактора в самостоятельный HTML-файл и обратно.
import docCss from './styles/doc.css?raw';
import pageCss from './export/page.css?raw';
import viewerJs from './export/viewer.js?raw';
import { videoPage } from './extensions.js';

export const GENERATOR = 'HTML Note 0.1';
export const DEFAULT_SETTINGS = { toc: true, width: 'normal' };

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function slugify(text, used) {
  let base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'razdel';
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  used.add(id);
  return id;
}

/** Собирает HTML-файл из HTML редактора. */
export function buildHtml({ html, settings, title }) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const root = tpl.content;

  // Спойлеры: в редакторе это div-ы, в файле — <details>, которые работают в любом браузере без скриптов.
  root.querySelectorAll('div[data-type="spoiler"]').forEach((div) => {
    const details = document.createElement('details');
    details.className = 'hn-spoiler';
    if (div.getAttribute('data-open') === 'true') details.open = true;
    const summary = document.createElement('summary');
    summary.className = 'hn-spoiler-summary';
    const head = div.querySelector(':scope > [data-type="spoiler-summary"]');
    summary.innerHTML = head ? head.innerHTML : 'Спойлер';
    const body = document.createElement('div');
    body.className = 'hn-spoiler-body';
    const content = div.querySelector(':scope > [data-type="spoiler-content"]');
    if (content) body.innerHTML = content.innerHTML;
    details.append(summary, body);
    div.replaceWith(details);
  });
  root.querySelectorAll('[data-type="button"]').forEach((a) => a.removeAttribute('data-type'));

  // Заголовки получают id, чтобы на них ссылалось содержание.
  const used = new Set();
  const toc = [];
  root.querySelectorAll('h1, h2, h3').forEach((h) => {
    const text = h.textContent.trim();
    if (!text) return;
    h.id = slugify(text, used);
    toc.push({ id: h.id, text, level: Number(h.tagName[1]) });
  });

  // Листы стоят на холсте по координатам; ширина холста — по самому правому листу.
  let canvasWidth = 0;
  [...root.children].filter((c) => c.classList.contains('hn-frame')).forEach((f) => {
    canvasWidth = Math.max(canvasWidth, Number(f.dataset.x || 0) + Number(f.dataset.w || 860));
  });
  const wrap = document.createElement('div');
  wrap.append(root.cloneNode(true));
  const content = `<div class="hn-canvas" style="width: ${canvasWidth + 40}px">${wrap.innerHTML}</div>`;
  const minLevel = Math.min(...toc.map((t) => t.level), 3);
  const tocHtml = settings.toc && toc.length
    ? `<button class="hn-toc-toggle" type="button" aria-controls="hn-toc" aria-expanded="true" aria-label="Содержание" title="Содержание"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"/></svg></button>
<nav class="hn-toc" id="hn-toc" aria-label="Содержание"><div class="hn-toc-title">Содержание</div>${toc
      .map((t) => `<a class="l${t.level - minLevel + 1}" href="#${t.id}">${escapeHtml(t.text)}</a>`).join('')}</nav>`
    : '';
  const bodyClass = ['hn-page', settings.toc && toc.length ? 'with-toc' : '', settings.width === 'wide' ? 'wide' : ''].filter(Boolean).join(' ');
  const json = JSON.stringify(settings).replace(/</g, '\\u003c');
  const docTitle = escapeHtml(title || 'Документ');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="generator" content="${GENERATOR}">
<title>${docTitle}</title>
<style>
${pageCss}
${docCss}
</style>
<script type="application/json" id="hn-settings">${json}</script>
</head>
<body class="${bodyClass}">
<div class="hn-layout">
${tocHtml}
<main class="hn-doc">
${content}
</main>
</div>
<div class="hn-lightbox" hidden><button class="hn-close" type="button" aria-label="Закрыть">Закрыть ✕</button><button class="hn-prev" type="button" aria-label="Предыдущая">‹</button><img alt=""><button class="hn-next" type="button" aria-label="Следующая">›</button><div class="hn-caption"></div></div>
<script>
${viewerJs}
</script>
</body>
</html>
`;
}

/** Разбирает HTML-файл. native = файл создан в HTML Note и откроется без потерь. */
export function parseHtml(text) {
  const dom = new DOMParser().parseFromString(text, 'text/html');
  const generator = dom.querySelector('meta[name="generator"]')?.getAttribute('content') || '';
  const native = generator.startsWith('HTML Note');
  let settings = { ...DEFAULT_SETTINGS };
  if (native) {
    try {
      settings = { ...settings, ...JSON.parse(dom.getElementById('hn-settings')?.textContent || '{}') };
    } catch { /* настройки повреждены — берём стандартные */ }
  }
  const root = (native && (dom.querySelector('main.hn-doc > .hn-canvas') || dom.querySelector('main.hn-doc'))) || dom.body;
  root.querySelectorAll('script, style, link, meta, noscript, .hn-lightbox, .hn-toc, .hn-toc-toggle').forEach((n) => n.remove());

  // Чужие <details> приводим к виду «заголовок + содержимое», который понимает редактор.
  root.querySelectorAll('details').forEach((d) => {
    let summary = d.querySelector(':scope > summary');
    if (!summary) {
      summary = dom.createElement('summary');
      summary.textContent = 'Спойлер';
      d.prepend(summary);
    }
    if (!d.querySelector(':scope > .hn-spoiler-body')) {
      const body = dom.createElement('div');
      body.className = 'hn-spoiler-body';
      [...d.childNodes].filter((n) => n !== summary).forEach((n) => body.append(n));
      if (!body.childNodes.length) body.append(dom.createElement('p'));
      d.append(body);
    }
  });
  // <figure> с картинкой — оставляем картинку и подпись абзацем.
  root.querySelectorAll('figure').forEach((fig) => {
    const cap = fig.querySelector('figcaption');
    const parts = [...fig.querySelectorAll('img, video, iframe')];
    if (cap) {
      const p = dom.createElement('p');
      p.textContent = cap.textContent;
      parts.push(p);
    }
    fig.replaceWith(...parts);
  });
  // Встроенные плееры YouTube/Vimeo (их вставляли прежние версии) становятся ссылкой на ролик.
  [...root.querySelectorAll('div.hn-video.embed'), ...root.querySelectorAll('iframe')].forEach((el) => {
    if (!el.isConnected) return;
    const src = el.querySelector?.('.hn-video-link')?.getAttribute('href') || (el.matches('iframe') ? el : el.querySelector('iframe'))?.getAttribute('src') || '';
    const site = videoPage(src);
    if (!site) return;
    const p = dom.createElement('p');
    const a = dom.createElement('a');
    a.href = site.page;
    a.textContent = `Видео на ${site.site} ↗`;
    p.append(a);
    el.replaceWith(p);
  });
  return { html: root.innerHTML, settings, native, title: dom.title || '' };
}

/** Заголовки документа редактора для содержания: [{ level, text, pos }]. */
export function collectHeadings(doc) {
  const list = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.attrs.level <= 3 && node.textContent.trim()) {
      list.push({ level: node.attrs.level, text: node.textContent.trim(), pos });
    }
    return node.type.name !== 'heading';
  });
  return list;
}
