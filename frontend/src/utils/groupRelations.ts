import { Card, Group } from '../types';

export function getBundleParentIds(cards: Card[], bundle: Group): string[] {
  const parentId = bundle.parentIds !== undefined ? bundle.parentIds[0]
    : cards.find((card) => card.bundleId === bundle.id && card.groupId)?.groupId;
  return parentId ? [parentId] : [];
}

// A bundle is one visible tree node. Its members and descendants follow the same branch.
export function getParentLinkage(cards: Card[], parentId: string, groups: Group[] = []) {
  const bundleIds = new Set<string>();
  const cardIds = new Set<string>();
  const queue = [parentId];
  const visited = new Set<string>(queue);
  while (queue.length) {
    const id = queue.shift()!;
    for (const bundle of groups.filter((group) => group.kind === 'bundle' && getBundleParentIds(cards, group)[0] === id)) {
      if (visited.has(bundle.id)) continue;
      visited.add(bundle.id);
      bundleIds.add(bundle.id);
      queue.push(bundle.id);
    }
    for (const card of cards) {
      if (card.bundleId && groups.some((group) => group.id === card.bundleId && group.kind === 'bundle')) continue;
      if (card.groupId !== id || visited.has(card.id)) continue;
      visited.add(card.id);
      cardIds.add(card.id);
      queue.push(card.id);
    }
    if (bundleIds.has(id)) {
      for (const member of cards.filter((card) => card.bundleId === id)) {
        cardIds.add(member.id);
        if (!visited.has(member.id)) { visited.add(member.id); queue.push(member.id); }
      }
    }
  }
  return { cardIds, bundleIds };
}

export function treeParentId(id: string, cards: Card[], groups: Group[]): string | null {
  const card = cards.find((item) => item.id === id);
  if (card) return card.bundleId && groups.some((group) => group.id === card.bundleId && group.kind === 'bundle')
    ? card.bundleId : card.groupId || null;
  const group = groups.find((item) => item.id === id);
  return group?.kind === 'bundle' ? getBundleParentIds(cards, group)[0] || null : null;
}

export function treeNodeId(id: string, cards: Card[], groups: Group[]): string {
  const card = cards.find((item) => item.id === id);
  return card?.bundleId && groups.some((group) => group.id === card.bundleId && group.kind === 'bundle')
    ? card.bundleId : id;
}

export function canAttachTreeNode(sourceId: string, targetId: string, cards: Card[], groups: Group[]): boolean {
  const source = treeNodeId(sourceId, cards, groups);
  let current: string | null = treeNodeId(targetId, cards, groups);
  if (!cards.some((card) => card.id === source) && !groups.some((group) => group.id === source && group.kind === 'bundle')) return false;
  const seen = new Set<string>();
  while (current) {
    if (current === source || seen.has(current)) return false;
    seen.add(current);
    current = treeParentId(current, cards, groups);
  }
  return true;
}

export function normalizeTreeData(cards: Card[], groups: Group[]) {
  const validIds = new Set([...cards.map((card) => card.id), ...groups.map((group) => group.id)]);
  const bundles = new Set(groups.filter((group) => group.kind === 'bundle').map((group) => group.id));
  let changed = false;
  const nextGroups = groups.map((group) => {
    if (group.kind !== 'bundle') return { ...group };
    const legacyParent = group.parentIds === undefined
      ? cards.find((card) => card.bundleId === group.id && card.groupId)?.groupId : undefined;
    const candidate = group.parentIds?.find((id) => validIds.has(id)) || legacyParent;
    const parentId = candidate && validIds.has(candidate) ? treeNodeId(candidate, cards, groups) : null;
    const parentIds = parentId ? [parentId] : [];
    if (group.parentIds?.length === parentIds.length && group.parentIds?.[0] === parentIds[0]) return { ...group };
    changed = true;
    return { ...group, parentIds };
  });
  const nextCards = cards.map((card) => {
    const candidate = card.bundleId && bundles.has(card.bundleId) ? null : card.groupId;
    const parentId = candidate && validIds.has(candidate) ? treeNodeId(candidate, cards, groups) : null;
    if ((card.groupId || null) === parentId) return { ...card };
    changed = true;
    return { ...card, groupId: parentId };
  });
  // A legacy cycle is broken at the first node encountered. Every node then has one upward path.
  for (const node of [...nextCards.filter((card) => !card.bundleId || !bundles.has(card.bundleId)),
    ...nextGroups.filter((group) => group.kind === 'bundle')]) {
    const parentId = treeParentId(node.id, nextCards, nextGroups);
    if (!parentId || canAttachTreeNode(node.id, parentId, nextCards, nextGroups)) continue;
    changed = true;
    if ('type' in node) node.groupId = null;
    else node.parentIds = [];
  }
  return { cards: nextCards, groups: nextGroups, changed };
}
