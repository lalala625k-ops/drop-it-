import { Card, Group } from '../types';
import { normalizeTreeData } from './groupRelations';
import { restorePendingImages } from './pendingImages';

export const STORAGE_KEY = 'pinboard_cards_v1';

export const INITIAL_GUIDE_CARDS: Card[] = [
  {
    id: 'guide-1',
    type: 'text',
    x: -360,
    y: -180,
    width: 320,
    height: 220,
    zIndex: 1,
    content: `💡 随想便签 · 画布操作
• 鼠标中键/右键 或 Space+左键：漫游画布
• 鼠标滚轮：以光标为中心缩放画布
• 双击卡片：居中放大至 80% 视野，再双击还原
• 左下角地图：单击定位，拖框缩放；按住 M 查看大地图
• 空白处拖拽：拉出虚线框选（Shift 追加）`,
  },
  {
    id: 'guide-2',
    type: 'text',
    x: 40,
    y: -180,
    width: 320,
    height: 220,
    zIndex: 2,
    content: `⚡ 快捷摄入与操作
• Ctrl + V：光标处智能粘贴图片(OCR)、网址或纯文本
• Ctrl + N：光标处新建空白便签
• Ctrl + Alt + 左键拖动：等比缩放卡片尺寸
• Delete / Backspace：删除选中卡片或分组
• Ctrl + Z：撤销上一步操作`,
  },
  {
    id: 'guide-3',
    type: 'text',
    x: -360,
    y: 80,
    width: 320,
    height: 220,
    zIndex: 3,
    content: `📦 分组与整理
• 多选卡片 + Ctrl + G：快速打组
• Group 可收起、命名、拖动；右键添加标签
• Ctrl + J：新建圆形父物体并关联选中卡片
• 选中 Group + Ctrl + Shift + G：解散打组
• Ctrl + P：自动紧凑装箱排版
• Ctrl + 方向键：顶/底/左/右边缘对齐
• 拖拽按住 Shift + Space：开启 12px 磁吸对齐`,
  },
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
    const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    try {
      // Strip large Base64 images for LocalStorage backup only so metadata is never lost
      const slimCards = persistedCards.map((c) => {
        if (c.image && c.image.startsWith('data:image/') && c.image.length > 50000) {
          return { ...c, image: undefined };
        }
        return c;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, cards: slimCards }));
    } catch {
      console.warn('LocalStorage quota exceeded; local backup could not be updated.');
    }
  }
}

export function syncToBackend(cards: Card[], groups: Group[], revision?: number) {
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

export function flushStoredCards() {
  if (pendingState) {
    // The local pending snapshot is durable and will retry on next launch.
    pendingState = null;
  }
}

export async function loadInitialData(): Promise<{ cards: Card[]; groups: Group[] }> {
  const local = getLocalData();
  let serverData: { cards: Card[]; groups: Group[]; revision: number } | null = null;
  try {
    const response = await fetch('/api/cards');
    if (response.ok) serverData = await response.json();
  } catch { /* server offline */ }
  if (serverData) {
    serverRevision = serverData.revision || 0;
    syncedCards = withoutParsingState(serverData.cards || []);
    syncedGroups = serverData.groups || [];
    conflict = false;
  }
  if (local?.pendingSync) {
    lastRevision = Math.max(lastRevision, local.revision || 0);
    const cards = await restorePendingImages(local.cards);
    if (cards.some((card, index) => card.image !== local.cards[index].image)) {
      writeLocalData(cards, local.groups, local.revision, true, local.baseServerRevision ?? 0);
    }
    if (serverData && (local.baseServerRevision ?? 0) === serverRevision) {
      void syncToBackend(cards, local.groups, local.revision);
    } else if (serverData) {
      conflict = true;
      window.setTimeout(() => window.dispatchEvent(new Event('pinboard-sync-conflict')), 0);
    }
    return { cards, groups: local.groups };
  }

  // No unsynced local edits: load the server's current state.
  try {
    if (serverData) {
      const data = serverData;
      const serverCards = withoutParsingState(Array.isArray(data.cards) ? data.cards : (Array.isArray(data) ? data : []));
      const cards = await restorePendingImages(serverCards);
      const groups = Array.isArray(data.groups) ? data.groups : [];
      if (cards.length > 0 || groups.length > 0) {
        if (cards.some((card, index) => card.image !== serverCards[index].image)) {
          const revision = Math.max(Date.now(), lastRevision + 1);
          lastRevision = revision;
          writeLocalData(cards, groups, revision, true);
          void syncToBackend(cards, groups, revision);
        } else writeLocalData(cards, groups);
        return { cards, groups };
      }
    }
  } catch (e) {
    // 后端不可用或离线
  }

  // 2. 降级读取 LocalStorage
  if (local && (local.cards.length > 0 || local.groups.length > 0)) {
    return { cards: await restorePendingImages(local.cards), groups: local.groups };
  }

  // 3. 两者均为空时，加载初始内置引导卡片
  return { cards: INITIAL_GUIDE_CARDS, groups: [] };
}

export async function getRemoteRevision(): Promise<number | null> {
  try {
    const response = await fetch('/api/cards/revision');
    return response.ok ? (await response.json()).revision : null;
  } catch { return null; }
}

export function currentServerRevision() { return serverRevision; }

export function exportBackup(cards: Card[], groups: Group[]) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `随想便签备份_${dateStr}.json`;
  const data = JSON.stringify({ cards: withoutParsingState(cards), groups }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importBackupFromFile(file: File): Promise<{ cards: Card[]; groups: Group[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        let cards: Card[] = [];
        let groups: Group[] = [];
        if (Array.isArray(parsed)) {
          cards = withoutParsingState(parsed);
        } else if (parsed && typeof parsed === 'object') {
          cards = Array.isArray(parsed.cards) ? withoutParsingState(parsed.cards) : [];
          groups = Array.isArray(parsed.groups) ? parsed.groups : [];
        }
        const tree = normalizeTreeData(cards, groups);
        resolve({ cards: tree.cards, groups: tree.groups });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File reading failed'));
    reader.readAsText(file);
  });
}
