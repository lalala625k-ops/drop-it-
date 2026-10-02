export interface PieMenuSlot<T extends string> {
  id: T;
  angle: number;
  disabled?: boolean;
}

export interface Point { x: number; y: number }

const GESTURE_THRESHOLD = 18;

export function placePieMenu(origin: Point, extent: number): { center: Point; scale: number } {
  const scale = Math.min(1, (window.innerWidth - 24) / (extent * 2),
    (window.innerHeight - 24) / (extent * 2));
  const margin = extent * scale + 12;
  return {
    center: {
      x: Math.max(margin, Math.min(window.innerWidth - margin, origin.x)),
      y: Math.max(margin, Math.min(window.innerHeight - margin, origin.y)),
    },
    scale,
  };
}

export function pieSlotPoint(center: Point, radius: number, angle: number): Point {
  const radians = angle * Math.PI / 180;
  return { x: center.x + Math.cos(radians) * radius,
    y: center.y + Math.sin(radians) * radius };
}

export function pieGestureMoved(origin: Point, pointer: Point): boolean {
  return Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > GESTURE_THRESHOLD;
}

export function pieSectorAt<T extends string>(pointer: Point, center: Point, scale: number,
  radius: number, slots: PieMenuSlot<T>[], halfAngle = 15): T | null {
  const dx = (pointer.x - center.x) / scale;
  const dy = (pointer.y - center.y) / scale;
  const distance = Math.hypot(dx, dy);
  if (distance < 60 || distance > radius + 72) return null;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  let nearest: PieMenuSlot<T> | null = null;
  let nearestDifference = Infinity;
  for (const slot of slots) {
    const difference = Math.abs(((angle - slot.angle + 540) % 360) - 180);
    if (difference < nearestDifference) { nearest = slot; nearestDifference = difference; }
  }
  if (!nearest || nearestDifference >= halfAngle || nearest.disabled) return null;
  return nearest.id;
}
