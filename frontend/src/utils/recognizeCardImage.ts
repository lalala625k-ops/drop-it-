import { Card } from '../types';

export type ImageRecognitionMode = 'ocr' | 'link';

async function imageRequestBody(src: string): Promise<BodyInit> {
  if (src.startsWith('data:')) return JSON.stringify({ image: src });
  const response = await fetch(src);
  if (!response.ok) throw new Error('图片资源无法读取');
  return response.blob();
}

async function previewSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(null), 8000);
    image.referrerPolicy = 'no-referrer';
    image.onload = () => { clearTimeout(timer); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = src;
  });
}

export async function recognizeCardImage(card: Card, mode: ImageRecognitionMode): Promise<{
  updates: Partial<Card>; outcome: 'text' | 'link';
} | null> {
  if (!card.image) throw new Error('图片内容不存在');
  const body = await imageRequestBody(card.image);
  const response = await fetch(mode === 'link' ? '/api/resolve-image' : '/api/recognize-image', {
    method: 'POST',
    headers: typeof body === 'string' ? { 'Content-Type': 'application/json' } : undefined,
    body,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`图片识别失败（HTTP ${response.status}）`);
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'OCR 识别失败');
  const text = typeof result.text === 'string' ? result.text.trim() : '';
  const url = mode === 'link' && typeof result.url === 'string' ? result.url.trim() : '';
  if (mode === 'link' && !url) return null;
  if (!url && !text) return null;

  if (!url) {
    const width = 260;
    const height = 180;
    return { outcome: 'text', updates: {
      type: 'text', content: text, title: undefined, image: undefined, url: undefined,
      description: undefined, favicon: undefined, isParsing: false,
      width, height, x: card.x + (card.width - width) / 2, y: card.y + (card.height - height) / 2,
    } };
  }

  let metadata: { title?: string; image?: string; description?: string; favicon?: string } = {};
  try {
    const metaResponse = await fetch(`/api/fetch-metadata?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (metaResponse.ok) metadata = await metaResponse.json();
  } catch { /* Keep the recovered URL even if metadata is unavailable. */ }
  const width = 280;
  const size = metadata.image ? await previewSize(metadata.image) : null;
  const height = size ? Math.round(width * size.height / size.width + 68) : 90;
  return { outcome: 'link', updates: {
    type: 'web', url, title: metadata.title || result.title || url,
    image: size ? metadata.image : '',
    description: metadata.description || text,
    favicon: metadata.favicon || '', content: text, isParsing: false,
    width, height, x: card.x + (card.width - width) / 2, y: card.y + (card.height - height) / 2,
  } };
}
