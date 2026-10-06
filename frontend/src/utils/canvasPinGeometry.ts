import type { CanvasPin, Rect } from '../types';

export const PIN_SIZE = 88;
export const PIN_PATH = 'M 39.5 8.0 L 48.5 8.0 L 48.5 21.5 A 18.0 18.0 0 0 0 66.5 39.5 L 80.0 39.5 L 80.0 48.5 L 66.5 48.5 A 18.0 18.0 0 0 0 48.5 66.5 L 48.5 80.0 L 39.5 80.0 L 39.5 66.5 A 18.0 18.0 0 0 0 21.5 48.5 L 8.0 48.5 L 8.0 39.5 L 21.5 39.5 A 18.0 18.0 0 0 0 39.5 21.5 Z';
export const pinScale = (zoom: number) => zoom < 0.4 ? Math.min(2, 0.4 / zoom) : 1;
export function pinBounds(pin: CanvasPin, zoom = 1): Rect {
  const size = PIN_SIZE * pinScale(zoom);
  return { x: pin.x - size / 2, y: pin.y - size / 2, width: size, height: size };
}
