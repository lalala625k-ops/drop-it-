import { useCallback, MutableRefObject } from 'react';
import { CanvasPin, Card, Group, HistoryState } from '../types';
import { saveStateDebounced } from '../utils/storage';
import { getParentLinkage, normalizeTreeData } from '../utils/groupRelations';
import { autoPackCards } from '../utils/packing';
import { alignCards } from '../utils/alignment';
import { bundleBounds } from './useBundleGroups';
import { textCardSize } from '../utils/textCardSize';
import { restoreCardSize } from '../utils/cardDefaultSize';
import { getImageRatio, getImageCardTextHeight } from '../utils/imageCardRatio';

interface UseCanvasActionsProps {
  cardsRef: MutableRefObject<Card[]>;
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  groupsRef: MutableRefObject<Group[]>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  selectedCardIdsRef: MutableRefObject<Set<string>>;
  setSelectedCardIds: (ids: Set<string>) => void;
  selectedGroupIdsRef: MutableRefObject<Set<string>>;
  pinsRef: MutableRefObject<CanvasPin[]>;
  selectedPinIdsRef: MutableRefObject<Set<string>>;
  replacePins: (pins: CanvasPin[]) => void;
  setSelectedGroupIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  maxZIndexRef: MutableRefObject<number>;
  mouseWorldRef: MutableRefObject<{ x: number; y: number }>;
  pushHistory: (cards: Card[], groups: Group[]) => void;
  undo: () => HistoryState | null;
  clearSelection: () => void;
  refreshGroupBounds: (cards: Card[], groups: Group[]) => Group[];
  createParentWithCollisionAvoidance: (targetWorld: { x: number; y: number }, cards: Card[], existingGroups: Group[]) => Group;
  createGroupFromSelection: (selectedCards: Card[], cursorPosition?: { x: number; y: number }, hasSelectedBundle?: boolean) => { newGroup: Group; updatedCards: Card[] } | null;
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
  pinsRef,
  selectedPinIdsRef,
  replacePins,
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
    const tree = normalizeTreeData(newCards, newGroups);
    setCards(tree.cards);
    setGroups(tree.groups);
    saveStateDebounced(tree.cards, tree.groups);
  }, [setCards, setGroups]);

  const handleCardUpdate = useCallback((id: string, updates: Partial<Card>) => {
    pushHistory(cardsRef.current, groupsRef.current);
    setCards((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...updates };
        if ((updates.width !== undefined || updates.height !== undefined) && (!c.sizeLocked || updates.type !== undefined)) {
          const scale = c.bundleId ? c.contentScale || 1 : 1;
          updated.defaultWidth = updated.width / scale;
          updated.defaultHeight = updated.height / scale;
        }
        return updated;
      });
      saveStateDebounced(next, groupsRef.current);
      return next;
    });
  }, [cardsRef, groupsRef, pushHistory, setCards]);

  const handleCardTextEdit = useCallback((id: string, updates: Partial<Card>) => {
    setCards((prev) => {
      const next = prev.map((card) => card.id === id ? {
        ...card, ...updates,
        ...(!card.sizeLocked && (updates.width !== undefined || updates.height !== undefined)
          ? { defaultWidth: (updates.width ?? card.width) / (card.bundleId ? card.contentScale || 1 : 1),
            defaultHeight: (updates.height ?? card.height) / (card.bundleId ? card.contentScale || 1 : 1) } : {}),
      } : card);
      saveStateDebounced(next, groupsRef.current);
      return next;
    });
  }, [groupsRef, setCards]);

  const createCardAtCursor = useCallback((cardData: Partial<Card>): Card => {
    pushHistory(cardsRef.current, groupsRef.current);
    maxZIndexRef.current += 1;
    const fittedTextSize = (cardData.type || 'text') === 'text' ? textCardSize(cardData.content || '') : null;
    const w = fittedTextSize?.width || cardData.width || 260;
    const h = fittedTextSize?.height || cardData.height || 180;
    const center = mouseWorldRef.current;

    const newCard: Card = {
      id: cardData.id || `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: cardData.type || 'text',
      x: cardData.x ?? center.x - w / 2,
      y: cardData.y ?? center.y - h / 2,
      width: w,
      height: h,
      defaultWidth: cardData.defaultWidth ?? w,
      defaultHeight: cardData.defaultHeight ?? h,
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

    if (newCard.type === 'text' && !cardData.content) {
      const focusText = () => {
        const cardEl = document.querySelector(`[data-card-id="${newCard.id}"]`);
        const textarea = cardEl?.querySelector('textarea[data-text-editor]') as HTMLTextAreaElement | null;
        if (textarea) {
          textarea.focus();
          const len = textarea.value.length;
          textarea.setSelectionRange(len, len);
          return true;
        }
        return false;
      };
      window.requestAnimationFrame(() => {
        if (!focusText()) {
          window.requestAnimationFrame(() => {
            if (!focusText()) {
              window.setTimeout(focusText, 50);
            }
          });
        }
      });
    }

    return newCard;
  }, [cardsRef, groupsRef, maxZIndexRef, mouseWorldRef, pushHistory, setCards, setSelectedCardIds]);

  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev) {
      const tree = normalizeTreeData(prev.cards, prev.groups);
      setCards(tree.cards);
      setGroups(tree.groups);
      if (prev.pins) replacePins(prev.pins);
      saveStateDebounced(tree.cards, tree.groups);
      clearSelection();
    }
  }, [setCards, setGroups, undo, replacePins, clearSelection]);

  const handleDeleteSelected = useCallback(() => {
    const cardIds = selectedCardIdsRef.current;
    const groupIds = selectedGroupIdsRef.current;
    const pinIds = selectedPinIdsRef.current;
    if (cardIds.size === 0 && groupIds.size === 0 && pinIds.size === 0) return;

    pushHistory(cardsRef.current, groupsRef.current);
    const parentIds = new Set(groupsRef.current.filter((g) => g.kind !== 'bundle' && groupIds.has(g.id)).map((g) => g.id));
    const linkedCardIds = new Set([...parentIds].flatMap((parentId) =>
      [...getParentLinkage(cardsRef.current, parentId, groupsRef.current).cardIds]));
    let nextCards = cardsRef.current
      .filter((c) => !cardIds.has(c.id) && !linkedCardIds.has(c.id))
      .map((c) => c.bundleId && groupIds.has(c.bundleId) ? { ...c, bundleId: null, contentScale: 1 } : c);
    const occupiedBundles = new Set(nextCards.map((card) => card.bundleId).filter(Boolean));
    let nextGroups = groupsRef.current.filter((g) => !groupIds.has(g.id) && (g.kind !== 'bundle' || occupiedBundles.has(g.id)));
    const survivingIds = new Set([...nextCards.map((card) => card.id), ...nextGroups.map((group) => group.id)]);
    nextCards = nextCards.map((card) => card.groupId && !survivingIds.has(card.groupId)
      ? { ...card, groupId: null } : card);
    nextGroups = nextGroups.map((group) => group.parentIds?.some((id) => !survivingIds.has(id))
      ? { ...group, parentIds: group.parentIds.filter((id) => survivingIds.has(id)).slice(0, 1) } : group);
    commitState(nextCards, refreshGroupBounds(nextCards, nextGroups));
    if (pinIds.size) replacePins(pinsRef.current.filter((pin) => !pinIds.has(pin.id)));
    clearSelection();
  }, [cardsRef, clearSelection, commitState, groupsRef, pushHistory, refreshGroupBounds, selectedCardIdsRef, selectedGroupIdsRef,
    pinsRef, selectedPinIdsRef, replacePins]);

  const handleCreateNewParentAtCursor = useCallback(() => {
    pushHistory(cardsRef.current, groupsRef.current);
    const newParent = createParentWithCollisionAvoidance(mouseWorldRef.current, cardsRef.current, groupsRef.current);
    setSelectedGroupIds(new Set([newParent.id]));
    saveStateDebounced(cardsRef.current, [...groupsRef.current, newParent]);
  }, [cardsRef, createParentWithCollisionAvoidance, groupsRef, mouseWorldRef, pushHistory, setSelectedGroupIds]);

  const handleGroup = useCallback(() => {
    const selectedBundleIds = new Set(groupsRef.current
      .filter((group) => group.kind === 'bundle' && selectedGroupIdsRef.current.has(group.id)).map((group) => group.id));
    cardsRef.current.filter((card) => selectedCardIdsRef.current.has(card.id) && card.bundleId
      && groupsRef.current.some((group) => group.id === card.bundleId && group.kind === 'bundle'))
      .forEach((card) => selectedBundleIds.add(card.bundleId!));
    const selectedBundles = groupsRef.current.filter((group) => selectedBundleIds.has(group.id));
    const selectedCards = cardsRef.current.filter((card) => selectedCardIdsRef.current.has(card.id)
      && (!card.bundleId || !selectedBundleIds.has(card.bundleId)));
    if (selectedCards.length === 0 && selectedBundles.length === 0) {
      handleCreateNewParentAtCursor();
      return;
    }
    pushHistory(cardsRef.current, groupsRef.current);
    const res = createGroupFromSelection(selectedCards, mouseWorldRef.current, selectedBundles.length > 0);
    if (!res) return;

    const nextCards = cardsRef.current.map((c) => {
      const updated = res.updatedCards.find((u) => u.id === c.id);
      return updated || c;
    });
    const nextGroups = [...groupsRef.current.map((group) => selectedBundleIds.has(group.id)
      ? { ...group, parentIds: [res.newGroup.id] }
      : group), res.newGroup];
    commitState(nextCards, nextGroups);
    setSelectedGroupIds(new Set([res.newGroup.id]));
  }, [cardsRef, commitState, createGroupFromSelection, groupsRef, handleCreateNewParentAtCursor, mouseWorldRef, pushHistory, selectedCardIdsRef, selectedGroupIdsRef, setSelectedGroupIds]);

  const handleUngroup = useCallback(() => {
    const gIds = selectedGroupIdsRef.current;
    if (gIds.size === 0) return;
    pushHistory(cardsRef.current, groupsRef.current);
    const nextCards = cardsRef.current.map((c) => ({
      ...c,
      groupId: c.groupId && gIds.has(c.groupId) ? null : c.groupId,
      bundleId: c.bundleId && gIds.has(c.bundleId) ? null : c.bundleId,
      contentScale: c.bundleId && gIds.has(c.bundleId) ? 1 : c.contentScale,
    }));
    const nextGroups = groupsRef.current.filter((g) => !gIds.has(g.id))
      .map((group) => group.parentIds?.some((id) => gIds.has(id))
        ? { ...group, parentIds: group.parentIds.filter((id) => !gIds.has(id)) } : group);
    commitState(nextCards, nextGroups);
    setSelectedGroupIds(new Set());
  }, [cardsRef, commitState, groupsRef, pushHistory, selectedGroupIdsRef, setSelectedGroupIds]);

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

  const handleUniformCardWidth = useCallback((targetCardIds?: Set<string>) => {
    const selIds = targetCardIds || selectedCardIdsRef.current;
    const targets = selIds.size > 0
      ? cardsRef.current.filter((c) => selIds.has(c.id))
      : cardsRef.current;
    if (targets.length < 2) return;

    const width = Math.max(80, Math.round(targets.reduce((sum, card) => sum + card.width, 0) / targets.length));
    const targetSet = new Set(targets.map((c) => c.id));

    pushHistory(cardsRef.current, groupsRef.current);
    const nextCards = cardsRef.current.map((card) => {
      if (!targetSet.has(card.id)) return card;
      let newHeight = card.height;
      const hasImage = card.type === 'image' || (card.type === 'web' && !!card.image);
      if (hasImage) {
        const ratio = getImageRatio(card);
        const textH = getImageCardTextHeight(card);
        newHeight = Math.round(width / ratio + textH);
      } else if (card.type === 'text') {
        const size = textCardSize(card.content || '');
        newHeight = Math.max(size.height, card.height);
      }
      return {
        ...card,
        x: card.x + (card.width - width) / 2,
        width,
        height: newHeight,
        defaultWidth: width,
        defaultHeight: newHeight,
        sizeLocked: true,
      };
    });
    commitState(nextCards, refreshGroupBounds(nextCards, groupsRef.current));
  }, [cardsRef, commitState, groupsRef, pushHistory, refreshGroupBounds, selectedCardIdsRef]);

  const handleResetCardSize = useCallback((id: string) => {
    const card = cardsRef.current.find((item) => item.id === id);
    if (!card || card.bundleId) return;
    const restored = restoreCardSize(card);
    if (Math.abs(card.width - restored.width) < 0.5
      && Math.abs(card.height - restored.height) < 0.5 && !card.sizeLocked) return;
    pushHistory(cardsRef.current, groupsRef.current);
    const nextCards = cardsRef.current.map((item) => item.id === id ? restored : item);
    setCards(nextCards);
    saveStateDebounced(nextCards, groupsRef.current);
  }, [cardsRef, groupsRef, pushHistory, setCards]);

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
  }, [cardsRef, commitState, groupsRef, pushHistory, refreshGroupBounds, selectedCardIdsRef, selectedGroupIdsRef]);

  return {
    commitState,
    handleCardUpdate,
    handleCardTextEdit,
    createCardAtCursor,
    handleUndo,
    handleDeleteSelected,
    handleCreateNewParentAtCursor,
    handleGroup,
    handleUngroup,
    handleAutoPack,
    handleUniformCardWidth,
    handleResetCardSize,
    handleAlign,
  };
}
