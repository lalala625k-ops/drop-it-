import { Card, Group } from '../types';
import { bundleCollapsedHeight, bundleCollapsedWidth, containsBundlePoint } from '../hooks/useBundleGroups';
import { treeNodeId } from './groupRelations';

export interface TreeTarget { id: string; x: number; y: number }

export function treeNodeCenter(id: string, cards: Card[], groups: Group[]): TreeTarget | null {
  const card = cards.find((item) => item.id === id);
  if (card) return { id, x: card.x + card.width / 2, y: card.y + card.height / 2 };
  const group = groups.find((item) => item.id === id);
  if (!group) return null;
  const width = group.kind === 'bundle' && group.collapsed ? bundleCollapsedWidth(group.width) : group.width;
  const height = group.kind === 'bundle' && group.collapsed
    ? bundleCollapsedHeight(cards.filter((item) => item.bundleId === id).length) : group.height;
  return { id, x: group.x + width / 2, y: group.y + height / 2 };
}

export function findTreeTarget(point: { x: number; y: number }, sourceId: string,
  cards: Card[], groups: Group[]): TreeTarget | null {
  const source = treeNodeId(sourceId, cards, groups);
  const eligible = (id: string) => id !== source;
  for (const card of [...cards].sort((a, b) => b.zIndex - a.zIndex)) {
    if (card.bundleId && groups.some((group) => group.id === card.bundleId && group.kind === 'bundle')) continue;
    if (point.x < card.x || point.x > card.x + card.width || point.y < card.y || point.y > card.y + card.height) continue;
    if (eligible(card.id)) return treeNodeCenter(card.id, cards, groups);
  }
  for (const group of groups.filter((item) => item.kind === 'bundle')) {
    if (containsBundlePoint(group, cards, point) && eligible(group.id)) return treeNodeCenter(group.id, cards, groups);
  }
  for (const group of groups.filter((item) => item.kind !== 'bundle')) {
    const center = treeNodeCenter(group.id, cards, groups)!;
    if (Math.hypot(point.x - center.x, point.y - center.y) <= group.width / 2 + 30
      && eligible(group.id)) return center;
  }
  return null;
}
