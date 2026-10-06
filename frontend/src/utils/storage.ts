import { Card, Group, Viewport } from '../types';
import type { CanvasPin } from '../hooks/useCanvasPins';
import { restorePendingImages } from './pendingImages';
import { browserBoardId, getWorkspaceId, setWorkspaceId, workspaceRequest, workspaceUrl, LoadedWorkspace } from './workspaceApi';
import { readWorkspaceCache, writeWorkspaceCache, sameWorkspaceObjects } from './workspaceCache';

export const STORAGE_KEY = 'pinboard_cards_v1';
const boardParams = new URLSearchParams(window.location.search);
const NEW_BOARD_MODE = boardParams.get('new-board') === '1';
const DESKTOP_MODE = boardParams.get('desktop') === '1';
const boardId = boardParams.get('board-id');
// A new board is intentionally isolated from the current workspace in both
// browser and desktop windows. It keeps its own localStorage key and must not
// overwrite the shared SQLite board while the second window is open.
const IS_EPHEMERAL_BROWSER_BOARD = !!browserBoardId;
const BOARD_STORAGE_KEY = NEW_BOARD_MODE && boardId
  ? `${STORAGE_KEY}_${boardId}` : STORAGE_KEY;
const TEMPLATE_MARKER = 'pinboard_project_template_loaded_v1';
const RELEASE_EMPTY = (import.meta as ImportMeta & { env?: { VITE_RELEASE_EMPTY?: string } })
  .env?.VITE_RELEASE_EMPTY === '1';

/**
 * The first empty workspace is a small, editable example file.  It replaces
 * the old tutorial flow while keeping the same canvas primitives users will
 * use for their own notes.
 */
export const INITIAL_GUIDE_CARDS: Card[] = [
  { id: 'guide-canvas-1', type: 'text', x: -520, y: -190, width: 230, height: 112, zIndex: 1, bundleId: 'guide-canvas', content: '画布漫游\n中键 / 右键拖动，或按住 Space + 左键。滚轮以光标为中心缩放。' },
  { id: 'guide-canvas-2', type: 'text', x: -265, y: -190, width: 230, height: 112, zIndex: 2, bundleId: 'guide-canvas', content: '快速摄入\nCtrl + V 粘贴图片、网页或文本；Ctrl + N 新建便签。' },
  { id: 'guide-canvas-3', type: 'text', x: -520, y: -45, width: 230, height: 112, zIndex: 3, bundleId: 'guide-canvas', content: '框选与编辑\n空白处拖拽框选，双击卡片进入编辑，完成后自动收起。' },

  { id: 'guide-organize-1', type: 'text', x: 115, y: -190, width: 230, height: 112, zIndex: 4, bundleId: 'guide-organize', content: '分组\n多选卡片后按 Ctrl + G，生成可折叠的 Group。' },
  { id: 'guide-organize-2', type: 'text', x: 370, y: -190, width: 230, height: 112, zIndex: 5, bundleId: 'guide-organize', content: '连接\n拖动连接点，把卡片或 Group 接到另一个节点。' },
  { id: 'guide-organize-3', type: 'text', x: 115, y: -45, width: 230, height: 112, zIndex: 6, bundleId: 'guide-organize', content: '原点\nCtrl + J 创建原点；它可以承载多个功能分组。' },

  { id: 'guide-layout-1', type: 'text', x: -520, y: 245, width: 230, height: 112, zIndex: 7, bundleId: 'guide-layout', content: '排版\nCtrl + P 自动整理；Ctrl + 方向键按边缘对齐。' },
  { id: 'guide-layout-2', type: 'text', x: -265, y: 245, width: 230, height: 112, zIndex: 8, bundleId: 'guide-layout', content: '导航\n图钉支持 Ctrl + 1~8 快速跳转；小地图用于定位。' },

  { id: 'guide-settings-1', type: 'text', x: 115, y: 245, width: 230, height: 112, zIndex: 9, bundleId: 'guide-settings', content: '设置\n打开设置面板调整快捷键、外观和画布行为。' },
  { id: 'guide-settings-2', type: 'text', x: 370, y: 245, width: 230, height: 112, zIndex: 10, bundleId: 'guide-settings', content: '存储\nCtrl + S 保存 .drop 文件；Ctrl + Shift + S 存为，选择文件位置与名称。' },
];

export const INITIAL_GUIDE_GROUPS: Group[] = [
  { id: 'guide-dropit', title: 'DROP-IT', kind: 'parent', x: -35, y: 35, width: 140, height: 140, color: '#FACB0E', zIndex: 100 },
  { id: 'guide-canvas', title: '画布与摄入', kind: 'bundle', x: -545, y: -220, width: 540, height: 420, parentIds: ['guide-dropit'], outlinePadding: 18, zIndex: 20 },
  { id: 'guide-organize', title: '分组与连接', kind: 'bundle', x: 90, y: -220, width: 540, height: 420, parentIds: ['guide-dropit'], outlinePadding: 18, zIndex: 21 },
  { id: 'guide-layout', title: '排版与导航', kind: 'bundle', x: -545, y: 215, width: 540, height: 220, parentIds: ['guide-dropit'], outlinePadding: 18, zIndex: 22 },
  { id: 'guide-settings', title: '设置与归档', kind: 'bundle', x: 90, y: 215, width: 540, height: 220, parentIds: ['guide-dropit'], outlinePadding: 18, zIndex: 23 },
];

let debounceTimer: number | null = null;
let pendingState: { cards: Card[]; groups: Group[]; revision: number } | null = null;
let lastRevision = 0;
let syncQueue: Promise<void> = Promise.resolve();
let serverRevision = 0;
let syncedCards: Card[] = [];
let syncedGroups: Group[] = [];
let conflict = false;

interface StoredData {
  cards: Card[];
  groups: Group[];
  revision?: number;
  pendingSync?: boolean;
  baseServerRevision?: number;
}

function withoutParsingState(cards: Card[]): Card[] {
  return cards.map(({ isParsing: _isParsing, ...card }) => card);
}

export function getLocalData(): StoredData | null {
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { cards: withoutParsingState(parsed), groups: [] };
    }
    return {
      cards: Array.isArray(parsed.cards) ? withoutParsingState(parsed.cards) : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      revision: typeof parsed.revision === 'number' ? parsed.revision : undefined,
      pendingSync: parsed.pendingSync === true,
      baseServerRevision: typeof parsed.baseServerRevision === 'number' ? parsed.baseServerRevision : undefined,
    };
  } catch (e) {
    console.error('Failed to read localStorage:', e);
    return null;
  }
}

export function writeLocalData(cards: Card[], groups: Group[], revision?: number, pendingSync = false, baseRevision = serverRevision) {
  const persistedCards = withoutParsingState(cards);
  const data = { cards: persistedCards, groups, revision, pendingSync, baseServerRevision: baseRevision };
  try {
    localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    try {
      // Strip large Base64 images for LocalStorage backup only so metadata is never lost
      const slimCards = persistedCards.map((c) => {
        if (c.image && c.image.startsWith('data:image/') && c.image.length > 50000) {
          return { ...c, image: undefined };
        }
        return c;
      });
      localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify({ ...data, cards: slimCards }));
    } catch {
      console.warn('LocalStorage quota exceeded; local backup could not be updated.');
    }
  }
}

export function syncToBackend(cards: Card[], groups: Group[], revision?: number) {
  if (IS_EPHEMERAL_BROWSER_BOARD) return Promise.resolve();
  // Serialize writes and send only changed objects. Never overwrite an unknown revision.
  syncQueue = syncQueue.then(async () => {
    if (conflict) return;
    try {
      const oldCards = new Map(syncedCards.map((item) => [item.id, JSON.stringify(item)]));
      const oldGroups = new Map(syncedGroups.map((item) => [item.id, JSON.stringify(item)]));
      const nextCards = withoutParsingState(cards);
      const nextCardIds = new Set(nextCards.map((item) => item.id));
      const nextGroupIds = new Set(groups.map((item) => item.id));
      const upsertCards = nextCards.filter((item) => oldCards.get(item.id) !== JSON.stringify(item));
      const upsertGroups = groups.filter((item) => oldGroups.get(item.id) !== JSON.stringify(item));
      const deleteCardIds = syncedCards.filter((item) => !nextCardIds.has(item.id)).map((item) => item.id);
      const deleteGroupIds = syncedGroups.filter((item) => !nextGroupIds.has(item.id)).map((item) => item.id);
      if (!upsertCards.length && !upsertGroups.length && !deleteCardIds.length && !deleteGroupIds.length) {
        const local = getLocalData();
        if (local?.pendingSync && local.revision === revision) writeLocalData(local.cards, local.groups, revision, false);
        return;
      }
      const response = await fetch('/api/cards/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseRevision: serverRevision,
          upsertCards, upsertGroups, deleteCardIds, deleteGroupIds,
        }),
      });
      if (response.status === 409) {
        conflict = true;
        window.dispatchEvent(new Event('pinboard-sync-conflict'));
        return;
      }
      if (!response.ok) return;
      const result = await response.json();
      serverRevision = result.revision;
      syncedCards = nextCards;
      syncedGroups = groups;
      const cache = readWorkspaceCache();
      if (cache?.workspace_id === getWorkspaceId()) {
        writeWorkspaceCache({ ...cache, database_revision: serverRevision });
      }
      const local = getLocalData();
      if (local?.pendingSync && local.revision === revision) {
        writeLocalData(local.cards, local.groups, revision, false);
      }
    } catch {
      // Keep the local pending flag so the next load retries this state.
    }
  });
  return syncQueue;
}

export function saveStateDebounced(cards: Card[], groups: Group[], delay = 400) {
  const revision = Math.max(Date.now(), lastRevision + 1);
  lastRevision = revision;
  pendingState = { cards, groups, revision };
  writeLocalData(cards, groups, revision, true);

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    if (pendingState) {
      syncToBackend(pendingState.cards, pendingState.groups, pendingState.revision);
      pendingState = null;
    }
    debounceTimer = null;
  }, delay);
}

type DropSaveResult = { success: true; path: string; filename: string }
  | { success: false; cancelled: true };

export type DropOpenResult = {
  success: true;
  path: string;
  filename: string;
  cards: Card[];
  groups: Group[];
  viewport?: { x: number; y: number; zoom: number } | null;
  pins?: CanvasPin[];
  revision?: number;
  workspace_id?: string;
} | { success: false; cancelled: true };

export async function saveDropFile(
  cards: Card[],
  groups: Group[],
  viewport?: { x: number; y: number; zoom: number },
  pins?: unknown[],
  saveAs = false,
): Promise<DropSaveResult> {
  const payload = {
    cards: withoutParsingState(cards),
    groups,
    viewport,
    pins,
    save_as: saveAs,
  };

  let response: Response;
  try {
    response = await fetch(workspaceUrl('/api/storage/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(error instanceof Error ? `无法连接保存服务：${error.message}` : '无法连接保存服务');
  }

  const data = await response.json().catch(() => ({}));
  if (response.ok && data.cancelled) return { success: false, cancelled: true };
  // A download request cannot confirm where a file was written. Only the
  // backend's completed disk write may produce a save-success notification.
  if (response.ok && data.success && typeof data.path === 'string' && data.path) {
    return data as { success: true; path: string; filename: string };
  }
  if (response.status === 404 || response.status === 405) {
    throw new Error('保存服务需要更新，请重新启动应用');
  }
  throw new Error(typeof data.detail === 'string'
    ? data.detail
    : `保存服务返回异常（HTTP ${response.status}）`);
}

export async function openDropFile(): Promise<DropOpenResult> {
  let response: Response;
  try {
    response = await fetch(workspaceUrl('/api/storage/open'), { method: 'POST' });
  } catch (error) {
    throw new Error(error instanceof Error ? `无法连接打开服务：${error.message}` : '无法连接打开服务');
  }
  const data = await response.json().catch(() => ({}));
  if (response.ok && data.cancelled) return { success: false, cancelled: true };
  if (response.ok && data.success && Array.isArray(data.cards) && Array.isArray(data.groups)) {
    return data as DropOpenResult & { success: true };
  }
  if (response.status === 404 || response.status === 405) {
    throw new Error('打开服务需要更新，请重新启动应用');
  }
  throw new Error(typeof data.detail === 'string'
    ? data.detail
    : `打开服务返回异常（HTTP ${response.status}）`);
}

/** Adopt a workspace returned by the native open dialog for subsequent saves. */
export function acceptLoadedWorkspace(cards: Card[], groups: Group[], revision?: number, workspaceId?: string) {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = null;
  pendingState = null;
  if (workspaceId) setWorkspaceId(workspaceId);
  syncedCards = withoutParsingState(cards);
  syncedGroups = groups;
  serverRevision = typeof revision === 'number' ? revision : serverRevision;
  lastRevision = Math.max(lastRevision, serverRevision);
  conflict = false;
  writeLocalData(cards, groups);
}

export function flushStoredCards() {
  if (pendingState) {
    // The local pending snapshot is durable and will retry on next launch.
    pendingState = null;
  }
}

export async function flushWorkspaceSync(cards: Card[], groups: Group[]) {
  if (IS_EPHEMERAL_BROWSER_BOARD) return;
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = null;
  pendingState = null;
  const revision = Math.max(Date.now(), lastRevision + 1);
  lastRevision = revision;
  writeLocalData(cards, groups, revision, true);
  await syncToBackend(cards, groups, revision);
  if (conflict || getLocalData()?.pendingSync) throw new Error('工作区同步未完成，本地修改仍保留');
}

export async function loadInitialData(): Promise<{ cards: Card[]; groups: Group[]; viewport?: Viewport; pins?: CanvasPin[] }> {
  let local = getLocalData();
  let serverData: LoadedWorkspace | null = null;
  try {
    serverData = await workspaceRequest<LoadedWorkspace>('/api/workspace/current');
    setWorkspaceId(serverData.workspace_id);
  } catch { /* server offline */ }
  if (serverData) {
    serverRevision = serverData.revision || 0;
    syncedCards = withoutParsingState(serverData.cards || []);
    syncedGroups = serverData.groups || [];
    conflict = false;
  }
  const cache = readWorkspaceCache();
  if (serverData && cache && cache.workspace_id !== serverData.workspace_id) local = null;
  if (cache?.pending_draft && (!serverData || cache.workspace_id === serverData.workspace_id)) {
    setWorkspaceId(cache.workspace_id);
    const cards = await restorePendingImages(cache.cards);
    const ownCheckpoint = serverData?.draft_client_revision === cache.client_revision;
    const acknowledged = serverData && sameWorkspaceObjects({ ...cache, cards }, serverData);
    if (ownCheckpoint || acknowledged) writeLocalData(cards, cache.groups, cache.client_revision, false);
    if (serverData && cache.database_revision !== serverRevision && local?.pendingSync && !ownCheckpoint && !acknowledged) {
      conflict = true;
      window.setTimeout(() => window.dispatchEvent(new Event('pinboard-sync-conflict')), 0);
    }
    return { cards, groups: cache.groups, viewport: cache.viewport || undefined, pins: cache.pins };
  }
  if (local?.pendingSync) {
    lastRevision = Math.max(lastRevision, local.revision || 0);
    const cards = await restorePendingImages(local.cards);
    if (cards.some((card, index) => card.image !== local.cards[index].image)) {
      writeLocalData(cards, local.groups, local.revision, true, local.baseServerRevision ?? 0);
    }
    if (serverData && sameWorkspaceObjects({ cards, groups: local.groups, pins: [] }, serverData)) {
      writeLocalData(cards, local.groups, local.revision, false);
    } else if (serverData && (local.baseServerRevision ?? 0) === serverRevision) {
      void syncToBackend(cards, local.groups, local.revision);
    } else if (serverData) {
      conflict = true;
      window.setTimeout(() => window.dispatchEvent(new Event('pinboard-sync-conflict')), 0);
    }
    return { cards, groups: local.groups, viewport: cache?.viewport || serverData?.viewport || undefined,
      pins: cache?.pins || serverData?.pins || [] };
  }

  if (NEW_BOARD_MODE && !serverData?.initialized) return { cards: [], groups: [], pins: [] };

  // No unsynced local edits: load the server's current state.
  try {
    if (serverData) {
      const data = serverData;
      const serverCards = withoutParsingState(Array.isArray(data.cards) ? data.cards : (Array.isArray(data) ? data : []));
      const cards = await restorePendingImages(serverCards);
      const groups = Array.isArray(data.groups) ? data.groups : [];
      if (data.initialized || cards.length > 0 || groups.length > 0) {
        if (cards.some((card, index) => card.image !== serverCards[index].image)) {
          const revision = Math.max(Date.now(), lastRevision + 1);
          lastRevision = revision;
          writeLocalData(cards, groups, revision, true);
          void syncToBackend(cards, groups, revision);
        } else writeLocalData(cards, groups);
        return { cards, groups, viewport: data.viewport || undefined, pins: data.pins || [] };
      }
    }
  } catch (e) {
    // 后端不可用或离线
  }

  // 2. 降级读取 LocalStorage
  if (cache && (!serverData || cache.workspace_id === serverData.workspace_id)) {
    setWorkspaceId(cache.workspace_id);
    return { cards: await restorePendingImages(cache.cards), groups: cache.groups,
      viewport: cache.viewport || undefined, pins: cache.pins };
  }
  if (local && (local.cards.length > 0 || local.groups.length > 0)) {
    return { cards: await restorePendingImages(local.cards), groups: local.groups, pins: serverData?.pins || [] };
  }

  // If the database is empty, recover the last explicit .drop save before
  // showing the built-in first-run example.
  try {
      const dropResponse = await fetch('/api/storage/load');
      if (dropResponse.ok) {
        const drop = await dropResponse.json();
        if (drop.success && drop.is_template && localStorage.getItem(TEMPLATE_MARKER) === '1') {
          return { cards: [], groups: [] };
        }
        if (drop.success && (drop.cards?.length > 0 || drop.groups?.length > 0)) {
          if (drop.is_template) localStorage.setItem(TEMPLATE_MARKER, '1');
          const cards = await restorePendingImages(drop.cards || []);
          const groups = drop.groups || [];
          // Keep the first-run example after refresh, including before the
          // initial backend write finishes.
          saveStateDebounced(cards, groups);
          return { cards, groups, viewport: drop.viewport, pins: Array.isArray(drop.pins) ? drop.pins : [] };
        }
      }
  } catch { /* storage endpoint unavailable */ }

  // 3. 两者均为空时，加载可编辑的 DROP-IT 示例画布
  return RELEASE_EMPTY || DESKTOP_MODE
    ? { cards: [], groups: [] }
    : { cards: INITIAL_GUIDE_CARDS, groups: INITIAL_GUIDE_GROUPS };
}

export async function getRemoteRevision(): Promise<number | null> {
  if (IS_EPHEMERAL_BROWSER_BOARD) return null;
  try {
    const response = await fetch('/api/cards/revision');
    return response.ok ? (await response.json()).revision : null;
  } catch { return null; }
}

export function currentServerRevision() { return serverRevision; }
