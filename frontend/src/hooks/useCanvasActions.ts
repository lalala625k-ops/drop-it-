import { useCallback, MutableRefObject } from 'react';
import { Card, Group } from '../types';
import { saveStateDebounced } from '../utils/storage';
import { getParentLinkage } from '../utils/groupRelations';
import { autoPackCards } from '../utils/packing';
import { alignCards } from '../utils/alignment';
import { bundleBounds } from './useBundleGroups';

interface UseCanvasActionsProps {
  cardsRef: MutableRefObject<Card[]>;
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  groupsRef: MutableRefObject<Group[]>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  selectedCardIdsRef: MutableRefObject<Set<string>>;
  setSelectedCardIds: (ids: Set<string>) => void;
  selectedGroupIdsRef: MutableRefObject<Set<string>>;
  setSelectedGroupIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  maxZIndexRef: MutableRefObject<number>;
  mouseWorldRef: MutableRefObject<{ x: number; y: number }>;
  pushHistory: (cards: Card[], groups: Group[]) => void;
  undo: () => { cards: Card[]; groups: Group[] } | null;
  clearSelection: () => void;
  refreshGroupBounds: (cards: Card[], groups: Group[]) => Group[];
  createParentWithCollisionAvoidance: (targetWorld: { x: number; y: number }, cards: Card[], existingGroups: Group[]) => Group;
  createGroupFromSelection: (selectedCards: Card[], cursorPosition?: { x: number; y: number }) => { newGroup: Group; updatedCards: Card[] } | null;
  showToast: (msg: string) => void;
}

export function useCanvasActions({
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
}: UseCanvasActionsProps) {
  const commitState = useCallback((newCards: Card[], newGroups: Group[]) => {
    setCards(newCards);
    setGroups(newGroups);
    saveStateDebounced(newCards, newGroups);
  }, [setCards, setGroups]);

  const handleCardUpdate = useCallback((id: string, updates: Partial<Card>) => {
    pushHistory(cardsRef.current, groupsRef.current);
    setCards((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...updates } : c));
      saveStateDebounced(next, groupsRef.current);
      return next;
    });
  }, [cardsRef, groupsRef, pushHistory, setCards]);

  const createCardAtCursor = useCallback((cardData: Partial<Card>): Card => {
    pushHistory(cardsRef.current, groupsRef.current);
    maxZIndexRef.current += 1;
    const w = cardData.width || 260;
    const h = cardData.height || 180;
    const center = mouseWorldRef.current;

    const newCard: Card = {
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: cardData.type || 'text',
      x: cardData.x ?? center.x - w / 2,
      y: cardData.y ?? center.y - h / 2,
      width: w,
      height: h,
      zIndex: maxZIndexRef.current,
      content: cardData.content || '',
      title: cardData.title,
      headerTitle: cardData.headerTitle,
      url: cardData.url,
      image: cardData.image,
      description: cardData.description,
      favicon: cardData.favicon,
      isParsing: cardData.isParsing,
    };

    setCards((prev) => {
      const next = [...prev, newCard];
      saveStateDebounced(next, groupsRef.current);
      return next;
    });
    setSelectedCardIds(new Set([newCard.id]));
    return newCard;
  }, [cardsRef, groupsRef, maxZIndexRef, mouseWorldRef, pushHistory, setCards, setSelectedCardIds]);

  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev) {
      setCards(prev.cards);
      setGroups(prev.groups);
      saveStateDebounced(prev.cards, prev.groups);
    }
  }, [setCards, setGroups, undo]);

  const handleDeleteSelected = useCallback(() => {
    const cardIds = selectedCardIdsRef.current;
    const groupIds = selectedGroupIdsRef.current;
    if (cardIds.size === 0 && groupIds.size === 0) return;

    pushHistory(cardsRef.current, groupsRef.current);
    const parentIds = new Set(groupsRef.current.filter((g) => g.kind !== 'bundle' && groupIds.has(g.id)).map((g) => g.id));
    const linkedCardIds = new Set([...parentIds].flatMap((parentId) =>
      [...getParentLinkage(cardsRef.current, parentId).cardIds]));
    const nextCards = cardsRef.current
      .filter((c) => !cardIds.has(c.id) && !linkedCardIds.has(c.id))
      .map((c) => c.bundleId && groupIds.has(c.bundleId) ? { ...c, bundleId: null } : c);
    const occupiedBundles = new Set(nextCards.map((card) => card.bundleId).filter(Boolean));
    const nextGroups = groupsRef.current.filter((g) => !groupIds.has(g.id) && (g.kind !== 'bundle' || occupiedBundles.has(g.id)));
    commitState(nextCards, refreshGroupBounds(nextCards, nextGroups));
    clearSelection();
  }, [cardsRef, clearSelection, commitState, groupsRef, pushHistory, refreshGroupBounds, selectedCardIdsRef, selectedGroupIdsRef]);

  const handleCreateNewParentAtCursor = useCallback(() => {
    pushHistory(cardsRef.current, groupsRef.current);
    const newParent = createParentWithCollisionAvoidance(mouseWorldRef.current, cardsRef.current, groupsRef.current);
    setSelectedGroupIds(new Set([newParent.id]));
    saveStateDebounced(cardsRef.current, [...groupsRef.current, newParent]);
    showToast(`已在光标处创建父物体「${newParent.title}」，按住 Ctrl 拖拽卡片即可链接`);
  }, [cardsRef, createParentWithCollisionAvoidance, groupsRef, mouseWorldRef, pushHistory, setSelectedGroupIds, showToast]);

  const handleGroup = useCallback(() => {
    const selectedCards = cardsRef.current.filter((c) => selectedCardIdsRef.current.has(c.id));
    if (selectedCards.length === 0) {
      handleCreateNewParentAtCursor();
      return;
    }
    pushHistory(cardsRef.current, groupsRef.current);
    const res = createGroupFromSelection(selectedCards, mouseWorldRef.current);
    if (!res) return;

    const nextCards = cardsRef.current.map((c) => {
      const updated = res.updatedCards.find((u) => u.id === c.id);
      return updated || c;
    });
    const nextGroups = [...groupsRef.current, res.newGroup];
    commitState(nextCards, nextGroups);
    setSelectedGroupIds(new Set([res.newGroup.id]));
    showToast(`已创建父物体「${res.newGroup.title}」，已链接 ${selectedCards.length} 项`);
  }, [cardsRef, commitState, createGroupFromSelection, groupsRef, handleCreateNewParentAtCursor, mouseWorldRef, pushHistory, selectedCardIdsRef, setSelectedGroupIds, showToast]);

  const handleUngroup = useCallback(() => {
    const gIds = selectedGroupIdsRef.current;
    if (gIds.size === 0) return;
    pushHistory(cardsRef.current, groupsRef.current);
    const nextCards = cardsRef.current.map((c) => ({
      ...c,
      groupId: c.groupId && gIds.has(c.groupId) ? null : c.groupId,
      bundleId: c.bundleId && gIds.has(c.bundleId) ? null : c.bundleId,
    }));
    const nextGroups = groupsRef.current.filter((g) => !gIds.has(g.id));
    commitState(nextCards, nextGroups);
    setSelectedGroupIds(new Set());
    showToast('已解散所选 Group 或父物体，卡片已保留');
  }, [cardsRef, commitState, groupsRef, pushHistory, selectedGroupIdsRef, setSelectedGroupIds, showToast]);

  const handleAutoPack = useCallback(() => {
    pushHistory(cardsRef.current, groupsRef.current);
    const selIds = selectedCardIdsRef.current;
    const targets = selIds.size > 0 ? cardsRef.current.filter((c) => selIds.has(c.id)) : cardsRef.current;
    const packedMap = autoPackCards(targets);
    const nextCards = cardsRef.current.map((c) => {
      const p = packedMap.get(c.id);
      return p ? { ...c, x: p.x, y: p.y } : c;
    });
    commitState(nextCards, refreshGroupBounds(nextCards, groupsRef.current));
  }, [cardsRef, commitState, groupsRef, pushHistory, refreshGroupBounds, selectedCardIdsRef]);

  const handleAlign = useCallback((dir: 'top' | 'bottom' | 'left' | 'right') => {
    const selectedBundleIds = new Set(groupsRef.current
      .filter((g) => g.kind === 'bundle' && selectedGroupIdsRef.current.has(g.id))
      .map((g) => g.id));
    const selCards = cardsRef.current.filter((c) => selectedCardIdsRef.current.has(c.id) || (c.bundleId && selectedBundleIds.has(c.bundleId)));
    const selGroups = groupsRef.current.filter((g) => selectedGroupIdsRef.current.has(g.id));
    const hasSelection = selCards.length > 0 || selGroups.length > 0;
    const targetCards = hasSelection ? selCards : cardsRef.current;
    const targetGroups = (hasSelection ? selGroups : groupsRef.current).filter((g) => g.kind !== 'bundle');
    if (targetCards.length + targetGroups.length <= 1) return;

    pushHistory(cardsRef.current, groupsRef.current);
    const alignedMap = alignCards(targetCards, dir, cardsRef.current, 5, targetGroups,
      groupsRef.current.filter((g) => g.kind !== 'bundle'));
    const nextCards = cardsRef.current.map((c) => {
      const pos = alignedMap.get(c.id);
      return pos ? { ...c, x: pos.x, y: pos.y } : c;
    });
    const nextGroups = groupsRef.current.map((g) => {
      const pos = alignedMap.get(g.id);
      if (pos) return { ...g, x: pos.x, y: pos.y };
      return g.kind === 'bundle' && nextCards.some((card) => card.bundleId === g.id && alignedMap.has(card.id))
        ? bundleBounds(nextCards, g.id, g) : g;
    });

    commitState(nextCards, refreshGroupBounds(nextCards, nextGroups));
    const dirNames = { left: '向左', right: '向右', top: '向上', bottom: '向下' };
    showToast(`已${dirNames[dir]}对齐 ${targetCards.length + targetGroups.length} 项，间距 5px`);
  }, [cardsRef, commitState, groupsRef, pushHistory, refreshGroupBounds, selectedCardIdsRef, selectedGroupIdsRef, showToast]);

  return {
    commitState,
    handleCardUpdate,
    createCardAtCursor,
    handleUndo,
    handleDeleteSelected,
    handleCreateNewParentAtCursor,
    handleGroup,
    handleUngroup,
    handleAutoPack,
    handleAlign,
  };
}
