import type { Card, Group } from '../types';
import { getBundleParentIds } from './groupRelations';
import { bundleBounds } from '../hooks/useBundleGroups';

// Apply a multi-selection once, preserving the same upstream inheritance as
// the object menu instead of letting successive React updates overwrite it.
export function applyGroupMenuAction(action: 'ungroup' | 'detach' | 'disconnect', cards: Card[], groups: Group[],
  selectedCards: Set<string>, selectedGroups: Set<string>) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const removed = new Set(action === 'ungroup' ? selectedGroups : []);
  const affected = new Set(cards.filter((card) => action === 'detach' && selectedCards.has(card.id) && card.bundleId)
    .map((card) => card.bundleId!));
  for (const id of affected) if (!cards.some((card) => card.bundleId === id && !selectedCards.has(card.id))) removed.add(id);
  const upstream = (id: string) => {
    const group = byId.get(id);
    return group?.kind === 'bundle' ? getBundleParentIds(cards, group)[0] || null : null;
  };
  const survivingParent = (initial?: string | null) => {
    let id = initial || null;
    const visited = new Set<string>();
    while (id && removed.has(id)) {
      if (visited.has(id)) return null;
      visited.add(id); id = upstream(id);
    }
    return id;
  };
  const nextCards = cards.map((card) => {
    if (card.bundleId && (removed.has(card.bundleId) || action === 'detach' && selectedCards.has(card.id))) {
      return { ...card, bundleId: null, groupId: survivingParent(upstream(card.bundleId)), contentScale: 1 };
    }
    if (action === 'disconnect' && selectedCards.has(card.id)) return { ...card, groupId: null };
    return card.groupId && removed.has(card.groupId) ? { ...card, groupId: survivingParent(card.groupId) } : card;
  });
  const nextGroups = groups.filter((group) => !removed.has(group.id)).map((group) => {
    const parent = survivingParent(group.parentIds?.[0]);
    const next = action === 'disconnect' && selectedGroups.has(group.id)
      ? { ...group, parentIds: [] } : group.parentIds?.some((id) => removed.has(id))
        ? { ...group, parentIds: parent ? [parent] : [] } : group;
    return affected.has(group.id) && !group.collapsed ? bundleBounds(nextCards, group.id, next) : next;
  });
  return { cards: nextCards, groups: nextGroups };
}
