import type { Card, Group, Viewport } from '../types';
import type { CanvasPin } from '../hooks/useCanvasPins';

const params = new URLSearchParams(location.search);
export const browserBoardId = params.get('new-board') === '1' && params.get('desktop') !== '1'
  ? params.get('board-id') : null;
export const workspaceUrl = (path: string) => browserBoardId ? `${path}?board_id=${encodeURIComponent(browserBoardId)}` : path;

export interface WorkspaceState { cards: Card[]; groups: Group[]; viewport?: Viewport | null; pins: CanvasPin[] }
export interface LoadedWorkspace extends WorkspaceState {
  success: boolean; workspace_id: string; revision: number; source_path?: string | null; initialized?: boolean;
  draft_client_revision?: number | null;
}
export interface FileSettings {
  save_dir: string; temp_dir: string; autosave_enabled: boolean; idle_seconds: number;
  max_seconds: number; retention_count: number; defaults: Omit<FileSettings, 'defaults' | 'migration_error'>;
  migration_error?: string;
}
export interface RecoveryRecord {
  workspace_id: string; snapshot_id: string; saved_at: string; name: string; source_path?: string; card_count: number;
}
let activeWorkspaceId = '';
export const getWorkspaceId = () => activeWorkspaceId;
export const setWorkspaceId = (id: string) => { activeWorkspaceId = id; };

export async function workspaceRequest<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(workspaceUrl(path), body === undefined ? undefined : {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || `服务返回异常（HTTP ${response.status}）`);
  return result as T;
}

export const getFileSettings = () => workspaceRequest<FileSettings>('/api/settings/files');
export async function changeFileSettings(changes: Partial<Omit<FileSettings, 'defaults'>>) {
  const result = await workspaceRequest<FileSettings>('/api/settings/files', changes, 'PATCH');
  window.dispatchEvent(new CustomEvent('pinboard-file-settings', { detail: result }));
  return result;
}

let flushHandler: (() => Promise<void>) | null = null;
export const setDraftFlushHandler = (handler: (() => Promise<void>) | null) => { flushHandler = handler; };
export async function flushWorkspaceDraft() {
  if (!flushHandler) throw new Error('画板尚未载入完成，请稍候');
  await flushHandler();
}
