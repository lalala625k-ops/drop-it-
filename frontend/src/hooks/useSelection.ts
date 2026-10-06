import { useState, useRef, useCallback, useEffect, MutableRefObject } from 'react';
import { CanvasPin, Card, Group, Rect, Viewport } from '../types';
import { marqueeSelection } from '../utils/marqueeSelection';

export function useSelection(pinsRef?: MutableRefObject<CanvasPin[]>, viewportRef?: MutableRefObject<Viewport>) {
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedPinIds, setSelectedPinIds] = useState<Set<string>>(new Set());
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);

  const selectedCardIdsRef = useRef<Set<string>>(selectedCardIds);
  selectedCardIdsRef.current = selectedCardIds;

  const selectedGroupIdsRef = useRef<Set<string>>(selectedGroupIds);
  selectedGroupIdsRef.current = selectedGroupIds;
  const marqueeBaseCardsRef = useRef<Set<string>>(new Set());
  const marqueeBaseGroupsRef = useRef<Set<string>>(new Set());
  const selectedPinIdsRef = useRef(selectedPinIds);
  selectedPinIdsRef.current = selectedPinIds;
  const marqueeBasePinsRef = useRef<Set<string>>(new Set());
  const pins = pinsRef?.current;
  useEffect(() => {
    if (!pins) return;
    const valid = new Set(pins.map((pin) => pin.id));
    setSelectedPinIds((previous) => [...previous].every((id) => valid.has(id))
      ? previous : new Set([...previous].filter((id) => valid.has(id))));
  }, [pins]);

  const clearSelection = useCallback(() => {
    setSelectedCardIds(new Set());
    setSelectedGroupIds(new Set());
    setSelectedPinIds(new Set());
  }, []);

  const selectCard = useCallback((id: string, shiftKey: boolean) => {
    setSelectedCardIds((prev) => {
      const next = new Set(shiftKey ? prev : []);
      if (shiftKey && next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (!shiftKey) {
      setSelectedGroupIds(new Set());
      setSelectedPinIds(new Set());
    }
  }, []);

  const selectGroup = useCallback((id: string, shiftKey: boolean) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(shiftKey ? prev : []);
      if (shiftKey && next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (!shiftKey) {
      setSelectedCardIds(new Set());
      setSelectedPinIds(new Set());
    }
  }, []);

  const selectPin = useCallback((id: string, shiftKey: boolean) => {
    setSelectedPinIds((previous) => {
      const next = new Set(shiftKey ? previous : []);
      if (shiftKey && next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!shiftKey) {
      setSelectedCardIds(new Set());
      setSelectedGroupIds(new Set());
    }
  }, []);

  const beginMarqueeSelection = useCallback((isShift: boolean) => {
    marqueeBaseCardsRef.current = new Set(isShift ? selectedCardIdsRef.current : []);
    marqueeBaseGroupsRef.current = new Set(isShift ? selectedGroupIdsRef.current : []);
    marqueeBasePinsRef.current = new Set(isShift ? selectedPinIdsRef.current : []);
  }, []);

  const updateMarqueeSelection = useCallback((rect: Rect, cards: Card[], groups: Group[], isCtrl = false) => {
    setSelectionRect(rect);
    const matched = marqueeSelection(rect, cards, groups, pinsRef?.current, isCtrl, viewportRef?.current.zoom);
    setSelectedCardIds(new Set([...marqueeBaseCardsRef.current, ...matched.cardIds]));
    setSelectedGroupIds(new Set([...marqueeBaseGroupsRef.current, ...matched.groupIds]));
    setSelectedPinIds(new Set([...marqueeBasePinsRef.current, ...matched.pinIds]));
  }, [pinsRef, viewportRef]);

  return {
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
  };
}
