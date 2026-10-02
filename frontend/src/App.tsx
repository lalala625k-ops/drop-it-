import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Card } from './types';
import { CardComponent } from './components/CardComponent';
import { GroupComponent } from './components/GroupComponent';
import { BundleGroupComponent } from './components/BundleGroupComponent';
import { ParentLinkLines } from './components/ParentLinkLines';
import { SelectionBox } from './components/SelectionBox';
import { SnapGuides } from './components/SnapGuides';
import { CanvasCommandMenu, CanvasCommand } from './components/CanvasCommandMenu';
import { CanvasModals } from './components/CanvasModals';

import { computeCardFocusViewport } from './utils/canvas';
import { exportBackup } from './utils/storage';
import { getParentLinkage } from './utils/groupRelations';

import { useViewport } from './hooks/useViewport';
import { useSelection } from './hooks/useSelection';
import { useGroups } from './hooks/useGroups';
import { useCardResize } from './hooks/useCardResize';
import { useCardDrag } from './hooks/useCardDrag';
import { useClipboardPaste } from './hooks/useClipboardPaste';
import { useShortcuts } from './hooks/useShortcuts';
import { useHistory } from './hooks/useHistory';
import { useMinimapState } from './hooks/useMinimapState';
import { useCardClipboard } from './hooks/useCardClipboard';
import { usePieMenuState } from './hooks/usePieMenuState';
import { useCanvasInteractions } from './hooks/useCanvasInteractions';
import { useCanvasDrop } from './hooks/useCanvasDrop';
import { useCanvasActions } from './hooks/useCanvasActions';
import { useCanvasInit } from './hooks/useCanvasInit';
import { useVirtualViewport } from './hooks/useVirtualViewport';
import { bundleBounds, bundleCollapsedHeight, bundleCollapsedWidth, useBundleGroups } from './hooks/useBundleGroups';

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const cardsRef = useRef<Card[]>(cards);
  cardsRef.current = cards;

  const maxZIndexRef = useRef(10);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pressedObject, setPressedObject] = useState<string | null>(null);
  const [canvasMenuPosition, setCanvasMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const rightPointerDownRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const release = () => setPressedObject(null);
    window.addEventListener('mouseup', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('blur', release);
    };
  }, []);

  const showToast = useCallback((_msg: string) => {}, []);

  // Base Canvas & State Hooks
  const { pushHistory, undo } = useHistory();
  const {
    viewport,
    setViewport,
    viewportRef,
    mouseScreenRef,
    mouseWorldRef,
    handleWheel,
    handleCardDoubleClick,
    handleCanvasDoubleClick,
  } = useViewport();

  const {
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
  } = useSelection();

  const {
    groups,
    setGroups,
    groupsRef,
    refreshGroupBounds,
    createParentWithCollisionAvoidance,
    createGroupFromSelection,
    renameGroup,
  } = useGroups([]);

  const bundles = useBundleGroups({
    cardsRef, setCards, groupsRef, setGroups, selectedCardIdsRef, setSelectedCardIds,
    setSelectedGroupIds, zoomRef: viewportRef, pushHistory, showToast,
  });

  const displayGroups = useMemo(() => groups.map((group) =>
    group.kind === 'bundle' && !group.collapsed ? bundleBounds(cards, group.id, group) : group
  ), [cards, groups]);
  const collapsedIds = useMemo(() => new Set(groups.filter((group) => group.kind === 'bundle' && group.collapsed).map((group) => group.id)), [groups]);
  const canvasCards = useMemo(() => cards
    .filter((card) => !card.bundleId || !collapsedIds.has(card.bundleId))
    .map((card) => ({ ...card, color: undefined, textColor: undefined, borderColor: undefined })), [cards, collapsedIds]);
  const fitGroups = useMemo(() => displayGroups.map((group) => group.kind === 'bundle' && group.collapsed
    ? { ...group, width: bundleCollapsedWidth(group.width), height: bundleCollapsedHeight(cards.filter((card) => card.bundleId === group.id).length) }
    : group), [displayGroups, cards]);

  const { startScale, startResize, updateScale, updateResize, updateGroupResize, resetResize } = useCardResize();
  const {
    snapLines,
    dragOverGroupId,
    setDragOverGroupId,
    initDragCards,
    initDragGroup,
    updateCardPositions,
    updateGroupPositions,
    finishCardDrag,
    finishGroupDrag,
  } = useCardDrag();

  // Domain Extension Hooks
  const minimap = useMinimapState();
  const clipboard = useCardClipboard({
    cardsRef,
    groupsRef,
    selectedCardIdsRef,
    setSelectedCardIds,
    setCards,
    maxZIndexRef,
    mouseWorldRef,
    pushHistory,
    showToast,
  });

  const pieMenu = usePieMenuState({ cardsRef, groupsRef, setCards, setGroups, pushHistory, showToast });

  const actions = useCanvasActions({
    cardsRef,
    setCards,
    groupsRef,
    setGroups,
    selectedCardIdsRef,
    setSelectedCardIds,
    selectedGroupIdsRef,
    setSelectedGroupIds,
    maxZIndexRef,
    mouseWorldRef,
    pushHistory,
    undo,
    clearSelection,
    refreshGroupBounds,
    createParentWithCollisionAvoidance,
    createGroupFromSelection,
    showToast,
  });

  const dissolveParent = useCallback((parentId: string) => {
    if (!groupsRef.current.some((group) => group.id === parentId && group.kind !== 'bundle')) return;
    pushHistory(cardsRef.current, groupsRef.current);
    const nextCards = cardsRef.current.map((card) => card.groupId === parentId ? { ...card, groupId: null } : card);
    const nextGroups = groupsRef.current.filter((group) => group.id !== parentId);
    actions.commitState(nextCards, nextGroups);
    setSelectedGroupIds((previous) => {
      const next = new Set(previous);
      next.delete(parentId);
      return next;
    });
    showToast('已解散父物体，卡片已保留');
  }, [actions.commitState, pushHistory, setSelectedGroupIds, showToast]);

  useCanvasInit({ setCards, setGroups, setViewport, maxZIndexRef });

  const { visibleCards, visibleGroups, visibleCardIdSet } = useVirtualViewport({
    viewport,
    cards: canvasCards,
    groups: displayGroups,
    selectedCardIds,
    selectedGroupIds,
    bufferPx: 300,
  });

  // Paste & Shortcuts
  const { handlePaste } = useClipboardPaste({
    createCardAtCursor: actions.createCardAtCursor,
    updateCard: actions.handleCardUpdate,
    pasteCopiedCards: clipboard.handlePasteCopiedCards,
    getCopiedCards: () => clipboard.copiedCardsRef.current,
    getWorldPosition: () => mouseWorldRef.current,
    getCardById: (id) => cardsRef.current.find((card) => card.id === id),
    showToast,
  });

  const { isShiftPressedRef, isSpacePressedRef, isAltPressedRef } = useShortcuts({
    onNewCard: () => actions.createCardAtCursor({ type: 'text', content: '', width: 260, height: 180 }),
    onDelete: actions.handleDeleteSelected,
    onUndo: actions.handleUndo,
    onGroup: actions.handleGroup,
    onBundle: bundles.createBundle,
    onUngroup: actions.handleUngroup,
    onAutoPack: actions.handleAutoPack,
    onAlign: actions.handleAlign,
    onExportBackup: () => { exportBackup(cardsRef.current, groupsRef.current); showToast('已导出备份'); },
    onPaste: handlePaste,
    onCopy: clipboard.handleCopy,
    onDuplicate: clipboard.handleDuplicateSelected,
    onSearch: () => setIsSearchOpen(true),
    onMinimapOpen: minimap.handleMinimapOpen,
    onMinimapClose: minimap.handleMinimapClose,
  });

  const canvasInteractions = useCanvasInteractions({
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
    selectCard,
    selectGroup,
    beginMarqueeSelection,
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
    commitState: actions.commitState,
    pushHistory,
    showToast,
    onOpenPieMenu: pieMenu.openPieMenu,
    onUpdatePieMenuPointer: pieMenu.updatePieMenuPointer,
    onReleasePieMenuMouseDown: pieMenu.releasePieMenuMouseDown,
  });

  const { handleDrop } = useCanvasDrop({
    viewportRef,
    mouseWorldRef,
    cardsRef,
    groupsRef,
    setViewport,
    commitState: actions.commitState,
    pushHistory,
    createCardAtCursor: actions.createCardAtCursor,
    handleCardUpdate: actions.handleCardUpdate,
    showToast,
  });

  const handleCanvasCommand = useCallback((command: CanvasCommand) => {
    if (canvasMenuPosition) {
      mouseScreenRef.current = canvasMenuPosition;
      mouseWorldRef.current = {
        x: (canvasMenuPosition.x - viewportRef.current.x) / viewportRef.current.zoom,
        y: (canvasMenuPosition.y - viewportRef.current.y) / viewportRef.current.zoom,
      };
    }
    setCanvasMenuPosition(null);
    switch (command) {
      case 'note': actions.createCardAtCursor({ type: 'text', content: '', width: 260, height: 180 }); break;
      case 'parent': actions.handleCreateNewParentAtCursor(); break;
      case 'group': bundles.createBundle(); break;
      case 'search': setIsSearchOpen(true); break;
      case 'copy': clipboard.handleCopy(); break;
      case 'paste': clipboard.handlePasteCopiedCards(clipboard.copiedCardsRef.current); break;
      case 'fit': handleCanvasDoubleClick(canvasCards, fitGroups); break;
    }
  }, [actions, bundles, canvasCards, canvasMenuPosition, clipboard, fitGroups, handleCanvasDoubleClick,
    mouseScreenRef, mouseWorldRef, viewportRef]);

  return (
    <div
      ref={containerRef}
      className={`relative w-screen h-screen overflow-hidden select-none bg-parchment text-ink ${
        canvasInteractions.isZooming ? 'cursor-ns-resize [&_*]:!cursor-ns-resize'
          : canvasInteractions.isPanning ? 'cursor-grabbing [&_*]:!cursor-grabbing' : 'cursor-default'
      }`}
      onWheel={handleWheel}
      onWheelCapture={(e) => {
        if ((e.target as HTMLElement).closest('[data-card-id], [data-group-id], [data-bundle-id]')) {
          e.stopPropagation();
          handleWheel(e);
        }
      }}
      onMouseDownCapture={(e) => {
        if (e.button === 2) rightPointerDownRef.current = { x: e.clientX, y: e.clientY };
        const object = (e.target as HTMLElement).closest('[data-card-id], [data-group-id], [data-bundle-id]');
        if (!object) return;
        if (e.button === 1 || (e.button === 0 && (isSpacePressedRef.current || (e.altKey && !e.ctrlKey)))) {
          e.stopPropagation();
          canvasInteractions.handleMouseDown(e);
          return;
        }
        // Keep the control mounted while its own drag gesture is active.
        if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
        if (e.button === 0) {
          setPressedObject(object.getAttribute('data-card-id') || object.getAttribute('data-group-id') || object.getAttribute('data-bundle-id'));
        }
      }}
      onMouseDown={canvasInteractions.handleMouseDown}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-card-id]') && !target.closest('[data-group-id]') && !target.closest('[data-bundle-id]')) {
          setIsSearchOpen(true);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        if (target !== e.currentTarget && !target.closest('[data-canvas-surface]')) return;
        const start = rightPointerDownRef.current;
        rightPointerDownRef.current = null;
        if (target.closest('[data-card-id], [data-group-id], [data-bundle-id]')) return;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
        mouseScreenRef.current = { x: e.clientX, y: e.clientY };
        mouseWorldRef.current = { x: (e.clientX - viewportRef.current.x) / viewportRef.current.zoom,
          y: (e.clientY - viewportRef.current.y) / viewportRef.current.zoom };
        setCanvasMenuPosition({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        data-canvas-surface
        className="absolute inset-0 origin-top-left pointer-events-auto"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          willChange: 'transform',
        }}
      >
        <ParentLinkLines
          groups={displayGroups}
          cards={cards}
          selectedGroupIds={selectedGroupIds}
          selectedCardIds={selectedCardIds}
          dragOverGroupId={dragOverGroupId}
          interactiveWire={canvasInteractions.interactiveWire}
          visibleCardIdSet={visibleCardIdSet}
        />

        {visibleGroups.filter((group) => group.kind === 'bundle').map((group) => (
          <BundleGroupComponent
            key={group.id}
            group={group}
            members={cards.filter((card) => card.bundleId === group.id)}
            selected={selectedGroupIds.has(group.id) && pressedObject !== group.id}
            onDrag={(event) => canvasInteractions.handleStartGroupDrag(group, event)}
            onResize={(corner, event) => bundles.startBundleResize(group.id, corner, event)}
            onToggle={() => bundles.toggleBundle(group.id)}
            onOpenPieMenu={(x, y) => pieMenu.openGroupPieMenu(group, x, y)}
          />
        ))}

        {visibleGroups.filter((group) => group.kind !== 'bundle').map((group) => (
          <GroupComponent
            key={group.id}
            group={group}
            isSelected={selectedGroupIds.has(group.id) && pressedObject !== group.id}
            childCount={getParentLinkage(cards, group.id).cardIds.size}
            isDragOver={dragOverGroupId === group.id}
            onSelect={(e) => canvasInteractions.handleStartGroupDrag(group, e)}
            onRename={renameGroup}
            onUngroup={dissolveParent}
            onOpenMenu={(x, y) => pieMenu.openGroupPieMenu(group, x, y)}
          />
        ))}

        {visibleCards.map((card) => (
          <CardComponent
            key={card.id}
            card={card}
            isSelected={selectedCardIds.has(card.id)}
            showSelectionControls={selectedCardIds.has(card.id) && pressedObject !== card.id}
            onSelect={(e) => canvasInteractions.handleStartCardDrag(card, e)}
            onUpdate={actions.handleCardUpdate}
            onDoubleClick={handleCardDoubleClick}
            onStartScale={(c, clientX) => canvasInteractions.handleStartCardScale(c, clientX)}
            onStartResize={(c, handle, e) => canvasInteractions.handleStartCardResize(c, handle, e)}
            zoom={viewport.zoom}
          />
        ))}

        <SelectionBox box={selectionRect} />
        <SnapGuides lines={snapLines} />
      </div>

      <CanvasModals
        cards={cards}
        minimapCards={canvasCards}
        groups={displayGroups}
        viewport={viewport}
        setViewport={setViewport}
        setSelectedCardIds={setSelectedCardIds}
        activePieMenu={pieMenu.activePieMenu}
        onConfirmPieDate={pieMenu.handleConfirmPieDate}
        onConfirmPieTitle={pieMenu.handleConfirmPieTitle}
        onTogglePieTag={pieMenu.handleTogglePieTag}
        onGroupColor={pieMenu.handleGroupColor}
        onReparseLink={pieMenu.handleReparseLink}
        onRecognizeImage={pieMenu.handleRecognizeImage}
        onUngroupBundle={bundles.ungroupBundle}
        onDissolveParent={dissolveParent}
        onDetachCardFromBundle={bundles.detachCardFromBundle}
        onDisconnectCardParent={bundles.disconnectCardParent}
        onDisconnectGroupParent={bundles.disconnectBundleParent}
        onClosePieMenu={pieMenu.closePieMenu}
        isSearchOpen={isSearchOpen}
        onCloseSearch={() => setIsSearchOpen(false)}
        onSelectSearchCard={(c) => {
          if (c.bundleId && collapsedIds.has(c.bundleId)) bundles.toggleBundle(c.bundleId);
          setSelectedCardIds(new Set([c.id]));
          setViewport(computeCardFocusViewport(c, window.innerWidth, window.innerHeight));
        }}
        isMinimapExpanded={minimap.isMinimapExpanded}
      />
      {canvasMenuPosition && <CanvasCommandMenu position={canvasMenuPosition}
        canCopy={selectedCardIds.size > 0}
        canPaste={clipboard.copiedCardsRef.current.length > 0}
        onCommand={handleCanvasCommand}
        onClose={() => setCanvasMenuPosition(null)} />}
    </div>
  );
}
