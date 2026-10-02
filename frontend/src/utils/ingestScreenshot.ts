import { Card } from '../types';

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
  try {
    const dataUrl = await readImage(file);
    const size = await imageSize(dataUrl);
    const width = Math.min(size.width, 360);
    const height = width * size.height / size.width;
    const card = actions.createCard({ type: 'image', image: dataUrl, width, height,
      x: actions.position.x - width / 2, y: actions.position.y - height / 2 });
    fetch('/api/upload-asset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    }).then((response) => response.json()).then((asset) => {
      if (asset.success && asset.url && actions.getCard(card.id)?.type === 'image') {
        actions.updateCard(card.id, { image: asset.url });
      }
    }).catch(() => {});
  } catch {
    actions.showToast('图片读取失败');
  }
}
