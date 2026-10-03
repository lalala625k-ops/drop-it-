import { Card } from '../types';
import { manualSearchFallback } from './manualSearch';

export type ImageRecognitionMode = 'ocr' | 'link';

export interface RecognitionDiagnostic {
  name: string;
  status: string;
  detail?: string;
  url?: string;
  port?: number | null;
  http_status?: number | null;
}

export interface RecognitionReport {
  id: string;
  at: string;
  cardId: string;
  mode: ImageRecognitionMode;
  status: string;
  reason: string;
  elapsedMs?: number;
  events: RecognitionDiagnostic[];
  clues?: ReverseResolution['clues'];
  candidates?: ReverseCandidate[];
  searchPage?: string;
  manualSearch?: ReverseResolution['manual_search'];
  finalUrl?: string;
}

export interface ReverseCandidate {
  url: string;
  title: string;
  author: string;
  source: 'site' | 'domain';
  score: number;
}

export interface ReverseResolution {
  status: 'matched' | 'candidates' | 'not_found' | 'error';
  reason: string;
  stages: { name: string; status: string }[];
  candidates: ReverseCandidate[];
  search_page?: string | null;
  manual_search?: { url: string; query: string; platform: string; kind: 'site' | 'domain' | 'web' } | null;
  clues?: { platform?: string; site_domain?: string; title?: string; author?: string;
    id?: string; distinctive_text?: string; search_query?: string };
}

export type ImageRecognitionResult =
  | { kind: 'converted'; updates: Partial<Card>; outcome: 'text' | 'link' }
  | { kind: 'review'; resolution: ReverseResolution; text: string };

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

export async function recognizeCardImage(card: Card, mode: ImageRecognitionMode,
  onReport?: (report: RecognitionReport) => void): Promise<ImageRecognitionResult | null> {
  if (!card.image) throw new Error('图片内容不存在');
  const started = performance.now();
  const path = mode === 'link' ? '/api/resolve-image' : '/api/recognize-image';
  const events: RecognitionDiagnostic[] = [];
  const base = `${window.location.origin}${path}`;
  const emit = (status: string, reason: string, result?: any, finalUrl?: string) => onReport?.({
    id: `${Date.now()}-${Math.random()}`, at: new Date().toLocaleTimeString(), cardId: card.id,
    mode, status, reason, elapsedMs: Math.round(performance.now() - started),
    events: [...events.slice(0, 1), ...(result?.diagnostics || []), ...events.slice(1)], clues: result?.resolution?.clues,
    candidates: result?.resolution?.candidates, finalUrl,
    searchPage: result?.resolution?.search_page,
    manualSearch: mode === 'link' && !finalUrl
      ? result?.resolution?.manual_search || manualSearchFallback(result?.resolution?.clues, result?.text || '')
      : undefined,
  });
  const body = await imageRequestBody(card.image);
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: typeof body === 'string' ? { 'Content-Type': 'application/json' } : undefined,
      body,
      signal: AbortSignal.timeout(mode === 'link' ? 120000 : 60000),
    });
  } catch (error) {
    events.push({ name: 'api_request', status: 'failed', detail: '浏览器请求失败或超时', url: base,
      port: Number(window.location.port) || 80 });
    emit('error', '无法取得后端响应');
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('溯源请求超时，原图片已保留');
    }
    throw new Error('识别服务暂时无法连接，原图片已保留');
  }
  events.push({ name: 'api_request', status: response.ok ? 'completed' : 'failed',
    detail: '浏览器 → Vite 代理 → 后端 127.0.0.1:8002', url: base,
    port: Number(window.location.port) || 80, http_status: response.status });
  if (!response.ok) { emit('error', `图片识别失败（HTTP ${response.status}）`);
    throw new Error(`图片识别失败（HTTP ${response.status}）`); }
  const result = await response.json();
  if (mode === 'link' && !result.url) {
    result.resolution = result.resolution || {
      status: 'error', reason: result.error || '未找到可信原链接', stages: [], candidates: [],
    };
    result.resolution.manual_search ||= manualSearchFallback(result.resolution.clues, result.text || '');
  }
  if (mode === 'ocr' && !result.success) { emit('error', result.error || 'OCR 识别失败', result);
    throw new Error(result.error || 'OCR 识别失败'); }
  const text = typeof result.text === 'string' ? result.text.trim() : '';
  const url = mode === 'link' && typeof result.url === 'string' ? result.url.trim() : '';
  if (mode === 'link' && !url) {
    emit(result.resolution?.status || 'error', result.resolution?.reason || '未找到可信原链接', result);
    return { kind: 'review', text, resolution: result.resolution || {
      status: 'error', reason: result.error || '未找到可信原链接', stages: [], candidates: [],
    } };
  }
  if (!url && !text) { emit('not_found', '未识别到文字', result); return null; }

  if (!url) {
    emit('matched', `OCR 提取 ${result.count || 0} 行文字，已创建文本卡片`, result);
    const width = 260;
    const height = 180;
    return { kind: 'converted', outcome: 'text', updates: {
      type: 'text', content: text, title: undefined, image: undefined, url: undefined,
      description: undefined, favicon: undefined, isParsing: false,
      width, height, x: card.x + (card.width - width) / 2, y: card.y + (card.height - height) / 2,
    } };
  }

  const updates = await buildLinkCardUpdates(card, url, result.resolution?.clues?.title || result.title || url, text,
    (event) => events.push(event));
  emit('matched', result.resolution?.reason || '已恢复原链接', result, url);
  return { kind: 'converted', outcome: 'link', updates };
}

export async function buildLinkCardUpdates(card: Card, url: string, fallbackTitle: string,
                                           text: string, onDiagnostic?: (event: RecognitionDiagnostic) => void): Promise<Partial<Card>> {
  let metadata: { title?: string; image?: string; description?: string; favicon?: string } = {};
  try {
    const metaResponse = await fetch(`/api/fetch-metadata?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(30000),
    });
    onDiagnostic?.({ name: 'metadata', status: metaResponse.ok ? 'completed' : 'failed',
      detail: `网页元数据 HTTP ${metaResponse.status}`, url: `${window.location.origin}/api/fetch-metadata`,
      port: Number(window.location.port) || 80, http_status: metaResponse.status });
    if (metaResponse.ok) metadata = await metaResponse.json();
  } catch { onDiagnostic?.({ name: 'metadata', status: 'failed', detail: '元数据请求失败或超时，保留已确认链接',
    url: `${window.location.origin}/api/fetch-metadata`, port: Number(window.location.port) || 80 }); }
  const width = 280;
  const size = metadata.image ? await previewSize(metadata.image) : null;
  const height = size ? Math.round(width * size.height / size.width + 68) : 90;
  return {
    type: 'web', url, title: metadata.title || fallbackTitle || url,
    image: size ? metadata.image : '',
    description: metadata.description || text,
    favicon: metadata.favicon || '', content: text, isParsing: false,
    width, height, x: card.x + (card.width - width) / 2, y: card.y + (card.height - height) / 2,
  };
}
