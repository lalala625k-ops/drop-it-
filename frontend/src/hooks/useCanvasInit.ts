import { useEffect, MutableRefObject } from 'react';
import { Card, Group, Viewport } from '../types';
import { loadInitialData, flushStoredCards, saveStateDebounced } from '../utils/storage';
import { normalizeTreeData } from '../utils/groupRelations';
import { getSavedViewport } from './useViewport';
import { computeFitViewport } from '../utils/canvas';
import { bundleCollapsedHeight, bundleCollapsedWidth } from './useBundleGroups';

interface UseCanvasInitProps {
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setViewport: (vp: Viewport) => void;
  maxZIndexRef: MutableRefObject<number>;
}

export function useCanvasInit({
  setCards,
  setGroups,
  setViewport,
  maxZIndexRef,
}: UseCanvasInitProps) {
  useEffect(() => {
    loadInitialData().then(({ cards: initCards, groups: initGroups }) => {
      const tree = normalizeTreeData(initCards, initGroups);
      initCards = tree.cards;
      initGroups = tree.groups;
      const bundleScales = new Map(initGroups.filter((group) => group.kind === 'bundle')
        .map((group) => [group.id, (group.outlinePadding ?? 18) / 18]));
      let repairedScales = false;
      initCards = initCards.map((card) => {
        const expected = card.bundleId ? bundleScales.get(card.bundleId) : undefined;
        if (expected === undefined || Math.abs((card.contentScale ?? 1) - expected) < 0.001) return card;
        repairedScales = true;
        return { ...card, contentScale: expected };
      });
      const standardSize = 120;
      const normalizedGroups = initGroups.map((g) => {
        if (g.kind === 'bundle') return g;
        if (!g.width || g.width !== standardSize || !g.height || g.height !== standardSize) {
          const oldW = g.width || standardSize;
          const oldH = g.height || standardSize;
          return {
            ...g,
            x: Math.round(g.x + oldW / 2 - standardSize / 2),
            y: Math.round(g.y + oldH / 2 - standardSize / 2),
            width: standardSize,
            height: standardSize,
          };
        }
        return g;
      });
      setCards(initCards);
      setGroups(normalizedGroups);
      if (tree.changed || repairedScales) saveStateDebounced(initCards, normalizedGroups);

      const savedVp = getSavedViewport();
      if (!savedVp) {
        const folded = new Set(normalizedGroups.filter((g) => g.kind === 'bundle' && g.collapsed).map((g) => g.id));
        const fitCards = initCards.filter((card) => !card.bundleId || !folded.has(card.bundleId));
        const fitGroups = normalizedGroups.map((group) => group.kind === 'bundle' && group.collapsed
          ? { ...group, width: bundleCollapsedWidth(group.width), height: bundleCollapsedHeight(initCards.filter((card) => card.bundleId === group.id).length) }
          : group);
        const fit = computeFitViewport(fitCards, fitGroups, window.innerWidth, window.innerHeight);
        if (fit) setViewport(fit);
      }

      let maxZ = 10;
      initCards.forEach((c) => {
        if (c.zIndex && c.zIndex > maxZ) maxZ = c.zIndex;
      });
      maxZIndexRef.current = maxZ + 1;
    });

    const handleBeforeUnload = () => flushStoredCards();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [maxZIndexRef, setCards, setGroups, setViewport]);
}
