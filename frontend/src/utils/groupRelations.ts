import { Card } from '../types';

// A bundle acts as one linked unit while its members keep their own parent IDs.
// Keeping those IDs unchanged restores each card's original link when it leaves the bundle.
export function getParentLinkage(cards: Card[], parentId: string) {
  const bundleIds = new Set(cards
    .filter((card) => card.groupId === parentId && card.bundleId)
    .map((card) => card.bundleId!));
  const cardIds = new Set(cards
    .filter((card) => card.groupId === parentId || (card.bundleId && bundleIds.has(card.bundleId)))
    .map((card) => card.id));
  return { cardIds, bundleIds };
}
