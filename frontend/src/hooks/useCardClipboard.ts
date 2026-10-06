import { useRef, useState, useCallback, MutableRefObject } from 'react';
import { CanvasPin, Card, Group } from '../types';
import { saveStateDebounced } from '../utils/storage';
import { CanvasClipboardSnapshot, assignClipboardPinIndices, cloneClipboardSnapshot, collectClipboardSnapshot, removeClipboardSnapshot } from '../utils/canvasClipboard';
import { writeClipboardSnapshot } from '../utils/canvasClipboardTransport';
import { backUpClipboardImages, prepareClipboardImages, uploadClipboardImage } from '../utils/clipboardImages';
import { getWorkspaceId } from '../utils/workspaceApi';
import { removePendingImage } from '../utils/pendingImages';
import { normalizeTreeData } from '../utils/groupRelations';

function clearCanvasTextSelection() {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement && active.closest('[data-card-id]')) {
    active.setSelectionRange(active.selectionEnd, active.selectionEnd);
    active.blur();
  }
  window.getSelection()?.removeAllRanges();
}

interface UseCardClipboardProps {
  cardsRef: MutableRefObject<Card[]>;
  groupsRef: MutableRefObject<Group[]>;
  selectedCardIdsRef: MutableRefObject<Set<string>>;
  selectedGroupIdsRef: MutableRefObject<Set<string>>;
  pinsRef?: MutableRefObject<CanvasPin[]>;
  selectedPinIdsRef?: MutableRefObject<Set<string>>;
  replacePins?: (pins: CanvasPin[]) => void;
  setSelectedPinIds?: (ids: Set<string>) => void;
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
  pinsRef, selectedPinIdsRef, replacePins, setSelectedPinIds,
  setSelectedCardIds, setSelectedGroupIds, setCards, setGroups,
  maxZIndexRef, mouseWorldRef, mouseScreenRef, pushHistory, showToast,
}: UseCardClipboardProps) {
  const copiedObjectsRef = useRef<CanvasClipboardSnapshot>({ cards: [], groups: [] });
  const clipboardWindowId = useRef(crypto.randomUUID());
  const writingClipboardRef = useRef(false);
  const context = () => `${clipboardWindowId.current}:${getWorkspaceId()}`;
  const [pendingPaste, setPendingPaste] = useState<CanvasClipboardSnapshot | null>(null);
  const [pasteScreenPosition, setPasteScreenPosition] = useState(mouseScreenRef.current);

  const copyOrCut = useCallback(async (cut: boolean) => {
    if (writingClipboardRef.current) return;
    const snapshot = collectClipboardSnapshot(cardsRef.current, groupsRef.current,
      selectedCardIdsRef.current, selectedGroupIdsRef.current, pinsRef?.current, selectedPinIdsRef?.current);
    if (!snapshot.cards.length && !snapshot.groups.length && !snapshot.pins?.length) return;
    clearCanvasTextSelection();
    const captured: CanvasClipboardSnapshot = JSON.parse(JSON.stringify({ ...snapshot, sourceContext: context() }));
    const capturedIds = new Set([...snapshot.cards, ...snapshot.groups, ...(snapshot.pins || [])].map((object) => object.id));
    const sourceValues = new Map([...cardsRef.current, ...groupsRef.current, ...(pinsRef?.current || [])]
      .filter((object) => capturedIds.has(object.id))
      .map((object) => [object.id, JSON.stringify(object)]));
    writingClipboardRef.current = true;
    try {
      const portable = await prepareClipboardImages(captured);
      await writeClipboardSnapshot(portable);
      copiedObjectsRef.current = portable;
      if (cut) {
        // A workspace switch or edits during an asynchronous image read must
        // never cause us to delete content absent from the captured snapshot.
        const currentObjects = new Map([...cardsRef.current, ...groupsRef.current, ...(pinsRef?.current || [])].map((object) => [object.id, object]));
        if (captured.sourceContext !== context() || [...sourceValues].some(([id, value]) =>
          JSON.stringify(currentObjects.get(id)) !== value)) {
          showToast('已复制；原对象发生变化，未移除');
          return;
        }
        pushHistory(cardsRef.current, groupsRef.current);
        const tree = removeClipboardSnapshot(cardsRef.current, groupsRef.current, captured, pinsRef?.current);
        cardsRef.current = tree.cards;
        groupsRef.current = tree.groups;
        setCards(tree.cards);
        setGroups(tree.groups);
        if (tree.pins) replacePins?.(tree.pins);
        saveStateDebounced(tree.cards, tree.groups);
        setSelectedCardIds(new Set());
        setSelectedGroupIds(new Set());
        setSelectedPinIds?.(new Set());
        setPendingPaste(null);
      }
      showToast(cut ? '已剪切，可在其他画板粘贴' : '已复制到系统剪贴板');
    } catch {
      showToast(cut ? '剪切失败，原对象已保留；请检查图片或剪贴板权限' : '复制失败，请检查图片或剪贴板权限');
    } finally { writingClipboardRef.current = false; }
  }, [cardsRef, groupsRef, selectedCardIdsRef, selectedGroupIdsRef, showToast, pushHistory,
    setCards, setGroups, setSelectedCardIds, setSelectedGroupIds, pinsRef, selectedPinIdsRef, replacePins, setSelectedPinIds]);

  const handleCopy = useCallback(() => copyOrCut(false), [copyOrCut]);
  const handleCut = useCallback(() => copyOrCut(true), [copyOrCut]);

  const commitSnapshot = useCallback(async (snapshot: CanvasClipboardSnapshot, target: { x: number; y: number }) => {
    clearCanvasTextSelection();
    const targetContext = context();
    let cloned: CanvasClipboardSnapshot;
    try {
      cloned = cloneClipboardSnapshot(snapshot, target, cardsRef.current, groupsRef.current,
        () => ++maxZIndexRef.current, !snapshot.sourceContext || snapshot.sourceContext === context(), pinsRef?.current);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '粘贴失败');
      return;
    }
    try {
      await backUpClipboardImages(cloned.cards);
      if (cloned.pins) cloned.pins = assignClipboardPinIndices(cloned.pins, pinsRef?.current || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '粘贴失败');
      return;
    }
    if (targetContext !== context()) return;
    pushHistory(cardsRef.current, groupsRef.current);
    const nextCards = [...cardsRef.current, ...cloned.cards];
    const nextGroups = [...groupsRef.current, ...cloned.groups];
    const tree = normalizeTreeData(nextCards, nextGroups);
    cardsRef.current = tree.cards;
    groupsRef.current = tree.groups;
    setCards(tree.cards);
    setGroups(tree.groups);
    if (cloned.pins?.length) replacePins?.([...(pinsRef?.current || []), ...cloned.pins].sort((a, b) => a.index - b.index));
    saveStateDebounced(tree.cards, tree.groups);
    setSelectedCardIds(new Set(cloned.cards.map((card) => card.id)));
    setSelectedGroupIds(new Set(cloned.groups.map((group) => group.id)));
    setSelectedPinIds?.(new Set((cloned.pins || []).map((pin) => pin.id)));
    for (const card of cloned.cards) {
      void uploadClipboardImage(card).then((updates) => {
        if (!updates || cardsRef.current.find((item) => item.id === card.id)?.image !== card.image) return;
        const cards = cardsRef.current.map((item) => item.id === card.id ? { ...item, ...updates } : item);
        cardsRef.current = cards;
        setCards(cards);
        saveStateDebounced(cards, groupsRef.current);
        window.setTimeout(() => {
          if (cardsRef.current.find((item) => item.id === card.id)?.image === updates.image) void removePendingImage(card.id);
        }, 2000);
      });
    }
  }, [cardsRef, groupsRef, maxZIndexRef, pushHistory, setCards, setGroups,
    setSelectedCardIds, setSelectedGroupIds, pinsRef, replacePins, setSelectedPinIds, showToast]);

  const stagePaste = useCallback((snapshot: CanvasClipboardSnapshot) => {
    if (!snapshot.cards.length && !snapshot.groups.length && !snapshot.pins?.length) return;
    clearCanvasTextSelection();
    setPasteScreenPosition({ ...mouseScreenRef.current });
    setPendingPaste({
      ...snapshot,
      sourceContext: snapshot.sourceContext || 'external',
      cards: snapshot.cards.map((card) => ({ ...card })),
      groups: snapshot.groups.map((group) => ({ ...group })),
      ...(snapshot.pins ? { pins: snapshot.pins.map((pin) => ({ ...pin })) } : {}),
    });
  }, [mouseScreenRef]);

  const commitPendingPaste = useCallback((target: { x: number; y: number }) => {
    mouseWorldRef.current = target;
    if (pendingPaste) void commitSnapshot(pendingPaste, target);
    setPendingPaste(null);
  }, [commitSnapshot, pendingPaste, mouseWorldRef]);

  const cancelPendingPaste = useCallback(() => {
    setPendingPaste(null);
  }, []);

  const handleDuplicateSelected = useCallback(() => {
    const cards = cardsRef.current.filter((card) => selectedCardIdsRef.current.has(card.id));
    if (!cards.length) return;
    void commitSnapshot({ cards, groups: [] }, mouseWorldRef.current);
  }, [cardsRef, selectedCardIdsRef, commitSnapshot, mouseWorldRef]);

  return { copiedObjectsRef, pendingPaste, hasPendingPaste: !!pendingPaste,
    pasteScreenPosition, setPasteScreenPosition, handleCopy, handleCut, stagePaste,
    commitPendingPaste, cancelPendingPaste, handleDuplicateSelected };
}
