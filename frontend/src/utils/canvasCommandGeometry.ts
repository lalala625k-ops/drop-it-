import { PieMenuSlot, Point, pieSectorAt, pieSlotPoint } from './pieMenuGeometry';

export const COMMAND_SIZE = 72;
export const COMMAND_RADIUS = 144;
const MAIN_EXTENT = 190;
const SAVE_RADIUS = 240;

export interface CommandCircle<T extends string> {
  id: T;
  point: Point;
  disabled?: boolean;
}

export function saveCommandCircles(angle: number): CommandCircle<'save' | 'save-as'>[] {
  return [
    { id: 'save', point: pieSlotPoint({ x: 0, y: 0 }, SAVE_RADIUS, angle + 10) },
    { id: 'save-as', point: pieSlotPoint({ x: 0, y: 0 }, SAVE_RADIUS, angle - 10) },
  ];
}

export function placeCommandMenu(origin: Point, saveCircles: CommandCircle<string>[],
  viewport: { width: number; height: number }) {
  const leftExtent = Math.max(MAIN_EXTENT, ...saveCircles.map(({ point }) => COMMAND_SIZE / 2 - point.x));
  const scale = Math.min(1, (viewport.width - 24) / (leftExtent + MAIN_EXTENT),
    (viewport.height - 24) / (MAIN_EXTENT * 2));
  return {
    center: {
      x: Math.max(leftExtent * scale + 12, Math.min(viewport.width - MAIN_EXTENT * scale - 12, origin.x)),
      y: Math.max(MAIN_EXTENT * scale + 12, Math.min(viewport.height - MAIN_EXTENT * scale - 12, origin.y)),
    },
    scale,
  };
}

export function commandCircleAt<T extends string>(pointer: Point, circles: CommandCircle<T>[]): T | null {
  const hit = circles.find(({ point }) => Math.hypot(pointer.x - point.x, pointer.y - point.y) <= COMMAND_SIZE / 2);
  return hit && !hit.disabled ? hit.id : null;
}

export function commandMenuAt<T extends string>(pointer: Point, center: Point, scale: number,
  slots: PieMenuSlot<T>[], saveCircles: CommandCircle<'save' | 'save-as'>[], submenuOpen: boolean): T | 'save' | 'save-as' | null {
  const local = { x: (pointer.x - center.x) / scale, y: (pointer.y - center.y) / scale };
  // Visible sub-buttons own their circular hit areas before the main sectors.
  if (submenuOpen) {
    const saveHit = commandCircleAt(local, saveCircles);
    if (saveHit) return saveHit;
  }
  const mainCircles = slots.map((slot) => ({ ...slot, point: pieSlotPoint({ x: 0, y: 0 }, COMMAND_RADIUS, slot.angle) }));
  const mainHit = commandCircleAt(local, mainCircles);
  if (mainHit) return mainHit;
  const saveTrigger = mainCircles.find(({ id }) => id === 'save-menu');
  if (submenuOpen && saveTrigger) {
    const left = Math.min(...saveCircles.map(({ point }) => point.x)) - COMMAND_SIZE / 2;
    const top = Math.min(saveTrigger.point.y, ...saveCircles.map(({ point }) => point.y)) - COMMAND_SIZE / 2;
    const bottom = Math.max(saveTrigger.point.y, ...saveCircles.map(({ point }) => point.y)) + COMMAND_SIZE / 2;
    // The gap leading to the sub-buttons must not select the adjacent Open sector.
    if (local.x >= left && local.x <= saveTrigger.point.x - COMMAND_SIZE / 2
      && local.y >= top && local.y <= bottom) return null;
  }
  return pieSectorAt(pointer, center, scale, COMMAND_RADIUS, slots, 360 / (slots.length * 2));
}
