import type { Card, FileSource } from '../types';

export type SourceAction = 'open-source' | 'associate-source' | 'remove-source';
interface SourceBridge {
  match_screenshot_source?: (image: string) => Promise<FileSource | null>;
  open_source_file?: (path: string) => Promise<{ success: boolean; error?: string }>;
  select_source_file?: () => Promise<{ success: boolean; source?: FileSource; error?: string } | null>;
}
const bridge = (): SourceBridge | undefined => (window as unknown as { pywebview?: { api?: SourceBridge } }).pywebview?.api;

export function validFileSource(source: unknown): source is FileSource {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
  const value = source as FileSource;
  return typeof value.path === 'string' && /^[a-z]:[\\/]/i.test(value.path) && !/[\0\r\n]/.test(value.path)
    && typeof value.name === 'string' && !!value.name && ['detected', 'selected'].includes(value.linkedBy)
    && (value.app == null || typeof value.app === 'string');
}

export async function screenshotSource(image: string): Promise<FileSource | undefined> {
  const api = bridge();
  if (!api?.match_screenshot_source) return;
  try {
    const source = await Promise.race([api.match_screenshot_source(image),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1000))]);
    return validFileSource(source) ? source : undefined;
  } catch { return; }
}

export async function openSource(source: FileSource) {
  const api = bridge();
  if (!api?.open_source_file) throw new Error('请在 Windows 桌面版打开本地来源文件');
  const result = await api.open_source_file(source.path);
  if (!result?.success) throw new Error(result?.error || '原文件打开失败，请重新关联');
}

export async function selectSource(): Promise<FileSource | undefined> {
  const api = bridge();
  if (!api?.select_source_file) throw new Error('请在 Windows 桌面版关联本地来源文件');
  const result = await api.select_source_file();
  if (!result) return;
  if (!result.success || !validFileSource(result.source)) throw new Error(result.error || '无法关联文件');
  return result.source;
}

export function sourceCardUpdates(card: Card, source?: FileSource): Partial<Card> {
  const footer = 68 * (card.contentScale || 1);
  const adding = !!source && !card.fileSource;
  const removing = !source && !!card.fileSource;
  const height = Math.max(20, card.height + (adding ? footer : removing ? -footer : 0));
  return { fileSource: source || null, type: card.type === 'text' ? 'text' : source ? 'file' : 'image',
    ...((adding || removing) ? { height,
      defaultHeight: Math.max(20, (card.defaultHeight || card.height / (card.contentScale || 1)) + (adding ? 68 : -68)) } : {}),
    ...(source && card.type !== 'text' ? { title: source.name } : {}),
    ...(removing && card.type !== 'text' && card.title === card.fileSource?.name ? { title: undefined } : {}) };
}

export function sourceError(error: unknown) {
  window.dispatchEvent(new CustomEvent('pinboard-file-error', { detail: error instanceof Error ? error.message : '来源文件操作失败' }));
}
