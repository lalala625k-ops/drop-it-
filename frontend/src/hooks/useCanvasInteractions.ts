import { useState, useRef, useEffect, useCallback, MutableRefObject } from 'react';
import { Card, Group, Viewport } from '../types';
import { InteractiveWire } from '../components/ParentLinkLines';
import { clamp, screenToWorld, MIN_CANVAS_ZOOM } from '../utils/canvas';
import { saveStateDebounced } from '../utils/storage';
import { addDraggedCardsToBundles } from './useBundleGroups';
import { canAttachTreeNode, getParentLinkage, treeParentId } from '../utils/groupRelations';
import { findTreeTarget } from '../utils/treeTargets';
import { linkEndpoints, linkStartTowardPoint } from '../utils/linkEndpoints';

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
  updateMarqueeSelection: (rect: { x: number; y: number; width: number; height: number }, cards: Card[], groups: Group[], isCtrl?: boolean) => void;
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
  onOpenPieMenu: (card: Card, clientX: number, clientY: number, multiSelectedCardIds?: Set<string>, rightMouseDown?: boolean) => void;
  onOpenGroupPieMenu: (group: Group, clientX: number, clientY: number, rightMouseDown: boolean) => void;
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
  onOpenGroupPieMenu,
  onUpdatePieMenuPointer,
  onReleasePieMenuMouseDown,
}: UseCanvasInteractionsProps) {
  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [interactiveWire, setInteractiveWire] = useState<InteractiveWire | null>(null);
  const [movingCardIds, setMovingCardIds] = useState<Set<string>>(new Set());

  const dragModeRef = useRef<DragMode>(null);
  const draggingGroupIdRef = useRef<string | null>(null);
  const draggingGroupIdsRef = useRef<Set<string>>(new Set());
  const draggingSelectedCardIdsRef = useRef<Set<string>>(new Set());
  const draggingCardBranchIdsRef = useRef<Set<string>>(new Set());
  const draggingCardBranchBundleIdsRef = useRef<Set<string>>(new Set());
  const groupDragShiftRef = useRef(false);
  const groupDragWasSelectedRef = useRef(false);
  const hasGroupDraggedRef = useRef(false);
  const hasCardDraggedRef = useRef(false);
  const dragStartCardsRef = useRef<Card[]>([]);
  const dragStartGroupsRef = useRef<Group[]>([]);
  const connectingCardIdRef = useRef<string | null>(null);
  const connectingBundleIdRef = useRef<string | null>(null);
  const isolatedDragRef = useRef(false);
  const connectStartRef = useRef<{ x: number; y: number } | null>(null);
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
    const groupEl = target.closest('[data-group-id], [data-bundle-id]') as HTMLElement | null;

    if (isRight && (cardEl || groupEl)) {
      e.preventDefault();
      e.stopPropagation();
      const targetCard = cardEl && cardsRef.current.find((c) => c.id === cardEl.getAttribute('data-card-id'));
      const targetGroup = groupEl && groupsRef.current.find((g) =>
        g.id === (groupEl.getAttribute('data-group-id') || groupEl.getAttribute('data-bundle-id')));
      if (targetCard || targetGroup) {
        dragModeRef.current = 'pie-menu';
        if (targetCard) {
          const multi = selectedCardIdsRef.current.has(targetCard.id) && selectedCardIdsRef.current.size > 1
            ? selectedCardIdsRef.current : undefined;
          onOpenPieMenu(targetCard, e.clientX, e.clientY, multi, true);
        } else if (targetGroup) onOpenGroupPieMenu(targetGroup, e.clientX, e.clientY, true);
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
      if (cardEl || groupEl) return;
      dragModeRef.current = 'select';
      beginMarqueeSelection(e.shiftKey);
      if (!e.shiftKey) clearSelection();
      setSelectionRect({ x: world.x, y: world.y, width: 0, height: 0 });
    }
  }, [beginMarqueeSelection, clearSelection, isAltPressedRef, isSpacePressedRef,
    onOpenPieMenu, onOpenGroupPieMenu, cardsRef, groupsRef, setSelectionRect, viewportRef]);

  useEffect(() => {
    let panCommitTimer: number | null = null;
    let panPreview: typeof viewportRef.current | null = null;
    const applyZoom = (clientX: number, clientY: number) => {
      const start = dragStartRef.current;
      const nextZoom = clamp(start.vpZoom * Math.exp((start.screenY - clientY) * 0.006), MIN_CANVAS_ZOOM, 3.0);
      setViewport({
        x: clientX - start.worldX * nextZoom,
        y: clientY - start.worldY * nextZoom,
        zoom: nextZoom,
      });
    };
    const applyGlobalMouseMove = (e: MouseEvent) => {
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
        const next = {
          ...vp,
          x: dragStartRef.current.vpX + (e.clientX - dragStartRef.current.screenX),
          y: dragStartRef.current.vpY + (e.clientY - dragStartRef.current.screenY),
        };
        viewportRef.current = next;
        panPreview = next;
        const surface = document.querySelector<HTMLElement>('[data-canvas-surface]');
        if (surface) surface.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`;
        if (document.querySelector('.far-canvas')) setViewport(next);
        else if (panCommitTimer === null) panCommitTimer = window.setTimeout(() => {
          panCommitTimer = null;
          if (panPreview) setViewport(panPreview);
        }, 32);
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
        const isCtrl = e.ctrlKey || e.metaKey;
        updateMarqueeSelection(rect, cardsRef.current, groupsRef.current, isCtrl);
        return;
      }

      const deltaX = (e.clientX - dragStartRef.current.screenX) / vp.zoom;
      const deltaY = (e.clientY - dragStartRef.current.screenY) / vp.zoom;

      if (mode === 'connect-card') {
        const currentWorld = screenToWorld(e.clientX, e.clientY, vp);
        const sourceId = connectingBundleIdRef.current || connectingCardIdRef.current;
        if (sourceId) {
          const target = findTreeTarget(currentWorld, sourceId, cardsRef.current, groupsRef.current);
          const validTarget = target && canAttachTreeNode(sourceId, target.id, cardsRef.current, groupsRef.current);
          dragOverGroupIdRef.current = target?.id || null;
          setDragOverGroupId(validTarget ? target.id : null);
          const endpoints = validTarget
            ? linkEndpoints(sourceId, target.id, cardsRef.current, groupsRef.current) : null;
          const start = endpoints?.start || linkStartTowardPoint(sourceId, currentWorld,
            cardsRef.current, groupsRef.current);
          if (start) setInteractiveWire({
            startX: start.x, startY: start.y,
            targetX: endpoints?.end.x ?? currentWorld.x,
            targetY: endpoints?.end.y ?? currentWorld.y,
            sourceCardId: sourceId,
            isSnapping: !!validTarget,
          });
        }
        return;
      }

      if (mode === 'drag-card') {
        if (Math.hypot(e.clientX - dragStartRef.current.screenX, e.clientY - dragStartRef.current.screenY) > 3) {
          hasCardDraggedRef.current = true;
        }
        const snap = isShiftPressedRef.current && isSpacePressedRef.current;
        updateCardPositions(deltaX, deltaY, draggingCardBranchIdsRef.current, cardsRef.current,
          snap, setCards, groupsRef.current, isolatedDragRef.current);
        if (draggingCardBranchBundleIdsRef.current.size) {
          const starts = new Map(dragStartGroupsRef.current.map((group) => [group.id, group]));
          setGroups((previous) => previous.map((group) => {
            const start = starts.get(group.id);
            return start && draggingCardBranchBundleIdsRef.current.has(group.id)
              ? { ...group, x: start.x + deltaX, y: start.y + deltaY } : group;
          }));
        }
      } else if (mode === 'drag-group') {
          const groupIds = draggingGroupIdsRef.current;
          if (groupIds.size) {
          if (Math.hypot(e.clientX - dragStartRef.current.screenX, e.clientY - dragStartRef.current.screenY) > 3) {
            hasGroupDraggedRef.current = true;
          }
          const draggedParentId = draggingGroupIdRef.current;
          const onlyObject = isolatedDragRef.current;
          const cardIds = onlyObject ? new Set<string>() : new Set(draggingSelectedCardIdsRef.current);
          const movedGroupIds = onlyObject ? new Set<string>([draggedParentId!]) : new Set(groupIds);
          const linkedCardIds = new Set(draggingSelectedCardIdsRef.current);
          const linkedBundleIds = new Set(groupIds);
          for (const group of dragStartGroupsRef.current) {
            if (!groupIds.has(group.id)) continue;
            if (group.kind === 'bundle') {
              dragStartCardsRef.current.filter((card) => card.bundleId === group.id).forEach((card) => {
                linkedCardIds.add(card.id);
                cardIds.add(card.id);
              });
              const linked = getParentLinkage(dragStartCardsRef.current, group.id, dragStartGroupsRef.current);
              linked.cardIds.forEach((id) => linkedCardIds.add(id));
              linked.bundleIds.forEach((id) => linkedBundleIds.add(id));
            } else {
              const linked = getParentLinkage(dragStartCardsRef.current, group.id, dragStartGroupsRef.current);
              linked.cardIds.forEach((id) => linkedCardIds.add(id));
              linked.bundleIds.forEach((id) => linkedBundleIds.add(id));
            }
          }
          if (!onlyObject) {
            linkedCardIds.forEach((id) => cardIds.add(id));
            linkedBundleIds.forEach((id) => movedGroupIds.add(id));
          }
          const starts = new Map(dragStartGroupsRef.current.map((group) => [group.id, group]));
          setGroups((previous) => previous.map((group) => {
            const start = starts.get(group.id);
            if (!start || (!movedGroupIds.has(group.id) && !linkedBundleIds.has(group.id))) return group;
            const offset = movedGroupIds.has(group.id) ? 1 : 0;
            return { ...group, x: start.x + deltaX * offset, y: start.y + deltaY * offset };
          }));
          const cardStarts = new Map(dragStartCardsRef.current.map((card) => [card.id, card]));
          setCards((previous) => previous.map((card) => {
            const start = cardStarts.get(card.id);
            if (!start || (!cardIds.has(card.id) && !linkedCardIds.has(card.id))) return card;
            const offset = cardIds.has(card.id) ? 1 : 0;
            return { ...card, x: start.x + deltaX * offset, y: start.y + deltaY * offset };
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

    let moveFrame: number | null = null;
    let latestMove: MouseEvent | null = null;
    const handleGlobalMouseMove = (event: MouseEvent) => {
      latestMove = event;
      if (moveFrame !== null) return;
      moveFrame = window.requestAnimationFrame(() => {
        moveFrame = null;
        const current = latestMove;
        latestMove = null;
        if (current) applyGlobalMouseMove(current);
      });
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (moveFrame !== null) window.cancelAnimationFrame(moveFrame);
      moveFrame = null;
      latestMove = null;
      if (dragModeRef.current && dragModeRef.current !== 'zoom') applyGlobalMouseMove(e);
      const mode = dragModeRef.current;
      dragModeRef.current = null;
      setMovingCardIds((previous) => previous.size ? new Set() : previous);
      if (mode === 'pan' && panPreview) {
        if (panCommitTimer !== null) window.clearTimeout(panCommitTimer);
        panCommitTimer = null;
        setViewport(panPreview);
        panPreview = null;
      }
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
        const started = connectStartRef.current;
        connectStartRef.current = null;
        const sourceId = connectingCardIdRef.current;
        const bundleId = connectingBundleIdRef.current;
        const activeSourceId = bundleId || sourceId;
        const target = activeSourceId ? findTreeTarget(screenToWorld(e.clientX, e.clientY, viewportRef.current),
          activeSourceId, cardsRef.current, groupsRef.current) : null;
        connectingCardIdRef.current = null;
        connectingBundleIdRef.current = null;
        dragOverGroupIdRef.current = null;
        setInteractiveWire(null);
        setDragOverGroupId(null);
        if (!activeSourceId) return;
        const currentParentId = treeParentId(activeSourceId, cardsRef.current, groupsRef.current);
        if (started && Math.hypot(e.clientX - started.x, e.clientY - started.y) < 6) {
          if (!currentParentId) return;
          pushHistory(cardsRef.current, groupsRef.current);
          if (bundleId) {
            commitState(cardsRef.current, groupsRef.current.map((group) => group.id === bundleId
              ? { ...group, parentIds: [] } : group));
          } else {
            commitState(cardsRef.current.map((card) => card.id === sourceId
              ? { ...card, groupId: null } : card), groupsRef.current);
          }
          return;
        }
        if (target && !canAttachTreeNode(activeSourceId, target.id, cardsRef.current, groupsRef.current)) {
          showToast('不能连接到自己的下级，树状结构不允许形成环');
          return;
        }
        const targetId = target?.id || null;
        if (targetId === currentParentId || (!targetId && !currentParentId)) return;
        pushHistory(cardsRef.current, groupsRef.current);
        if (bundleId) {
          const nextGroups = groupsRef.current.map((group) => group.id === bundleId
            ? { ...group, parentIds: targetId ? [targetId] : [] } : group);
          commitState(cardsRef.current, nextGroups);
        } else {
          const nextCards = cardsRef.current.map((card) => card.id === sourceId
            ? { ...card, groupId: targetId } : card);
          commitState(nextCards, groupsRef.current);
        }
        return;
      }

      if (mode === 'pie-menu' || e.button === 2) {
        onReleasePieMenuMouseDown(e.clientX, e.clientY);
      }
      if (mode === 'drag-card') {
        const isolated = isolatedDragRef.current;
        isolatedDragRef.current = false;
        const info = clickedCardInfoRef.current;
        const didDrag = hasCardDraggedRef.current;
        if (!didDrag && info && info.wasAlreadySelected && !info.shiftKey) {
          setSelectedCardIds(new Set([info.id]));
        }
        clickedCardInfoRef.current = null;
        hasCardDraggedRef.current = false;

        let { nextCards } = finishCardDrag(
          cardsRef.current,
          groupsRef.current,
          selectedCardIdsRef.current,
          isolated
        );
        let nextGroups = groupsRef.current;
        if (didDrag && !isolated) {
          const result = addDraggedCardsToBundles(nextCards, nextGroups, selectedCardIdsRef.current,
            dragStartCardsRef.current, dragStartGroupsRef.current);
          nextCards = result.nextCards;
          nextGroups = result.nextGroups;
        }
        dragStartCardsRef.current = [];
        dragStartGroupsRef.current = [];
        draggingCardBranchIdsRef.current.clear();
        draggingCardBranchBundleIdsRef.current.clear();
        commitState(nextCards, nextGroups);
      } else if (mode === 'drag-group') {
        isolatedDragRef.current = false;
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
      if (moveFrame !== null) window.cancelAnimationFrame(moveFrame);
      if (panCommitTimer !== null) window.clearTimeout(panCommitTimer);
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
      if (e.ctrlKey && e.shiftKey && !e.altKey) {
        dragModeRef.current = 'connect-card';
        connectStartRef.current = { x: e.clientX, y: e.clientY };
        const sourceId = card.bundleId && groupsRef.current.some((group) => group.id === card.bundleId && group.kind === 'bundle')
          ? card.bundleId : card.id;
        if (sourceId === card.id) connectingCardIdRef.current = card.id;
        else connectingBundleIdRef.current = sourceId;
        const currentWorld = screenToWorld(e.clientX, e.clientY, viewportRef.current);
        const source = linkStartTowardPoint(sourceId, currentWorld, cardsRef.current, groupsRef.current);
        setInteractiveWire({
          startX: source?.x ?? card.x + card.width / 2,
          startY: source?.y ?? card.y + card.height / 2,
          targetX: currentWorld.x,
          targetY: currentWorld.y,
          sourceCardId: sourceId,
        });
        return;
      }

      dragModeRef.current = 'drag-card';
      isolatedDragRef.current = (e.ctrlKey || e.metaKey) && !e.altKey;
      hasCardDraggedRef.current = false;
      dragStartCardsRef.current = cardsRef.current;
      dragStartGroupsRef.current = groupsRef.current;
      pushHistory(cardsRef.current, groupsRef.current);

      const wasAlreadySelected = selectedCardIdsRef.current.has(card.id);
      clickedCardInfoRef.current = { id: card.id, wasAlreadySelected, shiftKey: e.shiftKey };

      let nextIds: Set<string>;
      if (isolatedDragRef.current) {
        nextIds = new Set([card.id]);
        selectCard(card.id, false);
      } else if (e.shiftKey) {
        nextIds = new Set(selectedCardIdsRef.current);
        nextIds.add(card.id);
        selectCard(card.id, true);
      } else if (wasAlreadySelected) {
        nextIds = new Set(selectedCardIdsRef.current);
      } else {
        nextIds = new Set([card.id]);
        selectCard(card.id, false);
      }
      const branchCardIds = new Set(nextIds);
      const branchBundleIds = new Set<string>();
      if (!isolatedDragRef.current) nextIds.forEach((id) => {
        const linked = getParentLinkage(cardsRef.current, id, groupsRef.current);
        linked.cardIds.forEach((childId) => branchCardIds.add(childId));
        linked.bundleIds.forEach((bundleId) => branchBundleIds.add(bundleId));
      });
      draggingCardBranchIdsRef.current = branchCardIds;
      draggingCardBranchBundleIdsRef.current = branchBundleIds;
      setMovingCardIds(new Set(branchCardIds));
      initDragCards(cardsRef.current.filter((c) => branchCardIds.has(c.id)));
    },
    [cardsRef, groupsRef, initDragCards, pushHistory, selectCard, selectedCardIdsRef, viewportRef]
  );

  const handleStartGroupDrag = useCallback(
    (group: Group, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (group.kind === 'bundle' && e.ctrlKey && e.shiftKey && !e.altKey) {
        dragModeRef.current = 'connect-card';
        connectStartRef.current = { x: e.clientX, y: e.clientY };
        connectingBundleIdRef.current = group.id;
        const currentWorld = screenToWorld(e.clientX, e.clientY, viewportRef.current);
        const source = linkStartTowardPoint(group.id, currentWorld, cardsRef.current, groupsRef.current);
        setInteractiveWire({
          startX: source?.x ?? group.x + group.width / 2,
          startY: source?.y ?? group.y + group.height / 2,
          targetX: currentWorld.x,
          targetY: currentWorld.y,
          sourceCardId: group.id,
        });
        return;
      }
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
      isolatedDragRef.current = (e.ctrlKey || e.metaKey) && !e.altKey;
      draggingGroupIdRef.current = group.id;
      groupDragShiftRef.current = e.shiftKey;
      groupDragWasSelectedRef.current = selectedGroupIdsRef.current.has(group.id);
      draggingGroupIdsRef.current = new Set(!isolatedDragRef.current && (e.shiftKey || groupDragWasSelectedRef.current)
        ? selectedGroupIdsRef.current : []);
      draggingGroupIdsRef.current.add(group.id);
      draggingSelectedCardIdsRef.current = new Set(!isolatedDragRef.current && (e.shiftKey || groupDragWasSelectedRef.current)
        ? selectedCardIdsRef.current : []);
      const moving = new Set(draggingSelectedCardIdsRef.current);
      if (!isolatedDragRef.current) {
        for (const id of draggingGroupIdsRef.current) {
          const linked = getParentLinkage(cardsRef.current, id, groupsRef.current);
          linked.cardIds.forEach((cardId) => moving.add(cardId));
          cardsRef.current.filter((card) => card.bundleId === id).forEach((card) => moving.add(card.id));
        }
      }
      setMovingCardIds(moving);
      hasGroupDraggedRef.current = false;
      dragStartCardsRef.current = cardsRef.current;
      dragStartGroupsRef.current = groupsRef.current;
      pushHistory(cardsRef.current, groupsRef.current);
      if (e.shiftKey) setSelectedGroupIds(new Set(draggingGroupIdsRef.current));
      else if (!groupDragWasSelectedRef.current) {
        selectGroup(group.id, false);
      }
    },
    [cardsRef, groupsRef, pushHistory, selectedGroupIdsRef, selectedCardIdsRef, selectGroup, setSelectedCardIds, setSelectedGroupIds, viewportRef]
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
    movingCardIds,
    dragStartRef,
    handleMouseDown,
    handleStartCardDrag,
    handleStartGroupDrag,
    handleStartCardScale,
    handleStartCardResize,
  };
}
