import type { Card } from '../types';
import type { CanvasClipboardSnapshot } from './canvasClipboard';
import { storePendingImage } from './pendingImages';

function isLocalImage(source: string): boolean {
  if (source.startsWith('blob:')) return true;
  try {
    const url = new URL(source, location.href);
    return url.origin === location.origin && /^\/api\/(assets|screenshots|thumbnails)\//.test(url.pathname);
  } catch { return false; }
}

async function embedImage(source: string): Promise<string> {
  const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('原图读取失败');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('原图读取失败');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('原图读取失败'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareClipboardImages(snapshot: CanvasClipboardSnapshot): Promise<CanvasClipboardSnapshot> {
  const images = new Map<string, Promise<string>>();
  const portable = (source: string) => {
    if (!images.has(source)) images.set(source, embedImage(source));
    return images.get(source)!;
  };
  const cards = await Promise.all(snapshot.cards.map(async (card) => {
    const copy = { ...card, isParsing: false };
    for (const field of ['image', 'thumbnail', 'favicon'] as const) {
      const source = copy[field];
      if (!source || !isLocalImage(source)) continue;
      if (field === 'thumbnail' && copy.image) copy.thumbnail = undefined;
      else copy[field] = await portable(source);
    }
    return copy;
  }));
  return { ...snapshot, cards };
}

export async function backUpClipboardImages(cards: Card[]): Promise<void> {
  await Promise.all(cards.filter((card) => card.image?.startsWith('data:image/'))
    .map((card) => storePendingImage(card.id, card.image!)));
}

export async function uploadClipboardImage(card: Card): Promise<Partial<Card> | null> {
  if (!card.image?.startsWith('data:image/')) return null;
  try {
    const response = await fetch('/api/upload-asset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: card.image }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const asset = await response.json();
    if (!asset.success || typeof asset.url !== 'string' || !asset.url.startsWith('/api/assets/')) return null;
    const readable = await new Promise<boolean>((resolve) => {
      const image = new Image();
      const timer = window.setTimeout(() => { image.onload = image.onerror = null; resolve(false); }, 10000);
      image.onload = () => { window.clearTimeout(timer); resolve(true); };
      image.onerror = () => { window.clearTimeout(timer); resolve(false); };
      image.src = asset.url;
    });
    if (!readable) return null;
    return { image: asset.url, thumbnail: asset.thumbnail_url || undefined };
  } catch { return null; }
}
