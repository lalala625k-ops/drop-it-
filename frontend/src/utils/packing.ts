import { Card } from '../types';
import { cardHeaderReserve, cardVisualBounds } from './cardBounds';

export function autoPackCards(cardsToPack: Card[], gap = 24): Map<string, { x: number; y: number }> {
  if (cardsToPack.length === 0) return new Map();

  // Find start origin (top-left of existing bounding box)
  let minX = Infinity;
  let minY = Infinity;
  let totalArea = 0;

  for (const c of cardsToPack) {
    const bounds = cardVisualBounds(c);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    totalArea += (bounds.width + gap) * (bounds.height + gap);
  }

  // Calculate target grid width based on sqrt of total area (aspect ratio ~ 1.5:1)
  const targetWidth = Math.max(Math.sqrt(totalArea) * 1.3, 400);

  // Shelf-based 2D bin packing
  const positions = new Map<string, { x: number; y: number }>();

  let currentX = minX;
  let currentY = minY;
  let rowHeight = 0;

  for (const card of cardsToPack) {
    // If placing this card exceeds target width and we already placed something in this row, wrap
    if (currentX + card.width > minX + targetWidth && currentX > minX) {
      currentX = minX;
      currentY += rowHeight + gap;
      rowHeight = 0;
    }

    const bounds = cardVisualBounds(card);
    positions.set(card.id, { x: currentX, y: currentY + cardHeaderReserve(card) });

    currentX += card.width + gap;
    rowHeight = Math.max(rowHeight, bounds.height);
  }

  return positions;
}
