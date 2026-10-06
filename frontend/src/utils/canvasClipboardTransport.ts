import type { CanvasPin, Card, Group } from '../types';
import { CanvasClipboardSnapshot, cardImageToPngBlob, getExternalClipboardText } from './canvasClipboard';

export const CANVAS_CLIPBOARD_MIME = 'web application/x-infinite-canvas+json';
const HTML_ATTRIBUTE = 'data-infinite-canvas-clipboard';
const TYPE = 'infinite-canvas-objects';

export function serializeClipboardSnapshot(snapshot: CanvasClipboardSnapshot): string {
  // Emit the same optional-field representation as a newly created card.
  // Older windows reject backend nulls before they can recover the full HTML
  // snapshot, then fall back to the external plain-text representation.
  return JSON.stringify({ __type: TYPE, version: 1, ...snapshot,
    cards: snapshot.cards.map((card) => card && normalizeOptionalFields(card)),
    groups: snapshot.groups.map((group) => group && normalizeOptionalFields(group)),
  });
}

// Persisted backend records use null for absent optional fields. Normalize
// those fields while preserving explicit empty links and reminder semantics.
function normalizeOptionalFields<T extends object>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([field, value]) =>
    value !== null || ['groupId', 'bundleId', 'reminder'].includes(field))) as T;
}

export function parseClipboardSnapshot(raw: string): CanvasClipboardSnapshot | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const record = (value: unknown): value is Record<string, unknown> =>
      !!value && typeof value === 'object' && !Array.isArray(value);
    const box = (value: unknown) => record(value) && typeof value.id === 'string' && !!value.id &&
      ['x', 'y', 'width', 'height'].every((field) => typeof value[field] === 'number' && Number.isFinite(value[field])) &&
      (value.width as number) > 0 && (value.height as number) > 0;
    const fields = (value: Record<string, unknown>, strings: string[], links: string[]) =>
      strings.every((field) => value[field] == null || typeof value[field] === 'string') &&
      links.every((field) => value[field] == null || typeof value[field] === 'string') &&
      (value.tags == null || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string')));
    const numbers = (value: unknown, keys: string[]) => record(value) && keys.every((key) =>
      value[key] == null || (typeof value[key] === 'number' && Number.isFinite(value[key])));
    const booleans = (value: unknown, keys: string[]) => record(value) && keys.every((key) =>
      value[key] == null || typeof value[key] === 'boolean');
    const validCard = (card: Card) => box(card) && ['text', 'web', 'image'].includes(card.type) &&
      Number.isFinite(card.zIndex) && numbers(card, ['defaultWidth', 'defaultHeight', 'contentScale']) &&
      booleans(card, ['sizeLocked', 'isParsing']) && fields(card as unknown as Record<string, unknown>,
        ['content', 'title', 'headerTitle', 'url', 'image', 'thumbnail', 'description', 'favicon', 'color', 'textColor', 'borderColor'],
        ['groupId', 'bundleId', 'reminder']);
    const validGroup = (group: Group) => box(group) && typeof group.title === 'string' &&
      (group.kind == null || ['parent', 'bundle'].includes(group.kind)) &&
      numbers(group, ['zIndex', 'outlinePadding']) && booleans(group, ['collapsed']) &&
      (group.parentIds == null || (Array.isArray(group.parentIds) && group.parentIds.every((id) => typeof id === 'string'))) &&
      fields(group as unknown as Record<string, unknown>, ['color', 'textColor', 'borderColor'], ['reminder']);
    const validPin = (pin: CanvasPin) => record(pin) && typeof pin.id === 'string' && !!pin.id &&
      Number.isInteger(pin.index) && pin.index >= 1 && pin.index <= 8 &&
      ['x', 'y', 'createdAt'].every((key) => typeof pin[key as keyof CanvasPin] === 'number' && Number.isFinite(pin[key as keyof CanvasPin])) &&
      (pin.zoom == null || (typeof pin.zoom === 'number' && Number.isFinite(pin.zoom) && pin.zoom > 0));
    if (!record(data) || data.__type !== TYPE || data.version !== 1 ||
        !Array.isArray(data.cards) || !Array.isArray(data.groups) ||
        !data.cards.every(validCard) || !data.groups.every(validGroup) ||
        (data.pins !== undefined && (!Array.isArray(data.pins) || !data.pins.every(validPin))) ||
        (!data.cards.length && !data.groups.length && !data.pins?.length)) return null;
    if (data.pins && new Set(data.pins.map((pin: CanvasPin) => pin.index)).size !== data.pins.length) return null;
    const ids = [...data.cards, ...data.groups, ...(data.pins || [])].map((object) => object.id);
    if (new Set(ids).size !== ids.length) return null;
    return { cards: data.cards.map(normalizeOptionalFields), groups: data.groups.map(normalizeOptionalFields),
      ...(data.pins ? { pins: data.pins.map(normalizeOptionalFields) } : {}),
      sourceContext: typeof data.sourceContext === 'string' ? data.sourceContext : undefined };
  } catch { return null; }
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function clipboardSnapshotHtml(snapshot: CanvasClipboardSnapshot): string {
  const payload = escapeHtml(encodeURIComponent(serializeClipboardSnapshot(snapshot)));
  const imagesOnly = snapshot.cards.length > 0 && !snapshot.groups.length && !snapshot.pins?.length &&
    snapshot.cards.every((card) => card.type === 'image' && card.image);
  const content = imagesOnly
    ? snapshot.cards.map((card) => `<img src="${escapeHtml(card.image!)}">`).join('')
    : `<pre>${escapeHtml(getExternalClipboardText(snapshot))}</pre>`;
  return `<div ${HTML_ATTRIBUTE}="${payload}">${content}</div>`;
}

export function readClipboardSnapshot(data: Pick<DataTransfer, 'getData'>): CanvasClipboardSnapshot | null {
  const custom = parseClipboardSnapshot(data.getData(CANVAS_CLIPBOARD_MIME) ||
    data.getData(CANVAS_CLIPBOARD_MIME.replace(/^web /, '')));
  if (custom) return custom;
  const html = data.getData('text/html');
  if (html) {
    try {
      const document = new DOMParser().parseFromString(html, 'text/html');
      const payload = document.querySelector(`[${HTML_ATTRIBUTE}]`)?.getAttribute(HTML_ATTRIBUTE);
      const snapshot = payload && parseClipboardSnapshot(decodeURIComponent(payload));
      if (snapshot) return snapshot;
    } catch { /* Malformed markers fall through to normal external content. */ }
  }
  return parseClipboardSnapshot(data.getData('text/plain'));
}

export function hasCanvasClipboardPayload(data: Pick<DataTransfer, 'getData'>): boolean {
  if (data.getData(CANVAS_CLIPBOARD_MIME) || data.getData(CANVAS_CLIPBOARD_MIME.replace(/^web /, ''))) return true;
  const html = data.getData('text/html');
  if (html) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    if (document.querySelector(`[${HTML_ATTRIBUTE}]`)) return true;
  }
  try { return JSON.parse(data.getData('text/plain')).__type === TYPE; }
  catch { return false; }
}

// Use standard HTML for the complete snapshot: WebView2 can leave writes with
// custom MIME types pending indefinitely. Plain text / PNG remain interoperable.
export async function writeClipboardSnapshot(snapshot: CanvasClipboardSnapshot): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('系统剪贴板不支持完整便签数据');
  }
  const plain = getExternalClipboardText(snapshot) || '[随想便签画布对象]';
  const formats: Record<string, Blob> = {
    'text/html': new Blob([clipboardSnapshotHtml(snapshot)], { type: 'text/html' }),
  };
  const image = snapshot.cards.find((card) => card.type === 'image' && card.image)?.image;
  if (image) {
    const png = await cardImageToPngBlob(image);
    if (png?.type === 'image/png') formats['image/png'] = png;
  }
  // Image-only selections must not add a title/path prefix when pasted into
  // messengers. The HTML also renders the image for editors preferring HTML.
  if (!formats['image/png'] || snapshot.groups.length || snapshot.pins?.length || snapshot.cards.some((card) => card.type !== 'image')) {
    formats['text/plain'] = new Blob([plain], { type: 'text/plain' });
  }
  await navigator.clipboard.write([new ClipboardItem(formats)]);
}
