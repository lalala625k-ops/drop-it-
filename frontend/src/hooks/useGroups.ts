import { useState, useRef, useCallback } from 'react';
import { Group, Card } from '../types';
import { getBoundingBox } from '../utils/canvas';
import { cardVisualBounds } from '../utils/cardBounds';
import { GROUP_COLOR_FAMILIES, groupBaseColor } from '../utils/groupColors';

export function useGroups(initialGroups: Group[] = []) {
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const groupsRef = useRef<Group[]>(groups);
  groupsRef.current = groups;

  const refreshGroupBounds = useCallback((_currentCards: Card[], currentGroups: Group[]): Group[] => {
    return currentGroups;
  }, []);

  const createEmptyParent = useCallback(
    (x: number, y: number, width = 120, height = 120, title?: string): Group => {
      const groupNum = groupsRef.current.length + 1;
      const newParent: Group = {
        id: `parent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: title || `原点 ${groupNum}`,
        x: Math.round(x),
        y: Math.round(y),
        width,
        height,
        zIndex: 5,
        color: groupBaseColor(GROUP_COLOR_FAMILIES[groupsRef.current.filter((group) => group.kind !== 'bundle').length % GROUP_COLOR_FAMILIES.length].name),
      };

      setGroups((prev) => [...prev, newParent]);
      return newParent;
    },
    []
  );

  const createParentWithCollisionAvoidance = useCallback(
    (targetWorld: { x: number; y: number }, cards: Card[], existingGroups: Group[], size = 120, gap = 5): Group => {
      let initialX = Math.round(targetWorld.x - size / 2);
      let initialY = Math.round(targetWorld.y - size / 2);

      const obstacles = [
        ...cards.map(cardVisualBounds),
        ...existingGroups.map((g) => ({ x: g.x, y: g.y, width: g.width || 120, height: g.height || 120 })),
      ];

      let hasOverlap = true;
      let attempts = 0;
      while (hasOverlap && attempts < 30) {
        hasOverlap = false;
        for (const obs of obstacles) {
          if (
            initialX < obs.x + obs.width + gap &&
            initialX + size + gap > obs.x &&
            initialY < obs.y + obs.height + gap &&
            initialY + size + gap > obs.y
          ) {
            initialX = obs.x + obs.width + gap;
            hasOverlap = true;
            attempts++;
            break;
          }
        }
      }

      return createEmptyParent(initialX, initialY, size, size);
    },
    [createEmptyParent]
  );

  const createGroupFromSelection = useCallback(
    (selectedCards: Card[], cursorPosition?: { x: number; y: number }, hasSelectedBundle = false): { newGroup: Group; updatedCards: Card[] } | null => {
      if (selectedCards.length === 0 && !hasSelectedBundle) return null;
      const box = getBoundingBox(selectedCards, []);
      if (!box && !cursorPosition) return null;

      const size = 120;
      const groupNum = groupsRef.current.length + 1;
      const cx = cursorPosition ? cursorPosition.x : box!.x + box!.width / 2;
      const cy = cursorPosition ? cursorPosition.y : box!.y + box!.height / 2;

      const newGroup: Group = {
        id: `parent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: `原点 ${groupNum}`,
        x: Math.round(cx - size / 2),
        y: Math.round(cy - size / 2),
        width: size,
        height: size,
        zIndex: 5,
        color: groupBaseColor(GROUP_COLOR_FAMILIES[groupsRef.current.filter((group) => group.kind !== 'bundle').length % GROUP_COLOR_FAMILIES.length].name),
      };

      const selectedIdSet = new Set(selectedCards.map((c) => c.id));
      const updatedCards = selectedCards.map((c) => ({
        ...c,
        groupId: selectedIdSet.has(c.id) ? newGroup.id : c.groupId,
      }));

      return { newGroup, updatedCards };
    },
    []
  );

  const fitParentToBounds = useCallback((groupId: string, currentCards: Card[]) => {
    const groupCards = currentCards.filter((c) => c.groupId === groupId);
    if (groupCards.length === 0) return;

    const padding = 28;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const c of groupCards) {
      const bounds = cardVisualBounds(c);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              x: Math.round(minX - padding),
              y: Math.round(minY - padding - 8),
              width: Math.round(maxX - minX + padding * 2),
              height: Math.round(maxY - minY + padding * 2 + 8),
            }
          : g
      )
    );
  }, []);

  const renameGroup = useCallback((id: string, newTitle: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, title: newTitle } : g)));
  }, []);

  const updateGroupSize = useCallback((id: string, updates: Partial<Group>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  }, []);

  return {
    groups,
    setGroups,
    groupsRef,
    refreshGroupBounds,
    createEmptyParent,
    createParentWithCollisionAvoidance,
    createGroupFromSelection,
    fitParentToBounds,
    renameGroup,
    updateGroupSize,
  };
}
