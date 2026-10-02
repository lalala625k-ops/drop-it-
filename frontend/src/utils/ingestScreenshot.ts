import { Card } from '../types';
import { removePendingImage, storePendingImage } from './pendingImages';

interface ImageActions {
  createCard: (data: Partial<Card>) => Card;
  updateCard: (id: string, data: Partial<Card>) => void;
  getCard: (id: string) => Card | undefined;
  showToast: (message: string) => void;
  position: { x: number; y: number };
}

const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(new Error('图片读取失败'));
  reader.readAsDataURL(file);
});

const imageSize = (src: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
  image.onerror = () => reject(new Error('图片读取失败'));
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
  const height = width * size.height / size.width;
  actions.createCard({ id, type: 'image', image: dataUrl, width, height,
    x: actions.position.x - width / 2, y: actions.position.y - height / 2 });

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
    const current = actions.getCard(id);
    if (!current || current.type === 'image') {
      actions.updateCard(id, { image: asset.url });
      window.setTimeout(() => { void removePendingImage(id); }, 2000);
    } else {
      void removePendingImage(id);
    }
  } catch {
    actions.showToast(backedUp ? '图片已暂存本地，后端未连接' : '图片已显示，但暂存失败；请启动后端');
  }
}
