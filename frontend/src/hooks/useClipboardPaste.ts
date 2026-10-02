import { useCallback } from 'react';
import { Card } from '../types';
import { ingestScreenshot } from '../utils/ingestScreenshot';

interface UseClipboardPasteProps {
  createCardAtCursor: (cardData: Partial<Card>) => Card;
  updateCard: (id: string, updates: Partial<Card>) => void;
  showToast?: (msg: string) => void;
  pasteCopiedCards?: (cards: Card[]) => void;
  getCopiedCards?: () => Card[];
  getWorldPosition: () => { x: number; y: number };
  getCardById: (id: string) => Card | undefined;
}

export function useClipboardPaste({
  createCardAtCursor,
  updateCard,
  showToast,
  pasteCopiedCards,
  getCopiedCards,
  getWorldPosition,
  getCardById,
}: UseClipboardPasteProps) {
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      e.preventDefault();
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // 0. Check if clipboard contains copied cards (infinite-canvas-cards)
      const rawText = clipboardData.getData('text/plain')?.trim();
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          if (
            parsed &&
            parsed.__type === 'infinite-canvas-cards' &&
            Array.isArray(parsed.cards) &&
            parsed.cards.length > 0
          ) {
            pasteCopiedCards?.(parsed.cards);
            return;
          }
        } catch {
          // Not JSON, continue with normal paste handlers
        }
      }

      // Fallback internal copied cards if clipboard read was blank/intercepted
      const internalCards = getCopiedCards?.();
      if (internalCards && internalCards.length > 0 && !rawText && clipboardData.items.length === 0) {
        pasteCopiedCards?.(internalCards);
        return;
      }

      // 1. Image
      const items = Array.from(clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith('image/'));

      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          await ingestScreenshot(file, {
            createCard: createCardAtCursor,
            updateCard,
            getCard: getCardById,
            showToast: (message) => showToast?.(message),
            position: { ...getWorldPosition() },
          });
          return;
        }
      }

      // 2. URL or Plain Text
      const text = clipboardData.getData('text/plain')?.trim();
      const html = clipboardData.getData('text/html');

      let targetUrl = '';
      let targetTitle = '';

      if (text) {
        const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
        if (urlMatch) {
          targetUrl = urlMatch[1];
          let cleaned = text.replace(targetUrl, '').trim();
          cleaned = cleaned.replace(/^[:：\-—\s]+|[:：\-—\s]+$/g, '').trim();
          // Strip wrapping brackets like 《...》 or 【...】 without deleting the title inside
          const bracketMatch = cleaned.match(/^[《【\["“](.*?)[》】\]"”]$/);
          if (bracketMatch) {
            cleaned = bracketMatch[1].trim();
          }
          if (cleaned && cleaned.length < 120) {
            targetTitle = cleaned;
          }
        }
      }

      if (html && !targetUrl) {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const anchor = doc.querySelector('a[href]');
          if (anchor) {
            const href = anchor.getAttribute('href');
            if (href && /^https?:\/\//i.test(href)) {
              targetUrl = href;
              const aText = anchor.textContent?.trim();
              if (aText) targetTitle = aText;
            }
          }
        } catch {
          // ignore html parse error
        }
      }

      // Valid URL
      if (targetUrl && (!text || text.length < 500)) {
        const initialTitle = targetTitle || targetUrl;
        const created = createCardAtCursor({
          type: 'web',
          url: targetUrl,
          title: initialTitle,
          width: 280,
          height: 200,
          isParsing: true,
        });

        try {
          const res = await fetch(`/api/fetch-metadata?url=${encodeURIComponent(targetUrl)}`, {
            signal: AbortSignal.timeout(30000),
          });
          if (res.ok) {
            const meta = await res.json();
            const clipboardTitle = targetTitle && targetTitle !== targetUrl ? targetTitle : '';
            const parsedTitle = typeof meta.title === 'string' && meta.title.trim() !== targetUrl ? meta.title.trim() : '';
            const finalTitle = parsedTitle || clipboardTitle || initialTitle;

            if (meta.image) {
              const img = new Image();
              img.referrerPolicy = 'no-referrer';
              let isHandled = false;
              const finishWithImage = () => {
                if (isHandled) return;
                isHandled = true;
                const ratio = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : (16 / 9);
                const imgHeight = created.width / ratio;
                const footerHeight = 68;
                const newHeight = Math.round(imgHeight + footerHeight);
                updateCard(created.id, {
                  title: finalTitle,
                  image: meta.image,
                  description: meta.description || '',
                  favicon: meta.favicon || '',
                  height: newHeight,
                  isParsing: false,
                });
              };
              const finishWithoutImage = () => {
                if (isHandled) return;
                isHandled = true;
                updateCard(created.id, {
                  title: finalTitle,
                  image: '',
                  description: meta.description || '',
                  favicon: meta.favicon || '',
                  height: 90,
                  isParsing: false,
                });
                showToast?.('头图加载失败');
              };
              img.onload = finishWithImage;
              img.onerror = finishWithoutImage;
              img.src = meta.image;

              // A stalled image request should end as a failed load, not as a successful preview.
              setTimeout(finishWithoutImage, 10000);
            } else {
              updateCard(created.id, {
                title: finalTitle,
                image: '',
                description: meta.description || '',
                favicon: meta.favicon || '',
                height: 90,
                isParsing: false,
              });
              showToast?.('页面未提供头图');
            }
          } else {
            updateCard(created.id, { isParsing: false, height: 90 });
            showToast?.('链接解析失败');
          }
        } catch (err) {
          console.warn('Metadata fetch failed:', err);
          updateCard(created.id, { isParsing: false, height: 90 });
          showToast?.('链接解析失败');
        }
      } else if (text) {
        createCardAtCursor({
          type: 'text',
          content: text,
          width: 260,
          height: 180,
        });
      }
    },
    [createCardAtCursor, updateCard, pasteCopiedCards, getCopiedCards, getWorldPosition, getCardById, showToast]
  );

  return { handlePaste };
}
