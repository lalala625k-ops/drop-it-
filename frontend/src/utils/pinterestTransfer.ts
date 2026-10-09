// Pinterest's current web client uses private drag formats instead of an HTTP
// URL for closeup images and some grid Pins. Only carry the content reference;
// tracking parameters from the source page are intentionally discarded.
export const PINTEREST_DRAG_TYPES = [
  'application/x-pinterest-closeup-image',
  'application/x-pinterest-pinrep',
] as const;

export interface PinterestTransfer {
  url: string;
  image?: string;
}

function pinId(value: unknown): string | null {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = String(value).trim();
  return /^[1-9]\d{0,29}$/.test(id) ? id : null;
}

function previewImage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password &&
        (url.hostname === 'pinimg.com' || url.hostname.endsWith('.pinimg.com'))) return url.href;
  } catch { /* Invalid preview URLs do not invalidate a usable Pin reference. */ }
  return undefined;
}

export function readPinterestTransfer(data: Pick<DataTransfer, 'getData'>): PinterestTransfer | null {
  for (const type of PINTEREST_DRAG_TYPES) {
    try {
      const payload = JSON.parse(data.getData(type));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
      const id = pinId(payload.pinId);
      if (id) return { url: `https://www.pinterest.com/pin/${id}/`, image: previewImage(payload.previewImageUrl) };
    } catch { /* Try the grid format or Pinterest's plain-text fallback. */ }
  }
  const id = pinId(data.getData('text/plain').trim().match(/^pinterest-pin:(\d+)$/)?.[1]);
  return id ? { url: `https://www.pinterest.com/pin/${id}/` } : null;
}
