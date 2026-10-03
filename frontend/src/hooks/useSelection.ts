import { useState, useRef, useCallback } from 'react';
import { Card, Group, Rect } from '../types';
import { rectsIntersect } from '../utils/canvas';
import { cardVisualBounds } from '../utils/cardBounds';
import { bundleBounds, bundleCollapsedHeight, bundleCollapsedWidth } from './useBundleGroups';

export function useSelection() {
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);

  const selectedCardIdsRef = useRef<Set<string>>(selectedCardIds);
  selectedCardIdsRef.current = selectedCardIds;

  const selectedGroupIdsRef = useRef<Set<string>>(selectedGroupIds);
  selectedGroupIdsRef.current = selectedGroupIds;
  const marqueeBaseCardsRef = useRef<Set<string>>(new Set());
  const marqueeBaseGroupsRef = useRef<Set<string>>(new Set());

  const clearSelection = useCallback(() => {
    setSelectedCardIds(new Set());
    setSelectedGroupIds(new Set());
  }, []);

  const selectCard = useCallback((id: string, shiftKey: boolean) => {
    setSelectedCardIds((prev) => {
      const next = new Set(shiftKey ? prev : []);
      if (shiftKey && next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (!shiftKey) {
      setSelectedGroupIds(new Set());
    }
  }, []);

  const selectGroup = useCallback((id: string, shiftKey: boolean) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(shiftKey ? prev : []);
      if (shiftKey && next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (!shiftKey) {
      setSelectedCardIds(new Set());
    }
  }, []);

  const beginMarqueeSelection = useCallback((isShift: boolean) => {
    marqueeBaseCardsRef.current = new Set(isShift ? selectedCardIdsRef.current : []);
    marqueeBaseGroupsRef.current = new Set(isShift ? selectedGroupIdsRef.current : []);
  }, []);

  const updateMarqueeSelection = useCallback((rect: Rect, cards: Card[], groups: Group[], isCtrl = false) => {
    setSelectionRect(rect);
    const matchedGroups = new Set(marqueeBaseGroupsRef.current);
    if (isCtrl) {
      groups.forEach((group) => {
        const members = cards.filter((card) => card.bundleId === group.id);
        const bounds = group.kind === 'bundle' && !group.collapsed ? bundleBounds(cards, group.id, group) : group;
        const width = group.kind === 'bundle' && group.collapsed ? bundleCollapsedWidth(group.width) : bounds.width;
        const height = group.kind === 'bundle' && group.collapsed ? bundleCollapsedHeight(members.length) : bounds.height;
        if (rectsIntersect(rect, { x: bounds.x, y: bounds.y, width, height })) matchedGroups.add(group.id);
      });
    }
    const matched = new Set(marqueeBaseCardsRef.current);
    cards.forEach((c) => {
      const shouldCheck = !isCtrl || !c.bundleId || !matchedGroups.has(c.bundleId);
      if (shouldCheck && rectsIntersect(rect, cardVisualBounds(c))) {
        matched.add(c.id);
      }
    });
    setSelectedCardIds(matched);
    setSelectedGroupIds(matchedGroups);
  }, []);

  return {
    selectedCardIds,
    setSelectedCardIds,
    selectedCardIdsRef,
    selectedGroupIds,
    setSelectedGroupIds,
    selectedGroupIdsRef,
    selectionRect,
    setSelectionRect,
    clearSelection,
    selectCard,
    selectGroup,
    beginMarqueeSelection,
    updateMarqueeSelection,
  };
}
