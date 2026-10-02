import { useRef, useState, useCallback, MutableRefObject } from 'react';
import { Card, Group } from '../types';
import { saveStateDebounced } from '../utils/storage';
import { CanvasClipboardSnapshot, cloneClipboardSnapshot, collectClipboardSnapshot } from '../utils/canvasClipboard';
import { normalizeTreeData } from '../utils/groupRelations';

interface UseCardClipboardProps {
  cardsRef: MutableRefObject<Card[]>;
  groupsRef: MutableRefObject<Group[]>;
  selectedCardIdsRef: MutableRefObject<Set<string>>;
  selectedGroupIdsRef: MutableRefObject<Set<string>>;
  setSelectedCardIds: (ids: Set<string>) => void;
  setSelectedGroupIds: (ids: Set<string>) => void;
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  maxZIndexRef: MutableRefObject<number>;
  mouseWorldRef: MutableRefObject<{ x: number; y: number }>;
  mouseScreenRef: MutableRefObject<{ x: number; y: number }>;
  pushHistory: (cards: Card[], groups: Group[]) => void;
  showToast: (msg: string) => void;
}

export function useCardClipboard({
  cardsRef, groupsRef, selectedCardIdsRef, selectedGroupIdsRef,
  setSelectedCardIds, setSelectedGroupIds, setCards, setGroups,
  maxZIndexRef, mouseWorldRef, mouseScreenRef, pushHistory, showToast,
}: UseCardClipboardProps) {
  const copiedObjectsRef = useRef<CanvasClipboardSnapshot>({ cards: [], groups: [] });
  const [pendingPaste, setPendingPaste] = useState<CanvasClipboardSnapshot | null>(null);
  const [pasteScreenPosition, setPasteScreenPosition] = useState(mouseScreenRef.current);

  const handleCopy = useCallback(() => {
    const snapshot = collectClipboardSnapshot(cardsRef.current, groupsRef.current,
      selectedCardIdsRef.current, selectedGroupIdsRef.current);
    if (!snapshot.cards.length && !snapshot.groups.length) return;
    copiedObjectsRef.current = snapshot;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(JSON.stringify({
        __type: 'infinite-canvas-objects', cards: snapshot.cards, groups: snapshot.groups,
      })).catch(() => { /* The in-memory snapshot remains available. */ });
    }
    showToast(`已复制 ${snapshot.cards.length + snapshot.groups.length} 个对象`);
  }, [cardsRef, groupsRef, selectedCardIdsRef, selectedGroupIdsRef, showToast]);

  const stagePaste = useCallback((snapshot: CanvasClipboardSnapshot) => {
    if (!snapshot.cards.length && !snapshot.groups.length) return;
    setPasteScreenPosition({ ...mouseScreenRef.current });
    setPendingPaste({ cards: snapshot.cards.map((card) => ({ ...card })),
      groups: snapshot.groups.map((group) => ({ ...group })) });
  }, [mouseScreenRef]);

  const commitSnapshot = useCallback((snapshot: CanvasClipboardSnapshot, target: { x: number; y: number }) => {
    pushHistory(cardsRef.current, groupsRef.current);
    const cloned = cloneClipboardSnapshot(snapshot, target, groupsRef.current, () => ++maxZIndexRef.current);
    const nextCards = [...cardsRef.current, ...cloned.cards];
    const nextGroups = [...groupsRef.current, ...cloned.groups];
    const tree = normalizeTreeData(nextCards, nextGroups);
    setCards(tree.cards);
    setGroups(tree.groups);
    saveStateDebounced(tree.cards, tree.groups);
    setSelectedCardIds(new Set(cloned.cards.map((card) => card.id)));
    setSelectedGroupIds(new Set(cloned.groups.map((group) => group.id)));
    showToast(`已粘贴 ${cloned.cards.length + cloned.groups.length} 个对象`);
  }, [cardsRef, groupsRef, maxZIndexRef, pushHistory, setCards, setGroups,
    setSelectedCardIds, setSelectedGroupIds, showToast]);

  const commitPendingPaste = useCallback((target: { x: number; y: number }) => {
    mouseWorldRef.current = target;
    if (pendingPaste) commitSnapshot(pendingPaste, target);
    setPendingPaste(null);
  }, [commitSnapshot, pendingPaste, mouseWorldRef]);

  const cancelPendingPaste = useCallback(() => {
    setPendingPaste(null);
  }, []);

  const handleDuplicateSelected = useCallback(() => {
    const cards = cardsRef.current.filter((card) => selectedCardIdsRef.current.has(card.id));
    if (!cards.length) return;
    commitSnapshot({ cards, groups: [] }, mouseWorldRef.current);
  }, [cardsRef, selectedCardIdsRef, commitSnapshot, mouseWorldRef]);

  return { copiedObjectsRef, pendingPaste, hasPendingPaste: !!pendingPaste,
    pasteScreenPosition, setPasteScreenPosition, handleCopy, stagePaste,
    commitPendingPaste, cancelPendingPaste, handleDuplicateSelected };
}
