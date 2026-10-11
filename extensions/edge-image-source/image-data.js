import { MAX_BYTES, MAX_PIXELS } from './core.js';

export async function imageBlob(url) {
  if (!/^(?:https?:|data:image\/|blob:)/i.test(url)) throw new Error('此图片地址类型不受支持。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { credentials: 'include', signal: controller.signal });
    if (!response.ok) throw new Error(`图片服务器返回 HTTP ${response.status}。`);
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('图片超过 24 MB，未复制。');
    const type = response.headers.get('content-type')?.split(';')[0] || '';
    if (type.startsWith('text/') && type !== 'text/xml') throw new Error('服务器返回了网页内容，未取得图片。');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('图片超过 24 MB，未复制。');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (!size) throw new Error('图片数据为空。');
    return new Blob(chunks, { type });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('图片下载超时，请稍后重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('无法读取图片数据。'));
    reader.readAsDataURL(blob);
  });
}

async function decodedImage(blob) {
  try {
    return await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      return image;
    } catch {
      throw new Error('图片格式无法解码，或服务器返回了无效图片。');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function asPng(blob) {
  const image = await decodedImage(blob);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  let canvas;
  try {
    if (!width || !height) throw new Error('图片尺寸无效。');
    if (width * height > MAX_PIXELS) throw new Error('图片超过 4000 万像素，未复制；请选取较小的图片。');
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png || png.size > MAX_BYTES) throw new Error('转换后的 PNG 超过 24 MB 或转换失败，未复制。');
    const encoded = await dataUrl(png);
    const scale = Math.min(1, 480 / width, 480 / height);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL('image/png');
    return { png, dataUrl: encoded, preview, width, height };
  } finally {
    image.close?.();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
