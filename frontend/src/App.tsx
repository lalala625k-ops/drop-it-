import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Card, Viewport } from './types';
import { CardComponent } from './components/CardComponent';
import { GroupComponent } from './components/GroupComponent';
import { BundleGroupComponent } from './components/BundleGroupComponent';
import { ParentLinkLines } from './components/ParentLinkLines';
import { FarCanvas } from './components/FarCanvas';
import { ClipboardPastePreview } from './components/ClipboardPastePreview';
import { SelectionBox } from './components/SelectionBox';
import { SnapGuides } from './components/SnapGuides';
import { CanvasCommandMenu, CanvasCommand } from './components/CanvasCommandMenu';
import { CanvasModals } from './components/CanvasModals';
import { ReverseResolutionPanel } from './components/ReverseResolutionPanel';
import { RecognitionDiagnostics } from './components/RecognitionDiagnostics';
import { RecognitionReport } from './utils/recognizeCardImage';
import { useCanvasPins } from './hooks/useCanvasPins';
import { PinInputModal } from './components/PinInputModal';
import { CanvasPinsLayer } from './components/CanvasPinsLayer';
import { useSettings } from './hooks/useSettings';
import { SettingsModal } from './components/SettingsModal';

import { computeCardFocusViewport } from './utils/canvas';
import { getNowFormatted } from './utils/dateParser';
import { exportBackup, getLocalData, getRemoteRevision, currentServerRevision } from './utils/storage';
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
import { bundleBoundsFromMembers, bundleCollapsedHeight, bundleCollapsedWidth, useBundleGroups } from './hooks/useBundleGroups';

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const cardsRef = useRef<Card[]>(cards);
  cardsRef.current = cards;

  const maxZIndexRef = useRef(10);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pressedObject, setPressedObject] = useState<string | null>(null);
  const [canvasMenuPosition, setCanvasMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const suppressPasteClickRef = useRef(false);

  useEffect(() => {
    const release = () => setPressedObject(null);
    window.addEventListener('mouseup', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('blur', release);
    };
  }, []);

  useEffect(() => {
    const onConflict = () => window.alert('另一窗口已经修改画布。本窗口的修改已保存在本地，请先备份或刷新后处理冲突。');
    const onFocus = async () => {
      const revision = await getRemoteRevision();
      if (revision === null || revision === currentServerRevision()) return;
      if (getLocalData()?.pendingSync) { onConflict(); return; }
      window.location.reload();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('pinboard-sync-conflict', onConflict);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pinboard-sync-conflict', onConflict);
    };
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  const [recognitionReports, setRecognitionReports] = useState<RecognitionReport[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const onRecognitionReport = useCallback((report: RecognitionReport) => {
    setRecognitionReports((previous) => [report, ...previous].slice(0, 20));
    setDiagnosticsOpen(true);
  }, []);
  const showToast = useCallback((msg: string) => setToast(msg), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Base Canvas & State Hooks
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const {
    settings,
    updateShortcuts,
    updateGeneral,
    resetShortcuts,
  } = useSettings();

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
  } = useViewport({ invertWheelZoom: settings.general.invertWheelZoom });

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

  const membersByBundle = useMemo(() => {
    const result = new Map<string, Card[]>();
    for (const card of cards) if (card.bundleId) {
      const members = result.get(card.bundleId) || [];
      members.push(card);
      result.set(card.bundleId, members);
    }
    return result;
  }, [cards]);
  const displayGroups = useMemo(() => groups.map((group) =>
    group.kind === 'bundle' && !group.collapsed
      ? bundleBoundsFromMembers(membersByBundle.get(group.id) || [], group) : group
  ), [groups, membersByBundle]);
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
    selectedGroupIdsRef,
    setSelectedCardIds,
    setSelectedGroupIds,
    setCards,
    setGroups,
    maxZIndexRef,
    mouseWorldRef,
    mouseScreenRef,
    pushHistory,
    showToast,
  });

  const pieMenu = usePieMenuState({ cardsRef, groupsRef, setCards, setGroups, pushHistory, showToast, onRecognitionReport });
  const resolutionCard = pieMenu.resolutionPanel
    ? cards.find((card) => card.id === pieMenu.resolutionPanel?.cardId && card.type === 'image')
    : null;

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
    const nextGroups = groupsRef.current.filter((group) => group.id !== parentId)
      .map((group) => group.parentIds?.includes(parentId)
        ? { ...group, parentIds: group.parentIds.filter((id) => id !== parentId) } : group);
    actions.commitState(nextCards, nextGroups);
    setSelectedGroupIds((previous) => {
      const next = new Set(previous);
      next.delete(parentId);
      return next;
    });
    showToast('已解散父物体，卡片已保留');
  }, [actions.commitState, pushHistory, setSelectedGroupIds, showToast]);

  useCanvasInit({ setCards, setGroups, setViewport, maxZIndexRef });

  const parentHighlights = useMemo(() => {
    const cardIds = new Set<string>();
    const bundleIds = new Set<string>();
    for (const id of [...selectedGroupIds, ...selectedCardIds]) {
      const linked = getParentLinkage(cards, id, displayGroups);
      linked.cardIds.forEach((id) => cardIds.add(id));
      linked.bundleIds.forEach((id) => bundleIds.add(id));
    }
    return { cardIds, bundleIds };
  }, [cards, displayGroups, selectedCardIds, selectedGroupIds]);

  const { visibleCards, visibleGroups, visibleCardIdSet } = useVirtualViewport({
    viewport,
    cards: canvasCards,
    groups: displayGroups,
    selectedCardIds,
    selectedGroupIds,
    highlightedCardIds: parentHighlights.cardIds,
    highlightedGroupIds: parentHighlights.bundleIds,
    bufferPx: 300,
  });
  const farMode = viewport.zoom < 0.18 && visibleCards.length > 150;
  const bundleContentScales = useMemo(() => new Map(groups
    .filter((group) => group.kind === 'bundle')
    .map((group) => [group.id, (group.outlinePadding ?? 18) / 18])), [groups]);

  const canvasPins = useCanvasPins({
    viewportRef,
    setViewport,
    showToast,
  });

  // Paste & Shortcuts
  const { handlePaste, handleDroppedData, pasteFromSystemClipboard } = useClipboardPaste({
    createCardAtCursor: actions.createCardAtCursor,
    updateCard: actions.handleCardUpdate,
    stageCopiedObjects: clipboard.stagePaste,
    getCopiedObjects: () => clipboard.copiedObjectsRef.current,
    getWorldPosition: () => mouseWorldRef.current,
    getCardById: (id) => cardsRef.current.find((card) => card.id === id),
    showToast,
  });

  const resetObjectSize = useCallback((id: string) => {
    const selectedIds = selectedCardIdsRef.current;
    if (selectedIds.has(id) && selectedIds.size > 1) {
      selectedIds.forEach((cardId) => {
        actions.handleResetCardSize(cardId);
      });
      return;
    }
    const group = groupsRef.current.find((item) => item.id === id && item.kind === 'bundle');
    if (group) { bundles.resetBundleSize(group.id); return; }
    const card = cardsRef.current.find((item) => item.id === id);
    if (!card) return;
    if (card.bundleId && groupsRef.current.some((item) => item.id === card.bundleId && item.kind === 'bundle')) {
      bundles.resetBundleSize(card.bundleId);
    } else actions.handleResetCardSize(card.id);
  }, [actions.handleResetCardSize, bundles.resetBundleSize, cardsRef, groupsRef]);

  const handleDetachCardFromBundle = useCallback((cardId: string) => {
    const selectedIds = selectedCardIdsRef.current;
    if (selectedIds.has(cardId) && selectedIds.size > 1) {
      selectedIds.forEach((cid) => bundles.detachCardFromBundle(cid));
      return;
    }
    bundles.detachCardFromBundle(cardId);
  }, [bundles]);

  const handleDisconnectCardParent = useCallback((cardId: string) => {
    const selectedIds = selectedCardIdsRef.current;
    if (selectedIds.has(cardId) && selectedIds.size > 1) {
      selectedIds.forEach((cid) => bundles.disconnectCardParent(cid));
      return;
    }
    bundles.disconnectCardParent(cardId);
  }, [bundles]);

  const getSelectedSingleId = useCallback(() => {
    return [...selectedGroupIdsRef.current][0] || [...selectedCardIdsRef.current][0] || null;
  }, []);

  const handleShortcutEditTitle = useCallback(() => {
    const id = getSelectedSingleId();
    if (!id) return;
    const card = cardsRef.current.find((c) => c.id === id);
    if (card) {
      pieMenu.openPieMenu(card, window.innerWidth / 2, window.innerHeight / 2);
      return;
    }
    const group = groupsRef.current.find((g) => g.id === id);
    if (group) {
      pieMenu.openGroupPieMenu(group, window.innerWidth / 2, window.innerHeight / 2);
    }
  }, [getSelectedSingleId, pieMenu]);

  const handleShortcutClearTitle = useCallback(() => {
    const id = getSelectedSingleId();
    if (!id) return;
    pieMenu.handleConfirmPieTitle(id, null);
  }, [getSelectedSingleId, pieMenu]);

  const handleShortcutSetTime = useCallback(() => {
    const id = getSelectedSingleId();
    if (!id) return;
    const card = cardsRef.current.find((c) => c.id === id);
    if (card) {
      pieMenu.openPieMenu(card, window.innerWidth / 2, window.innerHeight / 2);
      return;
    }
    const group = groupsRef.current.find((g) => g.id === id);
    if (group) {
      pieMenu.openGroupPieMenu(group, window.innerWidth / 2, window.innerHeight / 2);
    }
  }, [getSelectedSingleId, pieMenu]);

  const handleShortcutSetNow = useCallback(() => {
    const id = getSelectedSingleId();
    if (!id) return;
    const now = getNowFormatted().formattedText;
    pieMenu.handleConfirmPieDate(id, now);
  }, [getSelectedSingleId, pieMenu]);

  const handleShortcutManageTags = useCallback(() => {
    const id = getSelectedSingleId();
    if (!id) return;
    const card = cardsRef.current.find((c) => c.id === id);
    if (card) {
      pieMenu.openPieMenu(card, window.innerWidth / 2, window.innerHeight / 2);
      return;
    }
    const group = groupsRef.current.find((g) => g.id === id);
    if (group) {
      pieMenu.openGroupPieMenu(group, window.innerWidth / 2, window.innerHeight / 2);
    }
  }, [getSelectedSingleId, pieMenu]);

  const handleShortcutDisconnectParent = useCallback(() => {
    const cardId = [...selectedCardIdsRef.current][0];
    if (cardId) {
      bundles.disconnectCardParent(cardId);
      return;
    }
    const groupId = [...selectedGroupIdsRef.current][0];
    if (groupId) {
      const group = groupsRef.current.find((g) => g.id === groupId && g.kind === 'bundle');
      const parentId = group?.parentIds?.[0];
      if (parentId) bundles.disconnectBundleParent(groupId, parentId);
    }
  }, [bundles]);

  const handleShortcutDetachFromBundle = useCallback(() => {
    const cardId = [...selectedCardIdsRef.current][0];
    if (cardId) bundles.detachCardFromBundle(cardId);
  }, [bundles]);

  const handleShortcutReparseLink = useCallback(() => {
    const cardId = [...selectedCardIdsRef.current].find((id) =>
      cardsRef.current.some((c) => c.id === id && c.type === 'web' && c.url));
    if (cardId) pieMenu.handleReparseLink(cardId);
  }, [pieMenu]);

  const handleShortcutImageOCR = useCallback(() => {
    const cardId = [...selectedCardIdsRef.current].find((id) =>
      cardsRef.current.some((c) => c.id === id && c.type === 'image'));
    if (cardId) pieMenu.handleRecognizeImage(cardId, 'ocr');
  }, [pieMenu]);

  const handleShortcutImageLink = useCallback(() => {
    const cardId = [...selectedCardIdsRef.current].find((id) =>
      cardsRef.current.some((c) => c.id === id && c.type === 'image'));
    if (cardId) pieMenu.handleRecognizeImage(cardId, 'link');
  }, [pieMenu]);

  const { isShiftPressedRef, isSpacePressedRef, isAltPressedRef } = useShortcuts({
    onNewCard: () => actions.createCardAtCursor({ type: 'text', content: '', width: 260, height: 180 }),
    onDelete: actions.handleDeleteSelected,
    onUndo: actions.handleUndo,
    onGroup: actions.handleGroup,
    onBundle: bundles.createBundle,
    onUngroup: actions.handleUngroup,
    onResetSize: () => {
      const id = [...selectedGroupIdsRef.current].find((groupId) =>
        groupsRef.current.some((group) => group.id === groupId && group.kind === 'bundle'))
        || [...selectedCardIdsRef.current][0];
      if (id) resetObjectSize(id);
    },
    onAutoPack: actions.handleAutoPack,
    onAlign: actions.handleAlign,
    onExportBackup: () => { exportBackup(cardsRef.current, groupsRef.current); showToast('已导出备份'); },
    onPaste: handlePaste,
    onCopy: clipboard.handleCopy,
    onDuplicate: clipboard.handleDuplicateSelected,
    onSearch: () => setIsSearchOpen(true),
    onMinimapOpen: minimap.handleMinimapOpen,
    onMinimapClose: minimap.handleMinimapClose,
    onEditTitle: handleShortcutEditTitle,
    onClearTitle: handleShortcutClearTitle,
    onSetTime: handleShortcutSetTime,
    onSetNow: handleShortcutSetNow,
    onManageTags: handleShortcutManageTags,
    onDisconnectParent: handleShortcutDisconnectParent,
    onDetachFromBundle: handleShortcutDetachFromBundle,
    onUniformWidth: actions.handleUniformCardWidth,
    onReparseLink: handleShortcutReparseLink,
    onRecognizeImageOCR: handleShortcutImageOCR,
    onRecognizeImageLink: handleShortcutImageLink,
    onFitCanvas: () => handleCanvasDoubleClick(canvasCards, fitGroups),
    onJumpToPin: canvasPins.jumpToPin,
    shortcutsConfig: settings.shortcuts,
    onOpenSettings: () => setIsSettingsOpen(true),
  });

  const handleImportComplete = useCallback((data: {
    cards: Card[];
    groups: any[];
    viewport?: Viewport;
    pins?: any[];
  }) => {
    pushHistory(cardsRef.current, groupsRef.current);
    actions.commitState(data.cards, data.groups);
    if (data.viewport) {
      setViewport(data.viewport);
    }
    if (data.pins && Array.isArray(data.pins)) {
      canvasPins.replacePins(data.pins);
    }
  }, [actions.commitState, canvasPins, pushHistory, setViewport]);

  useEffect(() => {
    if (!clipboard.hasPendingPaste) return;
    let frame: number | null = null;
    let nextPosition = clipboard.pasteScreenPosition;
    const move = (event: MouseEvent) => {
      nextPosition = { x: event.clientX, y: event.clientY };
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        clipboard.setPasteScreenPosition(nextPosition);
        frame = null;
      });
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); clipboard.cancelPendingPaste(); }
    };
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('keydown', cancel);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('keydown', cancel);
    };
  }, [clipboard.hasPendingPaste, clipboard.setPasteScreenPosition, clipboard.cancelPendingPaste]);

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
    onOpenGroupPieMenu: pieMenu.openGroupPieMenu,
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
    handleDroppedData,
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
      case 'copy': void clipboard.handleCopy(); break;
      case 'paste': void pasteFromSystemClipboard(); break;
      case 'pin':
        canvasPins.openPinPrompt(
          canvasMenuPosition || mouseScreenRef.current,
          mouseWorldRef.current
        );
        break;
      case 'fit': handleCanvasDoubleClick(canvasCards, fitGroups); break;
      case 'uniform-width': actions.handleUniformCardWidth(); break;
    }
  }, [actions, bundles, canvasCards, canvasMenuPosition, canvasPins, clipboard, fitGroups, handleCanvasDoubleClick,
    mouseScreenRef, mouseWorldRef, pasteFromSystemClipboard, viewportRef]);

  return (
    <div
      ref={containerRef}
      className={`relative w-screen h-screen overflow-hidden select-none bg-parchment text-ink ${
        canvasInteractions.isZooming ? 'cursor-ns-resize [&_*]:!cursor-ns-resize'
          : canvasInteractions.isPanning ? 'cursor-grabbing [&_*]:!cursor-grabbing' : 'cursor-default'
      }`}
      onWheel={handleWheel}
      onWheelCapture={(e) => {
        if ((e.target as HTMLElement).closest('textarea, input, [contenteditable="true"]')) {
          e.stopPropagation();
          return;
        }
        if ((e.target as HTMLElement).closest('[data-card-id], [data-group-id], [data-bundle-id]')) {
          e.stopPropagation();
          handleWheel(e);
        }
      }}
      onMouseDownCapture={(e) => {
        if (clipboard.hasPendingPaste && e.button === 0 &&
          (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-canvas-surface]'))) {
          e.preventDefault();
          e.stopPropagation();
          suppressPasteClickRef.current = true;
          const target = { x: (e.clientX - viewportRef.current.x) / viewportRef.current.zoom,
            y: (e.clientY - viewportRef.current.y) / viewportRef.current.zoom };
          mouseWorldRef.current = target;
          clipboard.commitPendingPaste(target);
          return;
        }
        const object = (e.target as HTMLElement).closest('[data-card-id], [data-group-id], [data-bundle-id]');
        const editable = (e.target as HTMLElement).closest('textarea, input, [contenteditable="true"]');
        if (editable && !(e.button === 2 && object?.hasAttribute('data-card-id'))) return;
        const isOverlayUI = (e.target as HTMLElement).closest(
          '[data-modal], [data-dialog], [role="dialog"], button, select, input, textarea'
        );
        if (isOverlayUI && !object) return;
        if (e.button === 2) {
          e.preventDefault();
          e.stopPropagation();
          if (object) canvasInteractions.handleMouseDown(e);
          else {
            mouseScreenRef.current = { x: e.clientX, y: e.clientY };
            mouseWorldRef.current = { x: (e.clientX - viewportRef.current.x) / viewportRef.current.zoom,
              y: (e.clientY - viewportRef.current.y) / viewportRef.current.zoom };
            setCanvasMenuPosition({ x: e.clientX, y: e.clientY });
          }
          return;
        }
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
      onClickCapture={(e) => {
        if (!suppressPasteClickRef.current) return;
        suppressPasteClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={canvasInteractions.handleMouseDown}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-card-id]') && !target.closest('[data-group-id]') && !target.closest('[data-bundle-id]')) {
          setIsSearchOpen(true);
        }
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={handleDrop}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      {farMode && <FarCanvas cards={visibleCards} groups={visibleGroups} viewport={viewport} />}
      <div
        data-canvas-surface
        className="absolute inset-0 origin-top-left pointer-events-auto"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          willChange: 'transform',
        }}
      >
        <CanvasPinsLayer
          pins={canvasPins.pins}
          onJump={canvasPins.jumpToPin}
          onRemove={canvasPins.removePin}
          onUpdatePosition={canvasPins.updatePinPosition}
          zoom={viewport.zoom}
        />
        <ParentLinkLines
          groups={displayGroups}
          cards={cards}
          selectedGroupIds={selectedGroupIds}
          selectedCardIds={selectedCardIds}
          dragOverGroupId={dragOverGroupId}
          interactiveWire={canvasInteractions.interactiveWire}
          visibleCardIdSet={visibleCardIdSet}
        />

        {visibleGroups.filter((group) => group.kind === 'bundle' && (!farMode || selectedGroupIds.has(group.id))).map((group) => (
          <BundleGroupComponent
            key={group.id}
            group={group}
            members={membersByBundle.get(group.id) || []}
            selected={selectedGroupIds.has(group.id) && pressedObject !== group.id}
            parentHighlighted={parentHighlights.bundleIds.has(group.id)}
            onDrag={(event) => canvasInteractions.handleStartGroupDrag(group, event)}
            onResize={(corner, event) => bundles.startBundleResize(group.id, corner, event)}
            onToggle={() => bundles.toggleBundle(group.id)}
            onOpenPieMenu={(x, y) => pieMenu.openGroupPieMenu(group, x, y)}
          />
        ))}

        {visibleGroups.filter((group) => group.kind !== 'bundle' && (!farMode || selectedGroupIds.has(group.id))).map((group) => (
          <GroupComponent
            key={group.id}
            group={group}
            isSelected={selectedGroupIds.has(group.id) && pressedObject !== group.id}
            childCount={getParentLinkage(cards, group.id, displayGroups).cardIds.size}
            isDragOver={dragOverGroupId === group.id}
            onSelect={(e) => canvasInteractions.handleStartGroupDrag(group, e)}
            onRename={renameGroup}
            onUngroup={dissolveParent}
          />
        ))}

        {visibleCards.filter((card) => !farMode || selectedCardIds.has(card.id)).map((card) => (
          <CardComponent
            key={card.id}
            card={card}
            contentScale={card.bundleId ? bundleContentScales.get(card.bundleId) ?? 1 : 1}
            isSelected={selectedCardIds.has(card.id)}
            showSelectionControls={selectedCardIds.has(card.id) && pressedObject !== card.id}
            parentHighlighted={parentHighlights.cardIds.has(card.id)}
            onSelect={(e) => canvasInteractions.handleStartCardDrag(card, e)}
            onUpdate={actions.handleCardUpdate}
            onTextEdit={actions.handleCardTextEdit}
            onTextEditStart={() => pushHistory(cardsRef.current, groupsRef.current)}
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
        minimapCards={cards}
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
        onResetObjectSize={resetObjectSize}
        onDissolveParent={dissolveParent}
        onDetachCardFromBundle={handleDetachCardFromBundle}
        onDisconnectCardParent={handleDisconnectCardParent}
        onDisconnectGroupParent={bundles.disconnectBundleParent}
        onClosePieMenu={pieMenu.closePieMenu}
        onUniformWidth={() => actions.handleUniformCardWidth(pieMenu.activePieMenu?.selectedCardIds)}
        isSearchOpen={isSearchOpen}
        onCloseSearch={() => setIsSearchOpen(false)}
        onSelectSearchCard={(c) => {
          if (c.bundleId && collapsedIds.has(c.bundleId)) bundles.toggleBundle(c.bundleId);
          setSelectedCardIds(new Set([c.id]));
          setViewport(computeCardFocusViewport(c, window.innerWidth, window.innerHeight));
        }}
        isMinimapExpanded={minimap.isMinimapExpanded}
        showCornerMinimap={settings.general.minimapMode === 'always'}
      />
      {clipboard.pendingPaste && <ClipboardPastePreview snapshot={clipboard.pendingPaste}
        screen={clipboard.pasteScreenPosition} zoom={viewport.zoom} />}
      {canvasMenuPosition && <CanvasCommandMenu position={canvasMenuPosition}
        canCopy={selectedCardIds.size > 0 || selectedGroupIds.size > 0}
        canPaste={clipboard.copiedObjectsRef.current.cards.length + clipboard.copiedObjectsRef.current.groups.length > 0}
        canUniformWidth={cards.length > 1}
        onCommand={handleCanvasCommand}
        onClose={() => setCanvasMenuPosition(null)} />}
      {canvasPins.pinPrompt && (
        <PinInputModal
          prompt={canvasPins.pinPrompt}
          existingPins={canvasPins.pins}
          onConfirm={(num) => canvasPins.addOrUpdatePin(num, canvasPins.pinPrompt!.world, viewport.zoom)}
          onClose={canvasPins.closePinPrompt}
        />
      )}
      {pieMenu.resolutionPanel && resolutionCard && (
        <ReverseResolutionPanel card={resolutionCard} viewport={viewport}
          resolution={pieMenu.resolutionPanel.resolution}
          onClose={pieMenu.closeResolutionPanel}
          onConfirm={pieMenu.handleConfirmCandidate} />
      )}
      <div className="fixed right-3 top-3 z-[115] flex items-center gap-2">
        {recognitionReports.length > 0 && !diagnosticsOpen && (
          <button type="button" onClick={() => setDiagnosticsOpen(true)}
            className="border border-ink bg-paper px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink hover:text-paper transition-colors cursor-pointer rounded-[10px]">
            识别记录 {recognitionReports.length}
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          title="设置 (Ctrl+,)"
          className="border border-ink bg-paper px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink hover:text-paper transition-colors cursor-pointer rounded-[10px]"
        >
          ⚙ 设置
        </button>
      </div>
      {diagnosticsOpen && <RecognitionDiagnostics reports={recognitionReports}
        activeReviewCardId={pieMenu.resolutionPanel?.cardId}
        onConfirmCandidate={pieMenu.handleConfirmCandidate}
        onClose={() => setDiagnosticsOpen(false)} />}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateShortcuts={updateShortcuts}
        onUpdateGeneral={updateGeneral}
        onResetShortcuts={resetShortcuts}
        cards={cards}
        groups={displayGroups}
        viewport={viewport}
        pins={canvasPins.pins}
        onImportComplete={handleImportComplete}
        showToast={showToast}
      />
      {toast && <div role="status" aria-live="polite"
        className="fixed bottom-6 left-1/2 z-[120] max-w-[min(90vw,480px)] -translate-x-1/2 border border-ink bg-paper px-4 py-3 text-center text-xs text-ink shadow-xl pointer-events-none">
        {toast}
      </div>}
    </div>
  );
}
