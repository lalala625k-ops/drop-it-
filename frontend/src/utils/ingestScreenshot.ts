import { Card } from '../types';
import { removePendingImage, storePendingImage } from './pendingImages';
import { screenshotSource } from './fileSource';

interface ImageActions {
  createCard: (data: Partial<Card>) => Card;
  updateCard: (id: string, data: Partial<Card>) => void;
  getCard: (id: string) => Card | undefined;
  showToast: (message: string) => void;
  position: { x: number; y: number };
  matchClipboardSource?: boolean;
}

const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(new Error('图片读取失败'));
  reader.readAsDataURL(file);
});

const imageSize = (src: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const image = new Image();
  const timeout = window.setTimeout(() => {
    image.onload = image.onerror = null;
    reject(new Error('图片读取超时'));
  }, 10000);
  image.referrerPolicy = 'no-referrer';
  image.onload = () => {
    window.clearTimeout(timeout);
    resolve({ width: image.naturalWidth, height: image.naturalHeight });
  };
  image.onerror = () => {
    window.clearTimeout(timeout);
    reject(new Error('图片读取失败'));
  };
  image.src = src;
});

export async function ingestScreenshot(file: File, actions: ImageActions) {
  let dataUrl: string;
  let size: { width: number; height: number };
  try {
    dataUrl = await readImage(file);
    size = await imageSize(dataUrl);
  } catch {
    actions.showToast('图片读取失败');
    return;
  }

  const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const backedUp = await storePendingImage(id, dataUrl);
  const width = Math.min(size.width, 360);
  const fileSource = actions.matchClipboardSource ? await screenshotSource(dataUrl) : undefined;
  const height = width * size.height / size.width + (fileSource ? 68 : 0);
  actions.createCard({ id, type: fileSource ? 'file' : 'image', fileSource, title: fileSource?.name,
    image: dataUrl, width, height,
    x: actions.position.x - width / 2, y: actions.position.y - height / 2 });

  let uploaded = false;
  try {
    const response = await fetch('/api/upload-asset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!response.ok) throw new Error('图片上传失败');
    const asset = await response.json();
    if (!asset.success || typeof asset.url !== 'string' || !asset.url.startsWith('/api/assets/')) {
      throw new Error('图片上传失败');
    }
    uploaded = true;
    // A successful upload response alone does not guarantee that the static
    // resource is readable. Keep the embedded original and its durable backup
    // until the URL has actually decoded as an image.
    await imageSize(asset.url);
    const current = actions.getCard(id);
    if (current && (current.type === 'image' || current.type === 'file')) {
      actions.updateCard(id, { image: asset.url,
        thumbnail: typeof asset.thumbnail_url === 'string' ? asset.thumbnail_url : undefined });
      window.setTimeout(() => { void removePendingImage(id); }, 2000);
    } else {
      void removePendingImage(id);
    }
  } catch {
    actions.showToast(uploaded
      ? '图片资源暂不可读，已保留本地原图'
      : backedUp ? '图片已暂存本地，后端未连接' : '图片已显示，但暂存失败；请启动后端');
  }
}
