import { Rect } from '../types';

const CELL = 512;

export class SpatialIndex<T extends { id: string }> {
  private cells = new Map<string, T[]>();
  private overflow: T[] = [];
  private items: T[];

  constructor(items: T[], bounds: (item: T) => Rect) {
    this.items = items;
    for (const item of items) {
      const box = bounds(item);
      const x0 = Math.floor(box.x / CELL);
      const y0 = Math.floor(box.y / CELL);
      const x1 = Math.floor((box.x + box.width) / CELL);
      const y1 = Math.floor((box.y + box.height) / CELL);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) { this.overflow.push(item); continue; }
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const key = `${x}:${y}`;
        const cell = this.cells.get(key) || [];
        cell.push(item);
        this.cells.set(key, cell);
      }
    }
  }

  query(rect: Rect): T[] {
    const columns = Math.floor((rect.x + rect.width) / CELL) - Math.floor(rect.x / CELL) + 1;
    const rows = Math.floor((rect.y + rect.height) / CELL) - Math.floor(rect.y / CELL) + 1;
    if (columns * rows > 4096) return this.items;
    const found = new Map<string, T>();
    for (const item of this.overflow) found.set(item.id, item);
    for (let y = Math.floor(rect.y / CELL); y <= Math.floor((rect.y + rect.height) / CELL); y++) {
      for (let x = Math.floor(rect.x / CELL); x <= Math.floor((rect.x + rect.width) / CELL); x++) {
        for (const item of this.cells.get(`${x}:${y}`) || []) found.set(item.id, item);
      }
    }
    return [...found.values()];
  }
}
