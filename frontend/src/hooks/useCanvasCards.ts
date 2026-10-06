import { useMemo, useRef } from 'react';
import { Card } from '../types';

/** Preserve card identity so moving one image cannot rerender every card. */
export function useCanvasCards(cards: Card[], collapsedIds: Set<string>) {
  const projections = useRef(new WeakMap<Card, Card>());
  return useMemo(() => cards
    .filter((card) => !card.bundleId || !collapsedIds.has(card.bundleId))
    .map((card) => {
      if (card.color === undefined && card.textColor === undefined && card.borderColor === undefined) return card;
      let projected = projections.current.get(card);
      if (!projected) {
        projected = { ...card, color: undefined, textColor: undefined, borderColor: undefined };
        projections.current.set(card, projected);
      }
      return projected;
    }), [cards, collapsedIds]);
}
