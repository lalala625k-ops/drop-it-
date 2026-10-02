import { Card, Group } from '../types';

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
let pendingState: { cards: Card[]; groups: Group[] } | null = null;

function withoutParsingState(cards: Card[]): Card[] {
  return cards.map(({ isParsing: _isParsing, ...card }) => card);
}

export function getLocalData(): { cards: Card[]; groups: Group[] } | null {
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
    };
  } catch (e) {
    console.error('Failed to read localStorage:', e);
    return null;
  }
}

export function writeLocalData(cards: Card[], groups: Group[]) {
  const persistedCards = withoutParsingState(cards);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: persistedCards, groups }));
  } catch (e) {
    try {
      // Strip large Base64 images for LocalStorage backup only so metadata is never lost
      const slimCards = persistedCards.map((c) => {
        if (c.image && c.image.startsWith('data:image/') && c.image.length > 50000) {
          return { ...c, image: undefined };
        }
        return c;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: slimCards, groups }));
    } catch {
      console.warn('LocalStorage quota exceeded, data safe in backend and memory.');
    }
  }
}

export async function syncToBackend(cards: Card[], groups: Group[]) {
  try {
    await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards: withoutParsingState(cards), groups }),
    });
  } catch (e) {
    // 静默降级，不阻塞前端
  }
}

export function saveStateDebounced(cards: Card[], groups: Group[], delay = 400) {
  pendingState = { cards, groups };

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    if (pendingState) {
      writeLocalData(pendingState.cards, pendingState.groups);
      syncToBackend(pendingState.cards, pendingState.groups);
      pendingState = null;
    }
    debounceTimer = null;
  }, delay);
}

export function flushStoredCards() {
  if (pendingState) {
    writeLocalData(pendingState.cards, pendingState.groups);
    // Send beacon or synchronous/fast fetch on unload if possible
    try {
      const blob = new Blob([JSON.stringify({ cards: withoutParsingState(pendingState.cards), groups: pendingState.groups })], { type: 'application/json' });
      navigator.sendBeacon('/api/cards', blob);
    } catch {
      // Fallback
    }
    pendingState = null;
  }
}

export async function loadInitialData(): Promise<{ cards: Card[]; groups: Group[] }> {
  // 1. 优先尝试向后端发起 GET /api/cards
  try {
    const res = await fetch('/api/cards');
    if (res.ok) {
      const data = await res.json();
      const cards = withoutParsingState(Array.isArray(data.cards) ? data.cards : (Array.isArray(data) ? data : []));
      const groups = Array.isArray(data.groups) ? data.groups : [];
      if (cards.length > 0 || groups.length > 0) {
        writeLocalData(cards, groups);
        return { cards, groups };
      }
    }
  } catch (e) {
    // 后端不可用或离线
  }

  // 2. 降级读取 LocalStorage
  const local = getLocalData();
  if (local && (local.cards.length > 0 || local.groups.length > 0)) {
    return local;
  }

  // 3. 两者均为空时，加载初始内置引导卡片
  return { cards: INITIAL_GUIDE_CARDS, groups: [] };
}

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
        resolve({ cards, groups });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File reading failed'));
    reader.readAsText(file);
  });
}
