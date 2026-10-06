import { useMemo } from 'react';
import { Card, Group, Viewport } from '../types';
import { bundleCollapsedHeight, bundleCollapsedWidth } from './useBundleGroups';
import { MIN_CANVAS_ZOOM } from '../utils/canvas';
import { cardVisualBounds } from '../utils/cardBounds';
import { SpatialIndex } from '../utils/spatialIndex';

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
  const membersByBundle = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) if (card.bundleId) counts.set(card.bundleId, (counts.get(card.bundleId) || 0) + 1);
    return counts;
  }, [cards]);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const cardIndex = useMemo(() => new SpatialIndex(cards, cardVisualBounds), [cards]);
  const groupBounds = (g: Group) => ({
    x: g.x, y: g.y,
    width: g.kind === 'bundle' && g.collapsed ? bundleCollapsedWidth(g.width) : (g.width || 120),
    height: g.kind === 'bundle' && g.collapsed ? bundleCollapsedHeight(membersByBundle.get(g.id) || 0) : (g.height || 120),
  });
  const groupIndex = useMemo(() => new SpatialIndex(groups, groupBounds), [groups, membersByBundle]);
  return useMemo(() => {
    if (cards.length === 0 && groups.length === 0) {
      return {
        visibleCards: [],
        visibleGroups: [],
        visibleCardIdSet: new Set<string>(),
        viewportCardCount: 0,
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
    const viewportMinX = -viewport.x / zoom;
    const viewportMinY = -viewport.y / zoom;
    const viewportMaxX = (winW - viewport.x) / zoom;
    const viewportMaxY = (winH - viewport.y) / zoom;

    const visibleCards: Card[] = [];
    const visibleCardIdSet = new Set<string>();
    let viewportCardCount = 0;

    const query = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    const candidates = new Map(cardIndex.query(query).map((card) => [card.id, card]));
    for (const id of selectedCardIds) {
      const card = cardsById.get(id);
      if (card) candidates.set(id, card);
    }
    for (const id of highlightedCardIds || []) {
      const card = cardsById.get(id);
      if (card) candidates.set(id, card);
    }
    for (const c of candidates.values()) {
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
        if (bounds.x + bounds.width >= viewportMinX && bounds.x <= viewportMaxX &&
          bounds.y + bounds.height >= viewportMinY && bounds.y <= viewportMaxY) {
          viewportCardCount += 1;
        }
      }
    }

    const visibleGroups: Group[] = [];
    const groupCandidates = new Map(groupIndex.query(query).map((group) => [group.id, group]));
    for (const id of selectedGroupIds) {
      const group = groupsById.get(id);
      if (group) groupCandidates.set(id, group);
    }
    for (const id of highlightedGroupIds || []) {
      const group = groupsById.get(id);
      if (group) groupCandidates.set(id, group);
    }
    for (const g of groupCandidates.values()) {
      const { width: gWidth, height: gHeight } = groupBounds(g);
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
      viewportCardCount,
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
    cardIndex,
    groupIndex,
    cardsById,
    groupsById,
  ]);
}
