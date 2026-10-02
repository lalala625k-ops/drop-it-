import { useState, useRef, useEffect, useCallback, MutableRefObject } from 'react';
import { Card, Group, Viewport } from '../types';
import { InteractiveWire } from '../components/ParentLinkLines';
import { clamp, screenToWorld, MIN_CANVAS_ZOOM } from '../utils/canvas';
import { saveStateDebounced } from '../utils/storage';
import { addDraggedCardsToBundles } from './useBundleGroups';
import { getParentLinkage } from '../utils/groupRelations';

export type DragMode =
  | 'pan'
  | 'zoom'
  | 'select'
  | 'drag-card'
  | 'drag-group'
  | 'connect-card'
  | 'scale-card'
  | 'resize-card'
  | 'resize-group'
  | 'pie-menu'
  | null;

interface UseCanvasInteractionsProps {
  viewportRef: MutableRefObject<Viewport>;
  setViewport: (vp: Viewport | ((prev: Viewport) => Viewport)) => void;
  cardsRef: MutableRefObject<Card[]>;
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  groupsRef: MutableRefObject<Group[]>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  selectedCardIdsRef: MutableRefObject<Set<string>>;
  setSelectedCardIds: (ids: Set<string>) => void;
  selectedGroupIdsRef: MutableRefObject<Set<string>>;
  setSelectedGroupIds: (ids: Set<string>) => void;
  setSelectionRect: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  clearSelection: () => void;
  beginMarqueeSelection: (isShift: boolean) => void;
  selectCard: (id: string, isShift: boolean) => void;
  selectGroup: (id: string, isShift: boolean) => void;
  updateMarqueeSelection: (rect: { x: number; y: number; width: number; height: number }, cards: Card[], groups: Group[]) => void;
  isSpacePressedRef: MutableRefObject<boolean>;
  isAltPressedRef: MutableRefObject<boolean>;
  isShiftPressedRef: MutableRefObject<boolean>;
  initDragCards: (cards: Card[]) => void;
  initDragGroup: (group: Group, allCards: Card[], allGroups: Group[]) => void;
  updateCardPositions: (dx: number, dy: number, selIds: Set<string>, cards: Card[], snap: boolean, setCards: any, groups: Group[], isCtrl: boolean) => void;
  updateGroupPositions: (dx: number, dy: number, gId: string, setGroups: any, setCards: any, moveChildren: boolean) => void;
  finishCardDrag: (cards: Card[], groups: Group[], selIds: Set<string>, isCtrl: boolean) => { nextCards: Card[]; toastMessage?: string };
  finishGroupDrag: () => void;
  updateScale: (clientX: number, zoom: number, setCards: any) => void;
  updateResize: (clientX: number, clientY: number, zoom: number, setCards: any) => void;
  updateGroupResize: (clientX: number, clientY: number, zoom: number, setGroups: any) => void;
  resetResize: () => void;
  startScale: (card: Card, clientX: number) => void;
  startResize: (card: Card, handle: any, clientX: number, clientY: number) => void;
  dragOverGroupId: string | null;
  setDragOverGroupId: (id: string | null) => void;
  commitState: (cards: Card[], groups: Group[]) => void;
  pushHistory: (cards: Card[], groups: Group[]) => void;
  showToast: (msg: string) => void;
  onOpenPieMenu: (card: Card, clientX: number, clientY: number) => void;
  onUpdatePieMenuPointer: (clientX: number, clientY: number) => void;
  onReleasePieMenuMouseDown: (clientX: number, clientY: number) => void;
}

export function useCanvasInteractions({
  viewportRef,
  setViewport,
  cardsRef,
  setCards,
  groupsRef,
  setGroups,
  selectedCardIdsRef,
  setSelectedCardIds,
  selectedGroupIdsRef,
  setSelectedGroupIds,
  setSelectionRect,
  clearSelection,
  beginMarqueeSelection,
  selectCard,
  selectGroup,
  updateMarqueeSelection,
  isSpacePressedRef,
  isAltPressedRef,
  isShiftPressedRef,
  initDragCards,
  initDragGroup,
  updateCardPositions,
  updateGroupPositions,
  finishCardDrag,
  finishGroupDrag,
  updateScale,
  updateResize,
  updateGroupResize,
  resetResize,
  startScale,
  startResize,
  dragOverGroupId,
  setDragOverGroupId,
  commitState,
  pushHistory,
  showToast,
  onOpenPieMenu,
  onUpdatePieMenuPointer,
  onReleasePieMenuMouseDown,
}: UseCanvasInteractionsProps) {
  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [interactiveWire, setInteractiveWire] = useState<InteractiveWire | null>(null);

  const dragModeRef = useRef<DragMode>(null);
  const draggingGroupIdRef = useRef<string | null>(null);
  const draggingGroupIdsRef = useRef<Set<string>>(new Set());
  const draggingSelectedCardIdsRef = useRef<Set<string>>(new Set());
  const groupDragShiftRef = useRef(false);
  const groupDragWasSelectedRef = useRef(false);
  const hasGroupDraggedRef = useRef(false);
  const hasCardDraggedRef = useRef(false);
  const dragStartCardsRef = useRef<Card[]>([]);
  const dragStartGroupsRef = useRef<Group[]>([]);
  const connectingCardIdRef = useRef<string | null>(null);
  const dragOverGroupIdRef = useRef<string | null>(null);
  const clickedCardInfoRef = useRef<{ id: string; wasAlreadySelected: boolean; shiftKey: boolean } | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const zoomPointerRef = useRef<{ x: number; y: number } | null>(null);

  const dragStartRef = useRef<{
    screenX: number;
    screenY: number;
    vpX: number;
    vpY: number;
    vpZoom: number;
    worldX: number;
    worldY: number;
  }>({ screenX: 0, screenY: 0, vpX: 0, vpY: 0, vpZoom: 1, worldX: 0, worldY: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const isMiddle = e.button === 1;
    const isRight = e.button === 2;
    const isLeft = e.button === 0;
    const spaceOrAlt = isSpacePressedRef.current || isAltPressedRef.current;

    if (isMiddle) e.preventDefault();

    const target = e.target as HTMLElement;
    const cardEl = target.closest('[data-card-id]') as HTMLElement | null;

    if (isRight && cardEl) {
      e.preventDefault();
      e.stopPropagation();
      const cardId = cardEl.getAttribute('data-card-id')!;
      const targetCard = cardsRef.current.find((c) => c.id === cardId);
      if (targetCard) {
        dragModeRef.current = 'pie-menu';
        onOpenPieMenu(targetCard, e.clientX, e.clientY);
      }
      return;
    }

    const isPan = isMiddle || isRight || (spaceOrAlt && isLeft);
    const world = screenToWorld(e.clientX, e.clientY, viewportRef.current);

    dragStartRef.current = {
      screenX: e.clientX,
      screenY: e.clientY,
      vpX: viewportRef.current.x,
      vpY: viewportRef.current.y,
      vpZoom: viewportRef.current.zoom,
      worldX: world.x,
      worldY: world.y,
    };

    if (isMiddle && e.altKey) {
      dragModeRef.current = 'zoom';
      setIsZooming(true);
      return;
    }

    if (isPan) {
      dragModeRef.current = 'pan';
      setIsPanning(true);
      return;
    }

    if (isLeft) {
      if (cardEl || target.closest('[data-group-id]')) return;
      dragModeRef.current = 'select';
      beginMarqueeSelection(e.shiftKey);
      if (!e.shiftKey) clearSelection();
      setSelectionRect({ x: world.x, y: world.y, width: 0, height: 0 });
    }
  }, [beginMarqueeSelection, clearSelection, isAltPressedRef, isSpacePressedRef, onOpenPieMenu, cardsRef, setSelectionRect, viewportRef]);

  useEffect(() => {
    const applyZoom = (clientX: number, clientY: number) => {
      const start = dragStartRef.current;
      const nextZoom = clamp(start.vpZoom * Math.exp((start.screenY - clientY) * 0.006), MIN_CANVAS_ZOOM, 3.0);
      setViewport({
        x: clientX - start.worldX * nextZoom,
        y: clientY - start.worldY * nextZoom,
        zoom: nextZoom,
      });
    };
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const mode = dragModeRef.current;
      if (!mode) return;
      const vp = viewportRef.current;

      if (mode === 'pie-menu') {
        onUpdatePieMenuPointer(e.clientX, e.clientY);
        return;
      }

      if (mode === 'zoom') {
        zoomPointerRef.current = { x: e.clientX, y: e.clientY };
        if (zoomFrameRef.current === null) {
          zoomFrameRef.current = window.requestAnimationFrame(() => {
            zoomFrameRef.current = null;
            const pointer = zoomPointerRef.current;
            if (dragModeRef.current === 'zoom' && pointer) applyZoom(pointer.x, pointer.y);
          });
        }
        return;
      }

      if (mode === 'pan') {
        setViewport({
          ...vp,
          x: dragStartRef.current.vpX + (e.clientX - dragStartRef.current.screenX),
          y: dragStartRef.current.vpY + (e.clientY - dragStartRef.current.screenY),
        });
        return;
      }

      if (mode === 'select') {
        const currentWorld = screenToWorld(e.clientX, e.clientY, vp);
        const rect = {
          x: Math.min(dragStartRef.current.worldX, currentWorld.x),
          y: Math.min(dragStartRef.current.worldY, currentWorld.y),
          width: Math.abs(currentWorld.x - dragStartRef.current.worldX),
          height: Math.abs(currentWorld.y - dragStartRef.current.worldY),
        };
        const collapsedIds = new Set(groupsRef.current.filter((group) => group.kind === 'bundle' && group.collapsed).map((group) => group.id));
        updateMarqueeSelection(rect, cardsRef.current.filter((card) => !card.bundleId || !collapsedIds.has(card.bundleId)), groupsRef.current);
        return;
      }

      const deltaX = (e.clientX - dragStartRef.current.screenX) / vp.zoom;
      const deltaY = (e.clientY - dragStartRef.current.screenY) / vp.zoom;

      if (mode === 'connect-card') {
        const currentWorld = screenToWorld(e.clientX, e.clientY, vp);
        const sourceId = connectingCardIdRef.current;
        const sourceCard = cardsRef.current.find((c) => c.id === sourceId);
        if (sourceCard) {
          const hoveredGroup = groupsRef.current.find((g) => {
            if (g.kind === 'bundle') return false;
            const gSize = g.width || 120;
            const gx = g.x + gSize / 2;
            const gy = g.y + gSize / 2;
            return Math.hypot(currentWorld.x - gx, currentWorld.y - gy) <= gSize / 2 + 30;
          });
          const targetGId = hoveredGroup ? hoveredGroup.id : null;
          dragOverGroupIdRef.current = targetGId;
          setDragOverGroupId(targetGId);

          setInteractiveWire({
            startX: sourceCard.x + sourceCard.width / 2,
            startY: sourceCard.y + sourceCard.height / 2,
            targetX: hoveredGroup ? hoveredGroup.x + (hoveredGroup.width || 120) / 2 : currentWorld.x,
            targetY: hoveredGroup ? hoveredGroup.y + (hoveredGroup.height || 120) / 2 : currentWorld.y,
            sourceCardId: sourceCard.id,
            isSnapping: !!hoveredGroup,
          });
        }
        return;
      }

      if (mode === 'drag-card') {
        if (Math.hypot(e.clientX - dragStartRef.current.screenX, e.clientY - dragStartRef.current.screenY) > 3) {
          hasCardDraggedRef.current = true;
        }
        const snap = isShiftPressedRef.current && isSpacePressedRef.current;
        updateCardPositions(deltaX, deltaY, selectedCardIdsRef.current, cardsRef.current, snap, setCards, groupsRef.current, e.ctrlKey);
      } else if (mode === 'drag-group') {
        const groupIds = draggingGroupIdsRef.current;
        if (groupIds.size) {
          if (Math.hypot(e.clientX - dragStartRef.current.screenX, e.clientY - dragStartRef.current.screenY) > 3) {
            hasGroupDraggedRef.current = true;
          }
          const cardIds = new Set(draggingSelectedCardIdsRef.current);
          const movedGroupIds = new Set(groupIds);
          for (const group of dragStartGroupsRef.current) {
            if (!groupIds.has(group.id)) continue;
            if (group.kind === 'bundle') {
              dragStartCardsRef.current.filter((card) => card.bundleId === group.id).forEach((card) => cardIds.add(card.id));
            } else if (e.ctrlKey || e.metaKey) {
              const linked = getParentLinkage(dragStartCardsRef.current, group.id);
              linked.cardIds.forEach((id) => cardIds.add(id));
              linked.bundleIds.forEach((id) => movedGroupIds.add(id));
            }
          }
          const starts = new Map(dragStartGroupsRef.current.map((group) => [group.id, group]));
          setGroups((previous) => previous.map((group) => {
            const start = starts.get(group.id);
            return start && movedGroupIds.has(group.id)
              ? { ...group, x: start.x + deltaX, y: start.y + deltaY } : group;
          }));
          const cardStarts = new Map(dragStartCardsRef.current.map((card) => [card.id, card]));
          setCards((previous) => previous.map((card) => {
            const start = cardStarts.get(card.id);
            return start && cardIds.has(card.id)
              ? { ...card, x: start.x + deltaX, y: start.y + deltaY } : card;
          }));
        }
      } else if (mode === 'scale-card') {
        updateScale(e.clientX, vp.zoom, setCards);
      } else if (mode === 'resize-card') {
        updateResize(e.clientX, e.clientY, vp.zoom, setCards);
      } else if (mode === 'resize-group') {
        updateGroupResize(e.clientX, e.clientY, vp.zoom, setGroups);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const mode = dragModeRef.current;
      dragModeRef.current = null;
      setIsPanning(false);
      setIsZooming(false);
      setSelectionRect(null);
      resetResize();

      if (mode === 'zoom') {
        if (zoomFrameRef.current !== null) window.cancelAnimationFrame(zoomFrameRef.current);
        zoomFrameRef.current = null;
        zoomPointerRef.current = null;
        applyZoom(e.clientX, e.clientY);
        return;
      }

      if (mode === 'connect-card') {
        const sourceId = connectingCardIdRef.current;
        const targetGId = dragOverGroupIdRef.current;
        connectingCardIdRef.current = null;
        dragOverGroupIdRef.current = null;
        setInteractiveWire(null);
        setDragOverGroupId(null);

        if (sourceId) {
          if (targetGId) {
            pushHistory(cardsRef.current, groupsRef.current);
            const targetGroup = groupsRef.current.find((g) => g.id === targetGId);
            const nextCards = cardsRef.current.map((c) =>
              c.id === sourceId ? { ...c, groupId: targetGId } : c
            );
            commitState(nextCards, groupsRef.current);
            showToast(`已生成实心白线并链接到「${targetGroup?.title || '父物体'}」`);
          } else {
            const targetCard = cardsRef.current.find((c) => c.id === sourceId);
            const bundleParentIds = targetCard?.bundleId
              ? [...new Set(cardsRef.current
                .filter((card) => card.bundleId === targetCard.bundleId && card.groupId)
                .map((card) => card.groupId!))]
              : [];
            const parentId = targetCard?.groupId || (bundleParentIds.length === 1 ? bundleParentIds[0] : null);
            if (targetCard && parentId) {
              pushHistory(cardsRef.current, groupsRef.current);
              const nextCards = cardsRef.current.map((c) =>
                (targetCard.bundleId
                  ? c.bundleId === targetCard.bundleId && c.groupId === parentId
                  : c.id === sourceId) ? { ...c, groupId: null } : c
              );
              commitState(nextCards, groupsRef.current);
              showToast(targetCard.bundleId ? '已断开整个 Group 与该父物体的连线' : '已断开卡片连线');
            }
          }
        }
        return;
      }

      if (mode === 'pie-menu' || e.button === 2) {
        onReleasePieMenuMouseDown(e.clientX, e.clientY);
      }
      if (mode === 'drag-card') {
        const info = clickedCardInfoRef.current;
        const didDrag = hasCardDraggedRef.current;
        if (!didDrag && info && info.wasAlreadySelected && !info.shiftKey) {
          setSelectedCardIds(new Set([info.id]));
        }
        clickedCardInfoRef.current = null;
        hasCardDraggedRef.current = false;

        let { nextCards, toastMessage } = finishCardDrag(
          cardsRef.current,
          groupsRef.current,
          selectedCardIdsRef.current,
          e.ctrlKey
        );
        let nextGroups = groupsRef.current;
        if (didDrag && !e.ctrlKey) {
          const result = addDraggedCardsToBundles(nextCards, nextGroups, selectedCardIdsRef.current,
            dragStartCardsRef.current, dragStartGroupsRef.current);
          nextCards = result.nextCards;
          nextGroups = result.nextGroups;
          if (result.addedCount) toastMessage = `已将 ${result.addedCount} 张卡片加入 Group`;
        }
        dragStartCardsRef.current = [];
        dragStartGroupsRef.current = [];
        commitState(nextCards, nextGroups);
        if (toastMessage) showToast(toastMessage);
      } else if (mode === 'drag-group') {
        const gId = draggingGroupIdRef.current;
        draggingGroupIdRef.current = null;
        draggingGroupIdsRef.current = new Set();
        draggingSelectedCardIdsRef.current = new Set();
        if (!hasGroupDraggedRef.current && gId) {
          if (groupDragShiftRef.current && groupDragWasSelectedRef.current) {
            const next = new Set(selectedGroupIdsRef.current);
            next.delete(gId);
            setSelectedGroupIds(next);
          } else if (!groupDragShiftRef.current) {
            setSelectedGroupIds(new Set([gId]));
          }
        }
        if (hasGroupDraggedRef.current && gId) {
          hasGroupDraggedRef.current = false;
          commitState(cardsRef.current, groupsRef.current);
          showToast('已移动所选 Group');
        }
        dragStartCardsRef.current = [];
        dragStartGroupsRef.current = [];
        finishGroupDrag();
      } else if (mode === 'scale-card' || mode === 'resize-card' || mode === 'resize-group') {
        saveStateDebounced(cardsRef.current, groupsRef.current);
      }
    };

    const handleWindowBlur = () => {
      if (dragModeRef.current !== 'zoom') return;
      dragModeRef.current = null;
      setIsZooming(false);
      if (zoomFrameRef.current !== null) window.cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
      zoomPointerRef.current = null;
    };
    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
      if (zoomFrameRef.current !== null) window.cancelAnimationFrame(zoomFrameRef.current);
    };
  }, [
    cardsRef,
    commitState,
    finishCardDrag,
    finishGroupDrag,
    groupsRef,
    isShiftPressedRef,
    isSpacePressedRef,
    onReleasePieMenuMouseDown,
    onUpdatePieMenuPointer,
    pushHistory,
    resetResize,
    selectedCardIdsRef,
    selectedGroupIdsRef,
    setSelectedGroupIds,
    setCards,
    setDragOverGroupId,
    setGroups,
    setSelectedCardIds,
    setSelectionRect,
    setViewport,
    showToast,
    updateCardPositions,
    updateGroupPositions,
    updateGroupResize,
    updateMarqueeSelection,
    updateResize,
    updateScale,
    viewportRef,
  ]);

  const handleStartCardDrag = useCallback(
    (card: Card, e: React.MouseEvent) => {
      if (e.ctrlKey && !e.altKey) {
        dragModeRef.current = 'connect-card';
        connectingCardIdRef.current = card.id;
        const currentWorld = screenToWorld(e.clientX, e.clientY, viewportRef.current);
        setInteractiveWire({
          startX: card.x + card.width / 2,
          startY: card.y + card.height / 2,
          targetX: currentWorld.x,
          targetY: currentWorld.y,
          sourceCardId: card.id,
        });
        return;
      }

      dragModeRef.current = 'drag-card';
      hasCardDraggedRef.current = false;
      dragStartCardsRef.current = cardsRef.current;
      dragStartGroupsRef.current = groupsRef.current;
      pushHistory(cardsRef.current, groupsRef.current);

      const wasAlreadySelected = selectedCardIdsRef.current.has(card.id);
      clickedCardInfoRef.current = { id: card.id, wasAlreadySelected, shiftKey: e.shiftKey };

      let nextIds: Set<string>;
      if (e.shiftKey) {
        nextIds = new Set(selectedCardIdsRef.current);
        nextIds.add(card.id);
        selectCard(card.id, true);
      } else if (wasAlreadySelected) {
        nextIds = new Set(selectedCardIdsRef.current);
      } else {
        nextIds = new Set([card.id]);
        selectCard(card.id, false);
      }
      initDragCards(cardsRef.current.filter((c) => nextIds.has(c.id)));
    },
    [cardsRef, groupsRef, initDragCards, pushHistory, selectCard, selectedCardIdsRef, viewportRef]
  );

  const handleStartGroupDrag = useCallback(
    (group: Group, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const vp = viewportRef.current;
      dragStartRef.current = {
        screenX: e.clientX,
        screenY: e.clientY,
        vpX: vp.x,
        vpY: vp.y,
        vpZoom: vp.zoom,
        worldX: (e.clientX - vp.x) / vp.zoom,
        worldY: (e.clientY - vp.y) / vp.zoom,
      };
      dragModeRef.current = 'drag-group';
      draggingGroupIdRef.current = group.id;
      groupDragShiftRef.current = e.shiftKey;
      groupDragWasSelectedRef.current = selectedGroupIdsRef.current.has(group.id);
      draggingGroupIdsRef.current = new Set(e.shiftKey || groupDragWasSelectedRef.current
        ? selectedGroupIdsRef.current : []);
      draggingGroupIdsRef.current.add(group.id);
      draggingSelectedCardIdsRef.current = new Set(e.shiftKey || groupDragWasSelectedRef.current
        ? selectedCardIdsRef.current : []);
      hasGroupDraggedRef.current = false;
      dragStartCardsRef.current = cardsRef.current;
      dragStartGroupsRef.current = groupsRef.current;
      pushHistory(cardsRef.current, groupsRef.current);
      if (e.shiftKey) setSelectedGroupIds(new Set(draggingGroupIdsRef.current));
      else if (!groupDragWasSelectedRef.current) {
        setSelectedCardIds(new Set());
        setSelectedGroupIds(new Set([group.id]));
      }
    },
    [cardsRef, groupsRef, pushHistory, selectedGroupIdsRef, setSelectedCardIds, setSelectedGroupIds, viewportRef]
  );

  const handleStartCardScale = useCallback(
    (c: Card, clientX: number) => {
      pushHistory(cardsRef.current, groupsRef.current);
      dragModeRef.current = 'scale-card';
      startScale(c, clientX);
    },
    [cardsRef, groupsRef, pushHistory, startScale]
  );

  const handleStartCardResize = useCallback(
    (c: Card, handle: any, e: React.MouseEvent) => {
      pushHistory(cardsRef.current, groupsRef.current);
      dragModeRef.current = 'resize-card';
      startResize(c, handle, e.clientX, e.clientY);
      setSelectedCardIds(new Set([c.id]));
    },
    [cardsRef, groupsRef, pushHistory, setSelectedCardIds, startResize]
  );

  return {
    isPanning,
    isZooming,
    interactiveWire,
    dragStartRef,
    handleMouseDown,
    handleStartCardDrag,
    handleStartGroupDrag,
    handleStartCardScale,
    handleStartCardResize,
  };
}
