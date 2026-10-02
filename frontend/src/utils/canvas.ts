import { Card, Group, Rect, Viewport } from '../types';
import { cardVisualBounds } from './cardBounds';

export const MIN_CANVAS_ZOOM = 0.01;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: (screenX - viewport.x) / viewport.zoom,
    y: (screenY - viewport.y) / viewport.zoom,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: worldX * viewport.zoom + viewport.x,
    y: worldY * viewport.zoom + viewport.y,
  };
}

export function isPointInRect(x: number, y: number, rect: Rect): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

export function rectsIntersect(r1: Rect, r2: Rect): boolean {
  const normR1 = {
    x: r1.width < 0 ? r1.x + r1.width : r1.x,
    y: r1.height < 0 ? r1.y + r1.height : r1.y,
    width: Math.abs(r1.width),
    height: Math.abs(r1.height),
  };
  const normR2 = {
    x: r2.width < 0 ? r2.x + r2.width : r2.x,
    y: r2.height < 0 ? r2.y + r2.height : r2.y,
    width: Math.abs(r2.width),
    height: Math.abs(r2.height),
  };

  return !(
    normR2.x > normR1.x + normR1.width ||
    normR2.x + normR2.width < normR1.x ||
    normR2.y > normR1.y + normR1.height ||
    normR2.y + normR2.height < normR1.y
  );
}

export function getBoundingBox(cards: Card[], groups: Group[] = []): Rect | null {
  if (cards.length === 0 && groups.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const card of cards) {
    const bounds = cardVisualBounds(card);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  for (const group of groups) {
    minX = Math.min(minX, group.x);
    minY = Math.min(minY, group.y);
    maxX = Math.max(maxX, group.x + group.width);
    maxY = Math.max(maxY, group.y + group.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function computeFitViewport(
  cards: Card[],
  groups: Group[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 80
): Viewport | null {
  const box = getBoundingBox(cards, groups);
  if (!box || box.width === 0 || box.height === 0) {
    return {
      x: viewportWidth / 2,
      y: viewportHeight / 2,
      zoom: 1.0,
    };
  }

  const availW = Math.max(viewportWidth - padding * 2, 100);
  const availH = Math.max(viewportHeight - padding * 2, 100);

  const zoomW = availW / box.width;
  const zoomH = availH / box.height;
  const targetZoom = clamp(Math.min(zoomW, zoomH), MIN_CANVAS_ZOOM, 3.0);

  const boxCenterX = box.x + box.width / 2;
  const boxCenterY = box.y + box.height / 2;

  const targetX = viewportWidth / 2 - boxCenterX * targetZoom;
  const targetY = viewportHeight / 2 - boxCenterY * targetZoom;

  return {
    x: targetX,
    y: targetY,
    zoom: targetZoom,
  };
}

export function computeCardFocusViewport(
  card: Card,
  viewportWidth: number,
  viewportHeight: number
): Viewport {
  // 放大至视窗 80% 大小
  const targetW = viewportWidth * 0.8;
  const targetH = viewportHeight * 0.8;

  const bounds = cardVisualBounds(card);
  const zoomW = targetW / bounds.width;
  const zoomH = targetH / bounds.height;
  const targetZoom = clamp(Math.min(zoomW, zoomH), MIN_CANVAS_ZOOM, 3.0);

  const cardCenterX = bounds.x + bounds.width / 2;
  const cardCenterY = bounds.y + bounds.height / 2;

  const targetX = viewportWidth / 2 - cardCenterX * targetZoom;
  const targetY = viewportHeight / 2 - cardCenterY * targetZoom;

  return {
    x: targetX,
    y: targetY,
    zoom: targetZoom,
  };
}
