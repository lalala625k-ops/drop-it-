import { useEffect, useState, MutableRefObject } from 'react';
import { Card, Group, Viewport } from '../types';
import { loadInitialData, flushStoredCards, saveStateDebounced } from '../utils/storage';
import { normalizeTreeData } from '../utils/groupRelations';
import { getSavedViewport } from './useViewport';
import { computeFitViewport } from '../utils/canvas';
import { bundleCollapsedHeight, bundleCollapsedWidth } from './useBundleGroups';
import type { CanvasPin } from './useCanvasPins';

interface UseCanvasInitProps {
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setViewport: (vp: Viewport) => void;
  maxZIndexRef: MutableRefObject<number>;
  replacePins: (pins: CanvasPin[]) => void;
}

export function useCanvasInit({
  setCards,
  setGroups,
  setViewport,
  maxZIndexRef,
  replacePins,
}: UseCanvasInitProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadInitialData().then(({ cards: initCards, groups: initGroups, viewport: loadedViewport, pins: loadedPins }) => {
      if (cancelled) return;
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

      const restoredViewport = loadedViewport && typeof loadedViewport.x === 'number' &&
        typeof loadedViewport.y === 'number' && typeof loadedViewport.zoom === 'number' &&
        loadedViewport.zoom >= 0.01 && loadedViewport.zoom <= 3 ? loadedViewport : null;
      if (restoredViewport) setViewport(restoredViewport);
      replacePins(loadedPins || []);
      const savedVp = restoredViewport || getSavedViewport();
      if (!restoredViewport && !localStorage.getItem('pinboard_migrated_viewport_applied')) {
        void fetch('/api/migration/viewport').then((response) => response.json()).then((vp) => {
          if (typeof vp.x === 'number' && typeof vp.y === 'number' && typeof vp.zoom === 'number') {
            setViewport(vp);
            localStorage.setItem('pinboard_migrated_viewport_applied', '1');
          }
        }).catch(() => {});
      }
      // A cached viewport can outlive a workspace (for example after opening a
      // different .drop file).  Restoring it blindly leaves the canvas looking
      // empty while the cards are far outside the current screen.  Keep the
      // user's viewport when it still intersects the loaded content, otherwise
      // fall back to a fit view so the first frame is usable.
      const savedViewportShowsContent = savedVp && (() => {
        const zoom = Math.max(savedVp.zoom, 0.01);
        const screenRect = {
          x: -savedVp.x / zoom,
          y: -savedVp.y / zoom,
          width: window.innerWidth / zoom,
          height: window.innerHeight / zoom,
        };
        const intersects = (rect: { x: number; y: number; width: number; height: number }) =>
          rect.x + rect.width >= screenRect.x && rect.x <= screenRect.x + screenRect.width &&
          rect.y + rect.height >= screenRect.y && rect.y <= screenRect.y + screenRect.height;
        return initCards.some((card) => intersects({ x: card.x, y: card.y, width: card.width, height: card.height }))
          || normalizedGroups.some((group) => intersects({ x: group.x, y: group.y, width: group.width || 120, height: group.height || 120 }));
      })();

      if (!restoredViewport && !savedViewportShowsContent) {
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
      setReady(true);
    });

    const handleBeforeUnload = () => flushStoredCards();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { cancelled = true; window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [maxZIndexRef, replacePins, setCards, setGroups, setViewport]);
  return ready;
}
