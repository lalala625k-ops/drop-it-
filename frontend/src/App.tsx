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
import { applyGroupMenuAction } from './utils/groupMenuActions';
import { CanvasModals } from './components/CanvasModals';
import { DesktopWindowControls } from './components/DesktopWindowControls';
import { useCanvasPins } from './hooks/useCanvasPins';
import { PinInputModal } from './components/PinInputModal';
import { CanvasPinsLayer } from './components/CanvasPinsLayer';
import { useSettings } from './hooks/useSettings';
import { SettingsModal } from './components/SettingsModal';

import { computeCardFocusViewport } from './utils/canvas';
import { getNowFormatted } from './utils/dateParser';
import { acceptLoadedWorkspace, getLocalData, getRemoteRevision, currentServerRevision, openDropFile, saveDropFile } from './utils/storage';
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
import { useWorkspaceDraft } from './hooks/useWorkspaceDraft';
import { flushWorkspaceDraft, workspaceRequest, LoadedWorkspace } from './utils/workspaceApi';
import { openBoardWindow, consumeOpenFileRequest } from './utils/boardWindows';
import { useCanvasCards } from './hooks/useCanvasCards';
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
  const savingDropRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => setToast(msg), []);

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
    // A blocking browser alert can make the canvas appear frozen (especially
    // in the desktop WebView, where the dialog is easy to miss).  Surface the
    // same conflict as the app toast so the board remains interactive.
    const onConflict = () => showToast('另一窗口已经修改画布。本窗口的修改已保存在本地，请先备份或刷新后处理冲突。');
    const onFocus = async () => {
      if (savingDropRef.current) return;
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
  }, [showToast]);

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

  const {
    viewport,
    setViewport,
    viewportRef,
    surfaceRef,
    mouseScreenRef,
    mouseWorldRef,
    handleWheel,
    flushWheelZoom,
    isWheelZooming,
    wheelLodZoom,
    handleCardDoubleClick,
    handleCanvasDoubleClick,
  } = useViewport({ invertWheelZoom: settings.general.invertWheelZoom });

  const canvasPins = useCanvasPins({ viewportRef, setViewport, showToast });
  const { pushHistory, undo } = useHistory(canvasPins.pinsRef);
  const {
    selectedCardIds,
    setSelectedCardIds,
    selectedCardIdsRef,
    selectedGroupIds,
    setSelectedGroupIds,
    selectedGroupIdsRef,
    selectedPinIds,
    setSelectedPinIds,
    selectedPinIdsRef,
    selectionRect,
    setSelectionRect,
    clearSelection,
    selectCard,
    selectGroup,
    selectPin,
    beginMarqueeSelection,
    updateMarqueeSelection,
  } = useSelection(canvasPins.pinsRef, viewportRef);

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
  const canvasCards = useCanvasCards(cards, collapsedIds);
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
    pinsRef: canvasPins.pinsRef,
    selectedPinIdsRef,
    replacePins: canvasPins.replacePins,
    setSelectedPinIds,
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

  const pieMenu = usePieMenuState({ cardsRef, groupsRef, setCards, setGroups, pushHistory, showToast });

  const actions = useCanvasActions({
    cardsRef,
    setCards,
    groupsRef,
    setGroups,
    selectedCardIdsRef,
    setSelectedCardIds,
    selectedGroupIdsRef,
    pinsRef: canvasPins.pinsRef,
    selectedPinIdsRef,
    replacePins: canvasPins.replacePins,
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
    showToast('已解散原点，卡片已保留');
  }, [actions.commitState, pushHistory, setSelectedGroupIds, showToast]);

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
  const farModeCandidate = viewport.zoom < 0.18 && visibleCards.length > 150;
  const farModeRef = useRef(farModeCandidate);
  if (!isWheelZooming) farModeRef.current = farModeCandidate;
  const farMode = isWheelZooming ? farModeRef.current : farModeCandidate;
  // Keep image cards on the DOM rendering path. The experimental canvas
  // compositor could leave a card frame visible when a canvas image failed
  // to load, while the regular image element has a reliable source fallback.
  const highQualityImageMode = true;
  const bundleContentScales = useMemo(() => new Map(groups
    .filter((group) => group.kind === 'bundle')
    .map((group) => [group.id, (group.outlinePadding ?? 18) / 18])), [groups]);

  // Paste & Shortcuts
  const { handlePaste, handleDroppedData, pasteFromSystemClipboard } = useClipboardPaste({
    createCardAtCursor: actions.createCardAtCursor,
    updateCard: actions.handleCardUpdate,
    stageCopiedObjects: clipboard.stagePaste,
    getCopiedObjects: () => clipboard.copiedObjectsRef.current,
    hasCanvasMultiSelection: selectedCardIds.size + selectedGroupIds.size + selectedPinIds.size > 1,
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

  const handleSaveDrop = useCallback(async (saveAs = false) => {
    if (savingDropRef.current) return;
    savingDropRef.current = true;
    setToast(null);
    try {
      await flushWorkspaceDraft();
      const result = await saveDropFile(cardsRef.current, groupsRef.current, viewportRef.current, canvasPins.pins, saveAs);
      if (result.success) showToast(`保存成功，文件已保存到：\n${result.path}`);
    } catch (error) {
      showToast(`保存失败: ${error instanceof Error ? error.message : '无法写入 .drop 文件'}`);
    } finally {
      savingDropRef.current = false;
    }
  }, [cardsRef, groupsRef, viewportRef, canvasPins.pins, showToast]);

  const handleLoadDrop = useCallback(async () => {
    if (savingDropRef.current) return;
    savingDropRef.current = true;
    setToast(null);
    try {
      await flushWorkspaceDraft();
      const result = await openDropFile();
      if (!result.success) return;
      setCards(result.cards);
      setGroups(result.groups);
      clearSelection();
      acceptLoadedWorkspace(result.cards, result.groups, result.revision, result.workspace_id);
      if (result.viewport && typeof result.viewport.x === 'number' &&
        typeof result.viewport.y === 'number' && typeof result.viewport.zoom === 'number') {
        setViewport(result.viewport);
      } else {
        handleCanvasDoubleClick(result.cards, result.groups);
      }
      canvasPins.replacePins(Array.isArray(result.pins) ? result.pins : []);
      let maxZ = 10;
      result.cards.forEach((card) => {
        if (card.zIndex && card.zIndex > maxZ) maxZ = card.zIndex;
      });
      maxZIndexRef.current = maxZ + 1;
      showToast(`打开成功：${result.path}`);
    } catch (error) {
      showToast(`打开失败: ${error instanceof Error ? error.message : '无法读取 .drop 文件'}`);
    } finally {
      savingDropRef.current = false;
    }
  }, [canvasPins, handleCanvasDoubleClick, clearSelection, setViewport, showToast]);

  const handleOpenDrop = useCallback(async () => {
    if (savingDropRef.current) return;
    savingDropRef.current = true;
    setToast(null);
    try {
      await openBoardWindow(true, flushWorkspaceDraft);
    } catch (error) {
      showToast(`打开失败: ${error instanceof Error ? error.message : '无法读取 .drop 文件'}`);
    } finally {
      savingDropRef.current = false;
    }
  }, [showToast]);

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
    onSaveDrop: (saveAs) => { void handleSaveDrop(saveAs); },
    onPaste: handlePaste,
    onCopy: clipboard.handleCopy,
    onCut: clipboard.handleCut,
    hasCanvasMultiSelection: selectedCardIds.size + selectedGroupIds.size + selectedPinIds.size > 1,
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
    createCardAtCursor: actions.createCardAtCursor,
    handleCardUpdate: actions.handleCardUpdate,
    handleDroppedData,
    showToast,
  });

  const workspaceReady = useCanvasInit({ setCards, setGroups, setViewport, maxZIndexRef, replacePins: canvasPins.replacePins });
  useWorkspaceDraft(workspaceReady, { cards, groups, viewport, pins: canvasPins.pins }, showToast);

  const handleRestoreWorkspace = async (workspaceId: string, snapshotId: string) => {
    if (savingDropRef.current) throw new Error('正在处理文件，请稍候');
    savingDropRef.current = true;
    try {
      const reserved = await workspaceRequest<{ reservation_id: string }>('/api/workspace/reserve-recovery', { workspace_id: workspaceId, snapshot_id: snapshotId });
      await flushWorkspaceDraft();
      const loaded = await workspaceRequest<LoadedWorkspace>('/api/workspace/restore', { workspace_id: workspaceId, snapshot_id: snapshotId, reservation_id: reserved.reservation_id });
      acceptLoadedWorkspace(loaded.cards, loaded.groups, loaded.revision, loaded.workspace_id);
      setCards(loaded.cards); setGroups(loaded.groups);
      if (loaded.viewport) setViewport(loaded.viewport);
      else handleCanvasDoubleClick(loaded.cards, loaded.groups);
      canvasPins.replacePins(loaded.pins);
      clearSelection();
      maxZIndexRef.current = Math.max(10, ...loaded.cards.map((card) => card.zIndex || 0)) + 1;
      showToast('已恢复所选版本，当前修改已另行暂存。');
    } finally { savingDropRef.current = false; }
  };

  const handleTextEditStart = useCallback(() => pushHistory(cardsRef.current, groupsRef.current),
    [pushHistory, cardsRef, groupsRef]);

  const handleNewBoard = useCallback(() => {
    void openBoardWindow().catch((error) => showToast(`打开失败: ${error.message}`));
  }, [showToast]);

  useEffect(() => {
    if (workspaceReady && consumeOpenFileRequest()) void handleLoadDrop();
  }, [workspaceReady, handleLoadDrop]);

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
      case 'cut': void clipboard.handleCut(); break;
      case 'paste': void pasteFromSystemClipboard(); break;
      case 'new-board': handleNewBoard(); break;
      case 'open': void handleOpenDrop(); break;
      case 'save': void handleSaveDrop(); break;
      case 'save-as': void handleSaveDrop(true); break;
      case 'pin':
        canvasPins.openPinPrompt(
          canvasMenuPosition || mouseScreenRef.current,
          mouseWorldRef.current
        );
        break;
      case 'uniform-width': actions.handleUniformCardWidth(); break;
      case 'auto-pack': actions.handleAutoPack(); break;
      case 'reset-size': {
        const id = [...selectedGroupIdsRef.current].find((groupId) =>
          groupsRef.current.some((group) => group.id === groupId && group.kind === 'bundle'))
          || [...selectedCardIdsRef.current][0];
        if (id) resetObjectSize(id);
        break;
      }
      case 'ungroup':
      case 'detach':
      case 'disconnect': {
        pushHistory(cardsRef.current, groupsRef.current);
        const next = applyGroupMenuAction(command, cardsRef.current, groupsRef.current,
          selectedCardIdsRef.current, selectedGroupIdsRef.current);
        actions.commitState(next.cards, next.groups);
        const remaining = new Set(next.groups.map((group) => group.id));
        setSelectedGroupIds(new Set([...selectedGroupIdsRef.current].filter((id) => remaining.has(id))));
        break;
      }
      case 'ocr': handleShortcutImageOCR(); break;
      case 'link': handleShortcutImageLink(); break;
      case 'reparse': handleShortcutReparseLink(); break;
      case 'settings': setIsSettingsOpen(true); break;
    }
  }, [actions, bundles, canvasCards, canvasMenuPosition, canvasPins, clipboard, fitGroups, handleCanvasDoubleClick,
    handleNewBoard, handleOpenDrop, handleSaveDrop, mouseScreenRef, mouseWorldRef, pasteFromSystemClipboard, viewportRef,
    resetObjectSize, handleShortcutDetachFromBundle, handleShortcutDisconnectParent,
    handleShortcutImageOCR, handleShortcutImageLink, handleShortcutReparseLink, pushHistory, setSelectedGroupIds]);

  return (
    <div
      ref={containerRef}
      className={`relative w-screen h-screen overflow-hidden select-none bg-parchment text-ink ${
        canvasInteractions.isZooming ? 'cursor-ns-resize [&_*]:!cursor-ns-resize'
          : canvasInteractions.isPanning ? 'cursor-grabbing [&_*]:!cursor-grabbing' : 'cursor-default'
      }`}
      onWheel={(e) => {
        if ((e.target as HTMLElement).closest('[data-modal="settings"]')) return;
        handleWheel(e);
      }}
      onWheelCapture={(e) => {
        if ((e.target as HTMLElement).closest('[data-desktop-titlebar]')) return;
        if ((e.target as HTMLElement).closest('[data-modal="settings"]')) return;
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
        if ((e.target as HTMLElement).closest('[data-desktop-titlebar]')) return;
        if ((e.target as HTMLElement).closest('[data-modal="settings"]')) return;
        flushWheelZoom();
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
        if (e.button === 2 && (e.target as HTMLElement).closest('[data-pin-id]')) {
          e.preventDefault();
          e.stopPropagation();
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
        if ((e.target as HTMLElement).closest('[data-desktop-titlebar]')) return;
        if ((e.target as HTMLElement).closest('[data-modal="settings"]')) return;
        if (!suppressPasteClickRef.current) return;
        suppressPasteClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-desktop-titlebar]')) return;
        if ((e.target as HTMLElement).closest('[data-modal="settings"]')) return;
        canvasInteractions.handleMouseDown(e);
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-desktop-titlebar]')) return;
        if (target.closest('[data-modal="settings"]')) return;
        if (!target.closest('[data-card-id], [data-group-id], [data-bundle-id], [data-pin-id]')) {
          setIsSearchOpen(true);
        }
      }}
      onDragOver={(e) => {
        if ((e.target as HTMLElement).closest('[data-desktop-titlebar]')) { e.preventDefault(); return; }
        if ((e.target as HTMLElement).closest('[data-modal="settings"]')) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        if ((e.target as HTMLElement).closest('[data-desktop-titlebar]')) { e.preventDefault(); return; }
        if ((e.target as HTMLElement).closest('[data-modal="settings"]')) return;
        handleDrop(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      <DesktopWindowControls />
      {farMode && <FarCanvas cards={visibleCards} groups={visibleGroups} viewport={viewport} />}
      <div
        ref={surfaceRef}
        data-canvas-surface
        className="absolute inset-0 origin-top-left pointer-events-auto"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          willChange: highQualityImageMode ? 'auto' : 'transform',
        }}
      >
        <CanvasPinsLayer
          pins={canvasPins.pins}
          selectedPinIds={selectedPinIds}
          onSelect={selectPin}
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
              isDragging={canvasInteractions.movingCardIds.has(card.id)}
              showSelectionControls={selectedCardIds.has(card.id) && pressedObject !== card.id}
              parentHighlighted={parentHighlights.cardIds.has(card.id)}
              onSelect={(e) => canvasInteractions.handleStartCardDrag(card, e)}
              onUpdate={actions.handleCardUpdate}
              onTextEdit={actions.handleCardTextEdit}
              onTextEditStart={handleTextEditStart}
              onDoubleClick={handleCardDoubleClick}
              onStartScale={(c, clientX) => canvasInteractions.handleStartCardScale(c, clientX)}
              onStartResize={(c, handle, e) => canvasInteractions.handleStartCardResize(c, handle, e)}
              isTinyThumbnail={!!card.bundleId && Math.min(card.width, card.height) *
                (isWheelZooming ? wheelLodZoom : viewport.zoom) <= 20}
              useCanvasImage={!farMode && card.type === 'image' && !!(card.thumbnail || card.sizeLocked) && !card.title &&
                !selectedCardIds.has(card.id) && !canvasInteractions.movingCardIds.has(card.id) && !highQualityImageMode}
              highQualityImage={highQualityImageMode && (card.type === 'image' || card.type === 'web') && !!card.image}
              crispRender={highQualityImageMode}
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
        onCanvasCommand={(command, target) => {
          const id = target.kind === 'card' ? target.card.id : target.group.id;
          if (['cut', 'copy', 'group', 'auto-pack'].includes(command)) {
            const alreadySelected = selectedCardIdsRef.current.has(id) || selectedGroupIdsRef.current.has(id);
            if (!alreadySelected) {
              setSelectedPinIds(new Set());
              selectedCardIdsRef.current = new Set(target.kind === 'card' ? [id] : []);
              selectedGroupIdsRef.current = new Set(target.kind === 'card' ? [] : [id]);
              setSelectedCardIds(selectedCardIdsRef.current);
              setSelectedGroupIds(selectedGroupIdsRef.current);
            }
            if (command === 'auto-pack' && target.kind === 'bundle') {
              selectedCardIdsRef.current = new Set(cardsRef.current.filter((card) => card.bundleId === id).map((card) => card.id));
              setSelectedCardIds(selectedCardIdsRef.current);
            }
          }
          mouseScreenRef.current = pieMenu.activePieMenu?.center || mouseScreenRef.current;
          mouseWorldRef.current = {
            x: (mouseScreenRef.current.x - viewportRef.current.x) / viewportRef.current.zoom,
            y: (mouseScreenRef.current.y - viewportRef.current.y) / viewportRef.current.zoom,
          };
          handleCanvasCommand(command);
        }}
        isSearchOpen={isSearchOpen}
        onCloseSearch={() => setIsSearchOpen(false)}
        onSelectSearchCard={(c) => {
          if (c.bundleId && collapsedIds.has(c.bundleId)) bundles.toggleBundle(c.bundleId);
          selectCard(c.id, false);
          setViewport(computeCardFocusViewport(c, window.innerWidth, window.innerHeight));
        }}
        isMinimapExpanded={minimap.isMinimapExpanded}
        showCornerMinimap={settings.general.minimapMode === 'always'}
      />
      {clipboard.pendingPaste && <ClipboardPastePreview snapshot={clipboard.pendingPaste}
        screen={clipboard.pasteScreenPosition} zoom={viewport.zoom} />}
      {canvasMenuPosition && <CanvasCommandMenu position={canvasMenuPosition}
        canCopy={selectedCardIds.size > 0 || selectedGroupIds.size > 0 || selectedPinIds.size > 0}
        canGroup={selectedCardIds.size > 0}
        canUngroup={selectedGroupIds.size > 0}
        canResetSize={selectedCardIds.size > 0 || groups.some((group) => selectedGroupIds.has(group.id) && group.kind === 'bundle')}
        canDetach={cards.some((card) => selectedCardIds.has(card.id) && !!card.bundleId)}
        canDisconnect={cards.some((card) => selectedCardIds.has(card.id) && !!card.groupId)
          || groups.some((group) => selectedGroupIds.has(group.id) && !!group.parentIds?.length)}
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
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateShortcuts={updateShortcuts}
        onUpdateGeneral={updateGeneral}
        onResetShortcuts={resetShortcuts}
        onRestoreWorkspace={handleRestoreWorkspace}
        showToast={showToast}
      />
      {toast && <div role="status" aria-live="polite"
        className="fixed bottom-6 left-1/2 z-[160] max-w-[min(90vw,640px)] -translate-x-1/2 border border-ink bg-paper px-4 py-3 text-center text-xs text-ink shadow-xl whitespace-pre-line break-words pointer-events-none">
        {toast}
      </div>}
    </div>
  );
}
