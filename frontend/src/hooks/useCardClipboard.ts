import { useRef, useCallback, MutableRefObject } from 'react';
import { Card, Group } from '../types';
import { saveStateDebounced } from '../utils/storage';

interface UseCardClipboardProps {
  cardsRef: MutableRefObject<Card[]>;
  groupsRef: MutableRefObject<Group[]>;
  selectedCardIdsRef: MutableRefObject<Set<string>>;
  setSelectedCardIds: (ids: Set<string>) => void;
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  maxZIndexRef: MutableRefObject<number>;
  mouseWorldRef: MutableRefObject<{ x: number; y: number }>;
  pushHistory: (cards: Card[], groups: Group[]) => void;
  showToast: (msg: string) => void;
}

export function useCardClipboard({
  cardsRef,
  groupsRef,
  selectedCardIdsRef,
  setSelectedCardIds,
  setCards,
  maxZIndexRef,
  mouseWorldRef,
  pushHistory,
  showToast,
}: UseCardClipboardProps) {
  const copiedCardsRef = useRef<Card[]>([]);

  const handleCopy = useCallback(() => {
    const selIds = selectedCardIdsRef.current;
    if (selIds.size === 0) return;
    const cardsToCopy = cardsRef.current.filter((c) => selIds.has(c.id));
    if (cardsToCopy.length === 0) return;

    copiedCardsRef.current = cardsToCopy;
    try {
      navigator.clipboard.writeText(
        JSON.stringify({
          __type: 'infinite-canvas-cards',
          cards: cardsToCopy,
        })
      );
    } catch {
      // Fallback to internal ref
    }
    showToast(`已复制 ${cardsToCopy.length} 张便签`);
  }, [cardsRef, selectedCardIdsRef, showToast]);

  const handlePasteCopiedCards = useCallback(
    (sourceCards: Card[]) => {
      if (sourceCards.length === 0) return;
      pushHistory(cardsRef.current, groupsRef.current);

      const minX = Math.min(...sourceCards.map((c) => c.x));
      const minY = Math.min(...sourceCards.map((c) => c.y));
      const maxX = Math.max(...sourceCards.map((c) => c.x + c.width));
      const maxY = Math.max(...sourceCards.map((c) => c.y + c.height));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const targetWorld = mouseWorldRef.current;
      const offsetX = targetWorld.x - centerX;
      const offsetY = targetWorld.y - centerY;

      const newCards: Card[] = sourceCards.map((src) => {
        maxZIndexRef.current += 1;
        return {
          ...src,
          id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          x: Math.round(src.x + offsetX),
          y: Math.round(src.y + offsetY),
          zIndex: maxZIndexRef.current,
          groupId: null,
          bundleId: null,
        };
      });

      setCards((prev) => {
        const next = [...prev, ...newCards];
        saveStateDebounced(next, groupsRef.current);
        return next;
      });

      setSelectedCardIds(new Set(newCards.map((c) => c.id)));
      showToast(`已在光标处粘贴 ${newCards.length} 张便签`);
    },
    [cardsRef, groupsRef, maxZIndexRef, mouseWorldRef, pushHistory, setCards, setSelectedCardIds, showToast]
  );

  const handleDuplicateSelected = useCallback(() => {
    const selIds = selectedCardIdsRef.current;
    if (selIds.size === 0) return;
    const selected = cardsRef.current.filter((c) => selIds.has(c.id));
    if (selected.length === 0) return;
    handlePasteCopiedCards(selected);
  }, [cardsRef, handlePasteCopiedCards, selectedCardIdsRef]);

  return {
    copiedCardsRef,
    handleCopy,
    handlePasteCopiedCards,
    handleDuplicateSelected,
  };
}
