import { useCallback } from 'react';
import { Card } from '../types';
import { CanvasClipboardSnapshot } from '../utils/canvasClipboard';
import { ingestScreenshot } from '../utils/ingestScreenshot';
import { isFeishuUrl, FEISHU_LOGO_URLS } from '../utils/feishu';

interface UseClipboardPasteProps {
  createCardAtCursor: (cardData: Partial<Card>) => Card;
  updateCard: (id: string, updates: Partial<Card>) => void;
  showToast?: (msg: string) => void;
  stageCopiedObjects?: (snapshot: CanvasClipboardSnapshot) => void;
  getCopiedObjects?: () => CanvasClipboardSnapshot;
  getWorldPosition: () => { x: number; y: number };
  getCardById: (id: string) => Card | undefined;
}

export function useClipboardPaste({
  createCardAtCursor,
  updateCard,
  showToast,
  stageCopiedObjects,
  getCopiedObjects,
  getWorldPosition,
  getCardById,
}: UseClipboardPasteProps) {
  const handleDataTransfer = useCallback(
    async (clipboardData: DataTransfer) => {
      // Internal canvas snapshots keep selected objects and their relationships.
      const rawText = (clipboardData.getData('text/plain') || clipboardData.getData('text/uri-list'))?.trim();
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          if (
            parsed &&
            (parsed.__type === 'infinite-canvas-objects' || parsed.__type === 'infinite-canvas-cards') &&
            Array.isArray(parsed.cards) &&
            Array.isArray(parsed.groups ?? []) &&
            (parsed.cards.length > 0 || parsed.groups?.length > 0)
          ) {
            stageCopiedObjects?.({ cards: parsed.cards, groups: parsed.groups ?? [] });
            return;
          }
        } catch {
          // Not JSON, continue with normal paste handlers
        }
      }

      // Fallback internal copied cards if clipboard read was blank/intercepted
      const internalObjects = getCopiedObjects?.();
      if (internalObjects && (internalObjects.cards.length || internalObjects.groups.length)
        && !rawText && clipboardData.items.length === 0) {
        stageCopiedObjects?.(internalObjects);
        return;
      }

      const items = Array.from(clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile() || Array.from(clipboardData.files).find((item) =>
        item.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(item.name));
      const text = (clipboardData.getData('text/uri-list') || clipboardData.getData('text/plain'))?.trim();
      const html = clipboardData.getData('text/html');
      if (!file && !text && !html) return;

      const performPaste = async () => {
      // 1. Image
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

      // Images dragged from a browser often arrive as a URL or an HTML <img>.
      let imageUrl = '';
      const directUrl = text.match(/^https?:\/\/\S+$/i)?.[0] || '';
      if (html) {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const source = doc.querySelector('img[src]')?.getAttribute('src') || '';
          // A copied webpage often embeds a preview image. Only treat the HTML
          // as an image when it is actually the clipboard's image URL.
          if (/^(https?:\/\/|data:image\/)/i.test(source) &&
            (directUrl === source || (!text && !doc.querySelector('a[href]')))) imageUrl = source;
        } catch { /* Use the text URL below. */ }
      }
      if (!imageUrl && directUrl && /\.(png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#]|$)/i.test(directUrl)) {
        imageUrl = directUrl;
      }
      if (imageUrl.startsWith('data:image/')) {
        try {
          const blob = await (await fetch(imageUrl)).blob();
          await ingestScreenshot(new File([blob], 'pasted-image', { type: blob.type || 'image/png' }), {
            createCard: createCardAtCursor,
            updateCard,
            getCard: getCardById,
            showToast: (message) => showToast?.(message),
            position: { ...getWorldPosition() },
          });
        } catch {
          showToast?.('图片读取失败');
        }
        return;
      }
      if (imageUrl) {
        const created = createCardAtCursor({ type: 'image', image: imageUrl, width: 360, height: 240 });
        const image = new Image();
        image.onload = () => {
          if (image.naturalWidth && image.naturalHeight) {
            updateCard(created.id, { height: Math.round(360 * image.naturalHeight / image.naturalWidth) });
          }
        };
        image.src = imageUrl;
        return;
      }

      // 2. URL or Plain Text
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
        const feishu = isFeishuUrl(targetUrl);
        const initialTitle = targetTitle || targetUrl;
        const created = createCardAtCursor({
          type: 'web',
          url: targetUrl,
          title: initialTitle,
          width: 280,
          height: 200,
          isParsing: true,
          favicon: feishu ? FEISHU_LOGO_URLS[0] : undefined,
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

            if (feishu) {
              updateCard(created.id, { title: finalTitle, image: '',
                description: meta.description || '', favicon: FEISHU_LOGO_URLS[0],
                height: 90, isParsing: false });
              return;
            }

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
            showToast?.('链接已添加，元数据解析失败；请检查后端服务');
          }
        } catch (err) {
          console.warn('Metadata fetch failed:', err);
          updateCard(created.id, { isParsing: false, height: 90 });
          showToast?.('链接已添加，元数据解析失败；请检查后端服务');
        }
      } else if (text) {
        createCardAtCursor({
          type: 'text',
          content: text,
          width: 260,
          height: 180,
        });
      }
      };
      await performPaste();
    },
    [createCardAtCursor, updateCard, stageCopiedObjects, getCopiedObjects,
      getWorldPosition, getCardById, showToast]
  );

  const handlePaste = useCallback((event: ClipboardEvent) => {
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea') {
      const hasImage = Array.from(event.clipboardData?.items || []).some((item) => item.type.startsWith('image/'));
      if (!hasImage) return;
    }
    event.preventDefault();
    if (event.clipboardData) void handleDataTransfer(event.clipboardData);
  }, [handleDataTransfer]);

  return { handlePaste, handleDroppedData: handleDataTransfer };
}
