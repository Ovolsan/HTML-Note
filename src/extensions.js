// Собственные узлы и расширения HTML Note: размер шрифта, картинки с шириной, видео, кнопки, спойлеры.
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';

export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const HnImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-width') || el.style.width || null,
        renderHTML: (a) => (a.width ? { 'data-width': a.width, style: `width: ${a.width}` } : {}),
      },
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') || 'center',
        renderHTML: (a) => ({ 'data-align': a.align }),
      },
      // Обтекание: none — текст сверху и снизу; left/right — «вокруг рамки», картинка прижата к краю.
      wrap: {
        default: 'none',
        parseHTML: (el) => el.getAttribute('data-wrap') || 'none',
        renderHTML: (a) => (a.wrap && a.wrap !== 'none' ? { 'data-wrap': a.wrap } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]:not(.hn-emoji)' }];
  },
  addNodeView() {
    // Картинка в рамке с ручками: тянуть за край — менять ширину (в процентах от ширины листа).
    return ({ node, editor, getPos }) => {
      const wrap = document.createElement('div');
      wrap.className = 'hn-img-wrap';
      const img = document.createElement('img');
      wrap.append(img);
      for (const dir of ['l', 'r', 'tl', 'tr', 'bl', 'br']) {
        const h = document.createElement('span');
        h.className = `hn-img-handle ${dir}`;
        h.dataset.dir = dir;
        wrap.append(h);
      }
      const label = document.createElement('span');
      label.className = 'hn-img-size';
      wrap.append(label);

      let current = node;
      const apply = (n) => {
        current = n;
        img.src = n.attrs.src;
        img.alt = n.attrs.alt || '';
        wrap.style.width = n.attrs.width || '';
        wrap.dataset.align = n.attrs.align || 'center';
        wrap.dataset.wrap = n.attrs.wrap || 'none';
      };
      apply(node);

      wrap.addEventListener('pointerdown', (e) => {
        const dir = e.target.dataset?.dir;
        if (!dir) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = wrap.getBoundingClientRect().width;
        // Проценты считаются от ширины того, в чём стоит картинка: листа или блока.
        const full = wrap.parentElement?.clientWidth || editor.view.dom.clientWidth;
        const sign = dir.includes('l') ? -1 : 1;
        // У картинки по центру край уходит в обе стороны, поэтому ширина меняется вдвое быстрее.
        const factor = (current.attrs.wrap === 'none' || !current.attrs.wrap) && current.attrs.align === 'center' ? 2 : 1;
        let pct = null;
        e.target.setPointerCapture(e.pointerId);
        wrap.classList.add('resizing');
        const move = (ev) => {
          const w = Math.min(full, Math.max(32, startW + sign * factor * (ev.clientX - startX)));
          pct = `${Math.max(5, Math.min(100, Math.round((w / full) * 100)))}%`;
          wrap.style.width = pct;
          label.textContent = pct;
        };
        const up = () => {
          e.target.removeEventListener('pointermove', move);
          e.target.removeEventListener('pointerup', up);
          wrap.classList.remove('resizing');
          if (pct && typeof getPos === 'function') {
            editor.chain().setNodeSelection(getPos()).updateAttributes('image', { width: pct }).run();
          }
        };
        e.target.addEventListener('pointermove', move);
        e.target.addEventListener('pointerup', up);
      });

      return {
        dom: wrap,
        update: (n) => {
          if (n.type.name !== 'image') return false;
          apply(n);
          return true;
        },
        stopEvent: (e) => !!e.target.dataset?.dir,
        ignoreMutation: () => true,
      };
    };
  },
}).configure({ allowBase64: true, inline: false });

/** Превращает ссылку YouTube/Vimeo в адрес встроенного плеера; для прочих ссылок возвращает null. */
export function embedUrl(url) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (yt) return { src: `https://www.youtube.com/embed/${yt[1]}`, page: `https://www.youtube.com/watch?v=${yt[1]}` };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vm) return { src: `https://player.vimeo.com/video/${vm[1]}`, page: `https://vimeo.com/${vm[1]}` };
  return null;
}

function videoDom(attrs) {
  const style = `width: ${attrs.width || '100%'}`;
  if (attrs.kind === 'embed') {
    const children = [['div', { class: 'hn-video-frame' }, ['iframe', {
      src: attrs.src, allowfullscreen: 'true', referrerpolicy: 'strict-origin-when-cross-origin',
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
    }]]];
    if (attrs.page) children.push(['a', { class: 'hn-video-link', href: attrs.page, target: '_blank', rel: 'noopener' }, 'Открыть видео на сайте ↗']);
    return ['div', { class: 'hn-video embed', style, 'data-type': 'video' }, ...children];
  }
  return ['div', { class: 'hn-video', style, 'data-type': 'video' }, ['video', { src: attrs.src, controls: 'true', preload: 'metadata' }]];
}

export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null, rendered: false },
      kind: { default: 'file', rendered: false },
      page: { default: null, rendered: false },
      width: { default: '100%', rendered: false },
    };
  },
  parseHTML() {
    const fromWrapper = (el) => {
      const media = el.querySelector('video, iframe');
      if (!media) return false;
      const isFrame = media.tagName === 'IFRAME';
      return {
        src: media.getAttribute('src'),
        kind: isFrame ? 'embed' : 'file',
        page: el.querySelector('.hn-video-link')?.getAttribute('href') || null,
        width: el.style.width || '100%',
      };
    };
    return [
      { tag: 'div.hn-video', getAttrs: fromWrapper },
      { tag: 'video', getAttrs: (el) => ({ src: el.getAttribute('src') || el.querySelector('source')?.getAttribute('src'), kind: 'file' }) },
      { tag: 'iframe', getAttrs: (el) => {
        const src = el.getAttribute('src') || '';
        return /youtube|vimeo/i.test(src) ? { src, kind: 'embed' } : false;
      } },
    ];
  },
  renderHTML({ node }) {
    return videoDom(node.attrs);
  },
  addNodeView() {
    // В редакторе поверх плеера есть полоска-ручка: по ней видео выделяется, перетаскивается и настраивается.
    return ({ node }) => {
      const wrap = document.createElement('div');
      wrap.className = 'hn-node-wrap';
      const grip = document.createElement('div');
      grip.className = 'hn-node-grip';
      grip.textContent = node.attrs.kind === 'embed' ? 'Видео по ссылке' : 'Видео';
      grip.setAttribute('data-drag-handle', '');
      wrap.append(grip, renderSpec(videoDom(node.attrs)));
      return { dom: wrap };
    };
  },
  addCommands() {
    return {
      setVideo: (attrs) => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export const HnButton = Node.create({
  name: 'hnButton',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      text: { default: 'Кнопка', rendered: false },
      href: { default: '#', rendered: false },
      variant: { default: 'primary', rendered: false },
    };
  },
  parseHTML() {
    return [{
      tag: 'a.hn-button',
      priority: 100,
      getAttrs: (el) => ({
        text: el.textContent.trim() || 'Кнопка',
        href: el.getAttribute('href') || '#',
        variant: el.classList.contains('outline') ? 'outline' : 'primary',
      }),
    }];
  },
  renderHTML({ node }) {
    const { text, href, variant } = node.attrs;
    return ['a', { class: `hn-button${variant === 'outline' ? ' outline' : ''}`, href, target: '_blank', rel: 'noopener', 'data-type': 'button' }, text];
  },
  addCommands() {
    return {
      setButton: (attrs) => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export const SpoilerSummary = Node.create({
  name: 'spoilerSummary',
  content: 'inline*',
  defining: true,
  selectable: false,
  parseHTML() {
    return [{ tag: 'div[data-type="spoiler-summary"]' }, { tag: 'summary' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'spoiler-summary', class: 'hn-spoiler-summary' }), 0];
  },
});

export const SpoilerContent = Node.create({
  name: 'spoilerContent',
  content: 'block+',
  defining: true,
  selectable: false,
  parseHTML() {
    return [{ tag: 'div[data-type="spoiler-content"]' }, { tag: 'div.hn-spoiler-body' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'spoiler-content', class: 'hn-spoiler-body' }), 0];
  },
});

export const Spoiler = Node.create({
  name: 'spoiler',
  group: 'block',
  content: 'spoilerSummary spoilerContent',
  defining: true,
  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (el) => el.hasAttribute('open') || el.getAttribute('data-open') === 'true',
        renderHTML: (a) => ({ 'data-open': a.open ? 'true' : 'false' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="spoiler"]' }, { tag: 'details' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'spoiler', class: 'hn-spoiler' }), 0];
  },
  addCommands() {
    return {
      setSpoiler: () => ({ commands }) => commands.insertContent({
        type: this.name,
        content: [
          { type: 'spoilerSummary', content: [{ type: 'text', text: 'Спойлер' }] },
          { type: 'spoilerContent', content: [{ type: 'paragraph' }] },
        ],
      }),
    };
  },
  addKeyboardShortcuts() {
    return {
      // Enter в заголовке спойлера переводит курсор в его содержимое.
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== 'spoilerSummary') return false;
        return editor.commands.setTextSelection($from.after() + 2);
      },
    };
  },
});

/** Создаёт DOM-элемент из описания в формате renderHTML (["tag", attrs, ...children]). */
function renderSpec(spec) {
  if (typeof spec === 'string') return document.createTextNode(spec);
  const [tag, attrs, ...children] = spec;
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const child of children) el.append(renderSpec(child));
  return el;
}
