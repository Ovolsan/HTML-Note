// Настройка редактора: набор расширений и вставка файлов (картинки и видео) через вставку и перетаскивание.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Strike from '@tiptap/extension-strike';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { FontSize, HnImage, Video, HnButton, Spoiler, SpoilerSummary, SpoilerContent } from './extensions.js';
import { CanvasDocument, CanvasSurface, HnFrame, HnBlock, HnRow } from './canvas.js';
import { HnEmoji } from './emoji.js';
import { readAsDataUrl, formatBytes } from './ui.js';
import { confirmDialog } from './platform.js';

const MEDIA = /^(image|video)\//;

export function createEditor(element, { onChange, onSelection }) {
  const editor = new Editor({
    element,
    extensions: [
      // Ctrl+Shift+S занято под «Сохранить как», поэтому зачёркивание — Alt+Shift+5, как в Google Документах.
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, strike: false, document: false }),
      CanvasDocument,
      CanvasSurface,
      HnFrame,
      Strike.extend({ addKeyboardShortcuts() { return { 'Alt-Shift-5': () => this.editor.commands.toggleStrike() }; } }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener' } }),
      HnImage,
      Video,
      HnButton,
      HnEmoji,
      HnBlock,
      HnRow,
      Spoiler,
      SpoilerSummary,
      SpoilerContent,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? 'Заголовок' : 'Начните писать или вставьте картинку…'),
      }),
    ],
    content: '',
    editorProps: {
      attributes: { spellcheck: 'true' },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files || [])].filter((f) => MEDIA.test(f.type));
        if (!files.length) return false;
        event.preventDefault();
        insertMediaFiles(editor, files);
        return true;
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false;
        const files = [...(event.dataTransfer?.files || [])].filter((f) => MEDIA.test(f.type));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertMediaFiles(editor, files, pos);
        return true;
      },
    },
    onUpdate: () => onChange(),
    onSelectionUpdate: () => onSelection(),
    onTransaction: () => onSelection(),
  });
  return editor;
}

/** Встраивает картинки и видео прямо в документ (data URI), чтобы файл оставался одним. */
export async function insertMediaFiles(editor, files, pos) {
  for (const file of files) {
    const isVideo = file.type.startsWith('video/');
    if (isVideo && file.size > 50 * 1024 * 1024) {
      const ok = await confirmDialog(`Видео «${file.name}» весит ${formatBytes(file.size)}. Оно будет встроено в документ, и файл станет таким же большим. Встроить?`);
      if (!ok) continue;
    }
    const src = await readAsDataUrl(file);
    const node = isVideo
      ? { type: 'video', attrs: { src, kind: 'file' } }
      : { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } };
    if (typeof pos === 'number') editor.chain().focus().insertContentAt(pos, node).run();
    else editor.chain().focus().insertContent(node).run();
  }
}
