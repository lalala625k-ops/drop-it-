import type { WorkspaceState } from './workspaceApi';
import { browserBoardId } from './workspaceApi';
import { storePendingImage } from './pendingImages';

const key = `pinboard_workspace_v1_${browserBoardId || new URLSearchParams(location.search).get('board-id') || 'main'}`;
export interface WorkspaceCache extends WorkspaceState {
  workspace_id: string; client_revision: number; database_revision: number; pending_draft: boolean;
}
const rememberedImages = new Map<string, string>();

export function sameWorkspaceObjects(a: WorkspaceState, b: WorkspaceState): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key, child]) => key !== 'isParsing' && child != null).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
    return value;
  };
  return JSON.stringify(canonical({ cards: a.cards, groups: a.groups })) === JSON.stringify(canonical({ cards: b.cards, groups: b.groups }));
}

export function readWorkspaceCache(): WorkspaceCache | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value.workspace_id === 'string' && typeof value.client_revision === 'number'
      && typeof value.database_revision === 'number' && Array.isArray(value.cards) && Array.isArray(value.groups)
      && Array.isArray(value.pins) ? value : null;
  } catch { return null; }
}

export function writeWorkspaceCache(value: WorkspaceCache) {
  const activeIds = new Set(value.cards.filter((card) => card.image?.startsWith('data:image/')).map((card) => card.id));
  for (const id of rememberedImages.keys()) if (!activeIds.has(id)) rememberedImages.delete(id);
  const cards = value.cards.map(({ isParsing: _parsing, ...card }) => {
    if (card.image?.startsWith('data:image/') && card.image.length > 50000) {
      if (rememberedImages.get(card.id) !== card.image) {
        rememberedImages.set(card.id, card.image);
        void storePendingImage(card.id, card.image).then((saved) => { if (!saved) rememberedImages.delete(card.id); });
      }
      return { ...card, image: undefined };
    }
    return card;
  });
  try { localStorage.setItem(key, JSON.stringify({ ...value, cards })); }
  catch { window.dispatchEvent(new Event('pinboard-draft-cache-failed')); }
}
