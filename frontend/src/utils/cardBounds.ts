import { Card, Rect } from '../types';
import { parseMarkdownHeading } from './headingUtils';

/** The floating title is outside the DOM card box, but inside its logical bounds. */
export function cardHeaderReserve(card: Card): number {
  const title = card.headerTitle || (card.type === 'text' ? card.title : undefined);
  const heading = parseMarkdownHeading(title);
  if (!heading.cleanText) return 0;
  const scale = card.contentScale ?? 1;
  const fontSize = heading.level === 2 ? 18 : 24;
  const lineHeight = heading.level === 2 ? 1.2 : 1.15;
  const gap = heading.level === 2 ? 4 : 6;
  // The title can wrap to two lines; reserve the full rendered region.
  return (fontSize * lineHeight * 2 + gap) * scale;
}

export function cardVisualBounds(card: Card): Rect {
  const reserve = cardHeaderReserve(card);
  return {
    x: card.x,
    y: card.y - reserve,
    width: card.width,
    height: card.height + reserve,
  };
}
