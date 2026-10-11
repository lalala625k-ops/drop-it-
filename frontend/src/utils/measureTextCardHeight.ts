import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownView } from '../components/MarkdownView';

let preview: HTMLDivElement | null = null;
let editor: HTMLTextAreaElement | null = null;

// Measure the same Markdown and textarea that the card displays. Lists and
// headings have margins and font weights that a character-count estimate misses.
export function measureTextCardHeight(content: string, width: number): number | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (!preview || !editor) {
    preview = document.createElement('div');
    editor = document.createElement('textarea');
    for (const element of [preview, editor]) {
      element.setAttribute('aria-hidden', 'true');
      element.inert = true;
      element.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;border:0;padding:0;margin:0;';
      element.className = 'font-retina';
      document.body.appendChild(element);
    }
    preview.style.contain = 'layout style';
    editor.style.fontSize = '15px';
    editor.style.lineHeight = '21px';
    editor.style.height = '0';
    editor.style.minHeight = '0';
    editor.style.overflow = 'hidden';
    editor.style.overflowWrap = 'anywhere';
    editor.tabIndex = -1;
  }
  preview.style.width = editor.style.width = `${width}px`;
  preview.innerHTML = renderToStaticMarkup(createElement(MarkdownView, {
    content, style: { height: 'auto', overflow: 'visible', display: 'flow-root' },
  }));
  editor.value = content;
  return Math.ceil(Math.max(preview.getBoundingClientRect().height, editor.scrollHeight)) + 1;
}
