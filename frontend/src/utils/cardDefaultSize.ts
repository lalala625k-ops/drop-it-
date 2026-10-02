import { Card } from '../types';
import { textCardSize } from './textCardSize';

export function cardDefaultSize(card: Card, groupScale = 1) {
  if (card.type === 'text') {
    const size = textCardSize(card.content || '');
    return { width: size.width, height: size.height + (card.tags?.length ? 32 : 0) };
  }
  if (card.defaultWidth && card.defaultHeight) {
    return { width: card.defaultWidth, height: card.defaultHeight };
  }
  // Older grouped cards did not store their original geometry. Their shared
  // group scale is the best available inverse for the saved dimensions.
  if (Math.abs(groupScale - 1) > 0.001) {
    return { width: card.width / groupScale, height: card.height / groupScale };
  }
  const width = card.type === 'web' ? 280 : 360;
  const height = card.type === 'web' && !card.image ? 90
    : card.height > 0 && card.width > 0 ? width * card.height / card.width : 240;
  return { width, height };
}

export function restoreCardSize(card: Card, groupScale = 1): Card {
  const { width, height } = cardDefaultSize(card, groupScale);
  return { ...card,
    x: card.x + (card.width - width) / 2,
    y: card.y + (card.height - height) / 2,
    width, height,
    defaultWidth: width, defaultHeight: height,
    sizeLocked: false,
    contentScale: 1,
  };
}
