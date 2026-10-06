import { CanvasPin, Card, Group } from '../types';
import { bundleBounds, bundleCollapsedHeight, bundleCollapsedWidth } from '../hooks/useBundleGroups';
import { normalizeTreeData } from './groupRelations';
import { pinBounds } from './canvasPinGeometry';

export interface CanvasClipboardSnapshot {
  cards: Card[];
  groups: Group[];
  pins?: CanvasPin[];
  sourceContext?: string;
}

export function collectClipboardSnapshot(
  cards: Card[], groups: Group[], selectedCardIds: Set<string>, selectedGroupIds: Set<string>,
  pins: CanvasPin[] = [], selectedPinIds: Set<string> = new Set()
): CanvasClipboardSnapshot {
  const cardIds = new Set(selectedCardIds);
  const groupIds = new Set(selectedGroupIds);
  // A bundle is copied only when the Group itself is selected. Copying a
  // single member creates an independent card instead of cloning its parent
  // Group and all of the surrounding layout.
  for (const group of groups) {
    if (selectedGroupIds.has(group.id) && group.kind === 'bundle') {
      cards.filter((card) => card.bundleId === group.id).forEach((card) => cardIds.add(card.id));
    }
  }
  const selectedCards = cards.filter((card) => cardIds.has(card.id)).map((card) => ({ ...card }));
  const selectedGroups = groups.filter((group) => groupIds.has(group.id)).map((group) =>
    group.kind === 'bundle' && !group.collapsed ? bundleBounds(selectedCards, group.id, group) : { ...group }
  );
  const selectedPins = pins.filter((pin) => selectedPinIds.has(pin.id)).map((pin) => ({ ...pin }));
  return { cards: selectedCards, groups: selectedGroups, ...(selectedPins.length ? { pins: selectedPins } : {}) };
}

export function clipboardBounds(snapshot: CanvasClipboardSnapshot) {
  const collapsedBundles = new Set(snapshot.groups.filter((group) => group.kind === 'bundle' && group.collapsed)
    .map((group) => group.id));
  const boxes = [
    ...snapshot.cards.filter((card) => !card.bundleId || !collapsedBundles.has(card.bundleId))
      .map((card) => ({ x: card.x, y: card.y, width: card.width, height: card.height })),
    ...snapshot.groups.map((group) => ({
      x: group.x, y: group.y,
      width: group.kind === 'bundle' && group.collapsed ? bundleCollapsedWidth(group.width) : group.width,
      height: group.kind === 'bundle' && group.collapsed
        ? bundleCollapsedHeight(snapshot.cards.filter((card) => card.bundleId === group.id).length)
        : group.height,
    })),
    ...(snapshot.pins || []).map((pin) => pinBounds(pin)),
  ];
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY),
    centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

export function cloneClipboardSnapshot(
  snapshot: CanvasClipboardSnapshot, target: { x: number; y: number },
  existingCards: Card[], existingGroups: Group[],
  nextZIndex: () => number, preserveExternalParents = true, existingPins: CanvasPin[] = []
): CanvasClipboardSnapshot {
  const bounds = clipboardBounds(snapshot);
  if (!bounds) return { cards: [], groups: [] };
  const offsetX = target.x - bounds.centerX;
  const offsetY = target.y - bounds.centerY;
  const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const pins = assignClipboardPinIndices((snapshot.pins || []).map((pin) => ({
    ...pin, id: newId('pin'), x: Math.round(pin.x + offsetX), y: Math.round(pin.y + offsetY), createdAt: Date.now(),
  })), existingPins);
  const groupIds = new Map(snapshot.groups.map((group) => [group.id, newId('group')]));
  const cardIds = new Map(snapshot.cards.map((card) => [card.id, newId('card')]));
  const validParents = new Set([...existingCards.map((card) => card.id),
    ...existingGroups.map((group) => group.id)]);
  const remapParent = (id: string) => groupIds.get(id) || cardIds.get(id) ||
    (preserveExternalParents && validParents.has(id) ? id : null);
  const groups = snapshot.groups.map((group) => ({
    ...group, id: groupIds.get(group.id)!,
    parentIds: group.parentIds?.slice(0, 1).map(remapParent).filter((id): id is string => !!id),
    x: Math.round(group.x + offsetX), y: Math.round(group.y + offsetY), zIndex: nextZIndex(),
  }));
  const cards = snapshot.cards.map((card) => ({
    ...card, id: cardIds.get(card.id)!, x: Math.round(card.x + offsetX), y: Math.round(card.y + offsetY),
    zIndex: nextZIndex(),
    groupId: card.groupId ? remapParent(card.groupId) : null,
    bundleId: card.bundleId ? groupIds.get(card.bundleId) ?? null : null,
  }));
  return { cards, groups, ...(snapshot.pins ? { pins } : {}) };
}

export function assignClipboardPinIndices(pins: CanvasPin[], existingPins: CanvasPin[]) {
  const occupied = new Set(existingPins.map((pin) => pin.index));
  if (pins.length > 8 - occupied.size) throw new Error('图钉编号已满（最多 8 个），请先移除部分图钉后再粘贴');
  const preferred = new Set(pins.filter((pin) => !occupied.has(pin.index)).map((pin) => pin.index));
  preferred.forEach((index) => occupied.add(index));
  return pins.map((pin) => {
    const index = preferred.has(pin.index) ? pin.index : Array.from({ length: 8 }, (_, i) => i + 1).find((number) => !occupied.has(number))!;
    occupied.add(index);
    return { ...pin, index };
  });
}

// Cutting moves exactly the captured objects, never unselected descendants.
export function removeClipboardSnapshot(cards: Card[], groups: Group[], snapshot: CanvasClipboardSnapshot, pins?: CanvasPin[]) {
  const cardIds = new Set(snapshot.cards.map((card) => card.id));
  const groupIds = new Set(snapshot.groups.map((group) => group.id));
  const nextCards = cards.filter((card) => !cardIds.has(card.id)).map((card) =>
    card.bundleId && groupIds.has(card.bundleId) ? { ...card, bundleId: null } : card);
  const affectedBundles = new Set(snapshot.cards.map((card) => card.bundleId).filter(Boolean));
  const nextGroups = groups.filter((group) => !groupIds.has(group.id)).flatMap((group) => {
    if (group.kind !== 'bundle' || !affectedBundles.has(group.id)) return [group];
    if (!nextCards.some((card) => card.bundleId === group.id)) return [];
    return [group.collapsed ? group : bundleBounds(nextCards, group.id, group)];
  });
  const pinIds = new Set((snapshot.pins || []).map((pin) => pin.id));
  return { ...normalizeTreeData(nextCards, nextGroups),
    ...(pins ? { pins: pins.filter((pin) => !pinIds.has(pin.id)) } : {}) };
}

export async function cardImageToPngBlob(imageUrl: string): Promise<Blob | null> {
  if (!imageUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch {
        void fetch(imageUrl)
          .then((r) => r.blob())
          .then((b) => resolve(b))
          .catch(() => resolve(null));
      }
    };
    img.onerror = () => {
      void fetch(imageUrl)
        .then((r) => r.blob())
        .then((b) => resolve(b))
        .catch(() => resolve(null));
    };
    img.src = imageUrl;
  });
}

export function normalizeClipboardText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

export function getExternalClipboardText(snapshot: CanvasClipboardSnapshot): string {
  if (!snapshot.cards.length && !snapshot.groups.length && !snapshot.pins?.length) return '';
  const lines: string[] = [];
  for (const card of snapshot.cards) {
    if (card.url && /^https?:\/\//i.test(card.url)) {
      lines.push(card.url);
    } else if (card.type === 'text' && card.content) {
      lines.push(card.content);
    } else if (card.type === 'web' && card.url) {
      lines.push(card.url);
    } else if (card.headerTitle || card.title) {
      lines.push(card.headerTitle || card.title || '');
    }
  }
  for (const group of snapshot.groups) {
    if (group.title) lines.push(group.title);
  }
  for (const pin of snapshot.pins || []) lines.push(`图钉 ${pin.index}`);
  return lines.filter(Boolean).join('\n');
}
