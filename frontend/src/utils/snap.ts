import { Card, SnapLine } from '../types';
import { cardVisualBounds } from './cardBounds';

export function calculateMagneticSnapping(
  draggedCard: Card,
  otherCards: Card[],
  threshold = 12
): { deltaX: number; deltaY: number; snapLines: SnapLine[] } {
  let deltaX = 0;
  let deltaY = 0;
  const snapLines: SnapLine[] = [];

  const draggedBounds = cardVisualBounds(draggedCard);
  const draggedLeft = draggedBounds.x;
  const draggedRight = draggedBounds.x + draggedBounds.width;
  const draggedCenterX = draggedBounds.x + draggedBounds.width / 2;

  const draggedTop = draggedBounds.y;
  const draggedBottom = draggedBounds.y + draggedBounds.height;
  const draggedCenterY = draggedCard.y + draggedCard.height / 2;

  let minDiffX = Infinity;
  let minDiffY = Infinity;

  for (const other of otherCards) {
    const otherBounds = cardVisualBounds(other);
    const otherLeft = otherBounds.x;
    const otherRight = otherBounds.x + otherBounds.width;
    const otherCenterX = otherBounds.x + otherBounds.width / 2;

    const otherTop = otherBounds.y;
    const otherBottom = otherBounds.y + otherBounds.height;
    const otherCenterY = other.y + other.height / 2;

    // X-axis alignment pairs: [draggedVal, otherVal, linePosition]
    const xPairs = [
      { d: draggedLeft, o: otherLeft, pos: otherLeft },
      { d: draggedLeft, o: otherRight, pos: otherRight },
      { d: draggedRight, o: otherLeft, pos: otherLeft },
      { d: draggedRight, o: otherRight, pos: otherRight },
      { d: draggedCenterX, o: otherCenterX, pos: otherCenterX },
    ];

    for (const pair of xPairs) {
      const diff = pair.o - pair.d;
      if (Math.abs(diff) <= threshold && Math.abs(diff) < Math.abs(minDiffX)) {
        minDiffX = diff;
        deltaX = diff;
      }
    }

    // Y-axis alignment pairs
    const yPairs = [
      { d: draggedTop, o: otherTop, pos: otherTop },
      { d: draggedTop, o: otherBottom, pos: otherBottom },
      { d: draggedBottom, o: otherTop, pos: otherTop },
      { d: draggedBottom, o: otherBottom, pos: otherBottom },
      { d: draggedCenterY, o: otherCenterY, pos: otherCenterY },
    ];

    for (const pair of yPairs) {
      const diff = pair.o - pair.d;
      if (Math.abs(diff) <= threshold && Math.abs(diff) < Math.abs(minDiffY)) {
        minDiffY = diff;
        deltaY = diff;
      }
    }
  }

  // Generate snap guide lines if snapped
  if (Math.abs(deltaX) > 0 || Math.abs(minDiffX) <= threshold) {
    const newLeft = draggedLeft + deltaX;
    const newRight = draggedRight + deltaX;
    const newCenterX = draggedCenterX + deltaX;

    for (const other of otherCards) {
      const otherBounds = cardVisualBounds(other);
      const otherLeft = otherBounds.x;
      const otherRight = otherBounds.x + otherBounds.width;
      const otherCenterX = otherBounds.x + otherBounds.width / 2;

      for (const val of [newLeft, newRight, newCenterX]) {
        for (const target of [otherLeft, otherRight, otherCenterX]) {
          if (Math.abs(val - target) < 1) {
            const startY = Math.min(draggedTop + deltaY, otherBounds.y) - 20;
            const endY = Math.max(draggedBottom + deltaY, otherBounds.y + otherBounds.height) + 20;
            snapLines.push({
              type: 'vertical',
              position: target,
              start: startY,
              end: endY,
            });
          }
        }
      }
    }
  }

  if (Math.abs(deltaY) > 0 || Math.abs(minDiffY) <= threshold) {
    const newTop = draggedTop + deltaY;
    const newBottom = draggedBottom + deltaY;
    const newCenterY = draggedCenterY + deltaY;

    for (const other of otherCards) {
      const otherBounds = cardVisualBounds(other);
      const otherTop = otherBounds.y;
      const otherBottom = otherBounds.y + otherBounds.height;
      const otherCenterY = other.y + other.height / 2;

      for (const val of [newTop, newBottom, newCenterY]) {
        for (const target of [otherTop, otherBottom, otherCenterY]) {
          if (Math.abs(val - target) < 1) {
            const startX = Math.min(draggedLeft + deltaX, otherBounds.x) - 20;
            const endX = Math.max(draggedRight + deltaX, otherBounds.x + otherBounds.width) + 20;
            snapLines.push({
              type: 'horizontal',
              position: target,
              start: startX,
              end: endX,
            });
          }
        }
      }
    }
  }

  return { deltaX, deltaY, snapLines };
}
