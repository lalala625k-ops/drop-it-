import { useMemo } from 'react';
import { Card, Group, Viewport } from '../types';
import { bundleCollapsedHeight, bundleCollapsedWidth } from './useBundleGroups';
import { MIN_CANVAS_ZOOM } from '../utils/canvas';
import { cardVisualBounds } from '../utils/cardBounds';

interface UseVirtualViewportProps {
  viewport: Viewport;
  cards: Card[];
  groups: Group[];
  selectedCardIds: Set<string>;
  selectedGroupIds: Set<string>;
  highlightedCardIds?: Set<string>;
  highlightedGroupIds?: Set<string>;
  bufferPx?: number;
}

export function useVirtualViewport({
  viewport,
  cards,
  groups,
  selectedCardIds,
  selectedGroupIds,
  highlightedCardIds,
  highlightedGroupIds,
  bufferPx = 300,
}: UseVirtualViewportProps) {
  return useMemo(() => {
    // If cards count is small (<50), culling overhead is unnecessary
    if (cards.length <= 40 && groups.length <= 10) {
      const allCardIdSet = new Set(cards.map((c) => c.id));
      return {
        visibleCards: cards,
        visibleGroups: groups,
        visibleCardIdSet: allCardIdSet,
        isCullingActive: false,
      };
    }

    const zoom = Math.max(MIN_CANVAS_ZOOM, viewport.zoom);
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 1080;

    const bufferWorld = bufferPx / zoom;
    const minX = -viewport.x / zoom - bufferWorld;
    const minY = -viewport.y / zoom - bufferWorld;
    const maxX = (winW - viewport.x) / zoom + bufferWorld;
    const maxY = (winH - viewport.y) / zoom + bufferWorld;

    const visibleCards: Card[] = [];
    const visibleCardIdSet = new Set<string>();

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const bounds = cardVisualBounds(c);
      // Always include selected cards so dragging never vanishes
      const isSelected = selectedCardIds.has(c.id) || !!highlightedCardIds?.has(c.id);
      const isVisible =
        isSelected ||
        (bounds.x + bounds.width >= minX &&
          bounds.x <= maxX &&
          bounds.y + bounds.height >= minY &&
          bounds.y <= maxY);

      if (isVisible) {
        visibleCards.push(c);
        visibleCardIdSet.add(c.id);
      }
    }

    const visibleGroups: Group[] = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const gWidth = g.kind === 'bundle' && g.collapsed ? bundleCollapsedWidth(g.width) : (g.width || 120);
      const gHeight = g.kind === 'bundle' && g.collapsed ? bundleCollapsedHeight(cards.filter((card) => card.bundleId === g.id).length) : (g.height || 120);
      const isSelected = selectedGroupIds.has(g.id) || !!highlightedGroupIds?.has(g.id);
      const isVisible =
        isSelected ||
        (g.x + gWidth >= minX &&
          g.x <= maxX &&
          g.y + gHeight >= minY &&
          g.y <= maxY);

      if (isVisible) {
        visibleGroups.push(g);
      }
    }

    return {
      visibleCards,
      visibleGroups,
      visibleCardIdSet,
      isCullingActive: true,
    };
  }, [
    viewport.x,
    viewport.y,
    viewport.zoom,
    cards,
    groups,
    selectedCardIds,
    selectedGroupIds,
    highlightedCardIds,
    highlightedGroupIds,
    bufferPx,
  ]);
}
