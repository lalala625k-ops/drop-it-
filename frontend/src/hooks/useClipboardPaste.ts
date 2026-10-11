import { useCallback } from 'react';
import { Card } from '../types';
import { CanvasClipboardSnapshot, normalizeClipboardText } from '../utils/canvasClipboard';
import { CANVAS_CLIPBOARD_MIME, hasCanvasClipboardPayload, readClipboardSnapshot } from '../utils/canvasClipboardTransport';
import { ingestScreenshot } from '../utils/ingestScreenshot';
import { isFeishuUrl, FEISHU_LOGO_URLS } from '../utils/feishu';
import { readPinterestTransfer } from '../utils/pinterestTransfer';

interface UseClipboardPasteProps {
  createCardAtCursor: (cardData: Partial<Card>) => Card;
  updateCard: (id: string, updates: Partial<Card>) => void;
  showToast?: (msg: string) => void;
  stageCopiedObjects?: (snapshot: CanvasClipboardSnapshot) => void;
  getCopiedObjects?: () => CanvasClipboardSnapshot;
  hasCanvasMultiSelection?: boolean;
  getWorldPosition: () => { x: number; y: number };
  getCardById: (id: string) => Card | undefined;
}

export function useClipboardPaste({
  createCardAtCursor,
  updateCard,
  showToast,
  stageCopiedObjects,
  getCopiedObjects,
  hasCanvasMultiSelection,
  getWorldPosition,
  getCardById,
}: UseClipboardPasteProps) {
  const handleDataTransfer = useCallback(
    async (clipboardData: DataTransfer, fromClipboard = false) => {
      const snapshot = readClipboardSnapshot(clipboardData);
      if (snapshot && stageCopiedObjects) {
        stageCopiedObjects(snapshot);
        return;
      }
      if (!snapshot && hasCanvasClipboardPayload(clipboardData)) {
        showToast?.('便签数据读取失败，请重新复制');
        return;
      }
      const pinterest = readPinterestTransfer(clipboardData);
      const rawText = pinterest?.url || normalizeClipboardText(clipboardData.getData('text/plain') || clipboardData.getData('text/uri-list'));

      const items = Array.from(clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      const file = !pinterest && (imageItem?.getAsFile() || Array.from(clipboardData.files).find((item) =>
        item.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(item.name)));
      const text = rawText;
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
            matchClipboardSource: fromClipboard && !html && !rawText,
          });
          return;
      }

      // Images dragged from a browser often arrive as a URL or an HTML <img>.
      let imageUrl = '';
      const directUrl = text.match(/^https?:\/\/\S+$/i)?.[0] || '';
      if (html && !pinterest) {
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
          image: pinterest?.image,
        });

        const keepPinterestPreview = (updates: Partial<Card> = {}) => {
          if (!pinterest?.image) return false;
          const preview = new Image();
          let finished = false;
          const finish = (readable: boolean) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            updateCard(created.id, { ...updates, image: readable ? pinterest.image : '',
              height: readable ? Math.round(created.width * preview.naturalHeight / preview.naturalWidth + 68) : 90,
              isParsing: false });
            if (!readable) showToast?.('链接已添加，预览图暂不可读');
          };
          const timer = setTimeout(() => finish(false), 10000);
          preview.referrerPolicy = 'no-referrer';
          preview.onload = () => finish(!!preview.naturalWidth && !!preview.naturalHeight);
          preview.onerror = () => finish(false);
          preview.src = pinterest.image;
          return true;
        };

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
                if (keepPinterestPreview({ title: finalTitle, description: meta.description || '',
                  favicon: meta.favicon || '' })) return;
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
              if (keepPinterestPreview({ title: finalTitle, description: meta.description || '',
                favicon: meta.favicon || '' })) return;
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
            if (keepPinterestPreview()) return;
            updateCard(created.id, { isParsing: false, height: 90 });
            showToast?.('链接已添加，元数据解析失败；请检查后端服务');
          }
        } catch (err) {
          console.warn('Metadata fetch failed:', err);
          if (keepPinterestPreview()) return;
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
    [createCardAtCursor, updateCard, stageCopiedObjects,
      getWorldPosition, getCardById, showToast]
  );

  const handlePaste = useCallback((event: ClipboardEvent) => {
    if (document.querySelector('[data-modal="settings"]')) return;
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
      const hasImage = Array.from(event.clipboardData?.items || []).some((item) => item.type.startsWith('image/'));
      const canvasEditorFocused = !!(document.activeElement as HTMLElement | null)?.closest?.('[data-card-id]');
      const hasObjects = !!event.clipboardData && hasCanvasClipboardPayload(event.clipboardData);
      if (!hasImage && !(canvasEditorFocused && (hasCanvasMultiSelection || hasObjects))) return;
    }
    event.preventDefault();
    if (event.clipboardData) void handleDataTransfer(event.clipboardData, true);
  }, [handleDataTransfer, hasCanvasMultiSelection]);

  const pasteFromSystemClipboard = useCallback(async () => {
    if (navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        const data = new DataTransfer();
        for (const item of items) {
          for (const type of item.types) {
            if (!['text/plain', 'text/html', CANVAS_CLIPBOARD_MIME].includes(type) && !type.startsWith('image/')) continue;
            const blob = await item.getType(type);
            if (type.startsWith('image/')) data.items.add(new File([blob], 'pasted-image', { type: blob.type || type }));
            else data.setData(type, await blob.text());
          }
        }
        await handleDataTransfer(data, true);
        return;
      } catch {
        // Permissions or clipboard.read unsupported, continue
      }
    }

    if (navigator.clipboard?.readText) {
      try {
        const text = (await navigator.clipboard.readText())?.trim();
        if (text) {
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          await handleDataTransfer(dt);
        }
        return;
      } catch {
        // fallback
      }
    }

    const fallbackObjects = getCopiedObjects?.();
    if (fallbackObjects && (fallbackObjects.cards.length || fallbackObjects.groups.length || fallbackObjects.pins?.length)) {
      stageCopiedObjects?.(fallbackObjects);
    }
  }, [getCopiedObjects, stageCopiedObjects, handleDataTransfer]);

  return { handlePaste, handleDroppedData: handleDataTransfer, pasteFromSystemClipboard };
}
