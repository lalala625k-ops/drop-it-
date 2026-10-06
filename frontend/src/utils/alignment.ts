import { Card, Group } from '../types';
import { cardHeaderReserve, cardVisualBounds } from './cardBounds';

export type AlignDirection = 'top' | 'bottom' | 'left' | 'right';

export interface AlignItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isGroup?: boolean;
  titleReserve?: number;
}

/**
 * 物理非重叠对齐算法（麻将牌推挤模型）
 *
 * 类似固定刚体麻将块沿着指定方向推移：
 * - 覆盖卡片（Card）与原点（Group），两类物体均参与双向物理碰撞检测，杜绝任何重叠；
 * - 向左对齐：所有选定卡片与原点向左挪动，遇到左边界或前序卡片/原点碰撞时停止，保留 5px 物理间距；
 * - 向右对齐：所有选定卡片与原点向右挪动，遇到右边界或后序卡片/原点碰撞时停止，保留 5px 物理间距；
 * - 向上对齐：所有选定卡片与原点向上挪动，遇到上边界或上方卡片/原点碰撞时停止，保留 5px 物理间距；
 * - 向下对齐：所有选定卡片与原点向下挪动，遇到下边界或下方卡片/原点碰撞时停止，保留 5px 物理间距。
 *
 * @param cardsToAlign 待对齐的卡片集合
 * @param direction 对齐方向
 * @param allCards 画布上所有卡片
 * @param gap 碰撞阻挡后的间距（默认 5px）
 * @param groupsToAlign 待对齐的原点集合
 * @param allGroups 画布上所有原点
 */
export function alignCards(
  cardsToAlign: Card[],
  direction: AlignDirection,
  allCards?: Card[],
  gap: number = 5,
  groupsToAlign?: Group[],
  allGroups?: Group[]
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();

  // 统一转为移动项结构（卡片 + 原点）
  const movingItems: AlignItem[] = [
    ...cardsToAlign.map((c) => ({
      id: c.id,
      ...cardVisualBounds(c),
      titleReserve: cardHeaderReserve(c),
      isGroup: false,
    })),
    ...(groupsToAlign || []).map((g) => ({
      id: g.id,
      x: g.x,
      y: g.y,
      width: g.width || 120,
      height: g.height || 120,
      isGroup: true,
    })),
  ];

  if (movingItems.length === 0) return result;

  // 画布上未被选中的卡片与原点作为不可穿透的固定障碍物
  const movingIds = new Set(movingItems.map((i) => i.id));
  const fixedObstacles: AlignItem[] = [
    ...(allCards || [])
      .filter((c) => !movingIds.has(c.id))
      .map((c) => ({
        id: c.id,
        ...cardVisualBounds(c),
        isGroup: false,
      })),
    ...(allGroups || [])
      .filter((g) => !movingIds.has(g.id))
      .map((g) => ({
        id: g.id,
        x: g.x,
        y: g.y,
        width: g.width || 120,
        height: g.height || 120,
        isGroup: true,
      })),
  ];

  const placedObstacles: AlignItem[] = [...fixedObstacles];
  const allItems: AlignItem[] = [...movingItems, ...fixedObstacles];

  switch (direction) {
    case 'left': {
      const minX =
        movingItems.length > 1
          ? Math.min(...movingItems.map((i) => i.x))
          : Math.min(...allItems.map((i) => i.x));
      // 升序排列：最左侧的麻将块（卡片或原点）优先结算就位
      const sorted = [...movingItems].sort((a, b) => {
        if (a.x !== b.x) return a.x - b.x;
        return a.y - b.y;
      });

      for (const item of sorted) {
        let targetX = minX;
        let collided = true;
        while (collided) {
          collided = false;
          for (const obs of placedObstacles) {
            // Y 轴区间存在垂直投影重叠（卡片与原点互检）
            if (Math.max(item.y, obs.y) < Math.min(item.y + item.height, obs.y + obs.height)) {
              // 检查水平方向是否碰撞
              if (targetX < obs.x + obs.width + gap && targetX + item.width + gap > obs.x) {
                targetX = obs.x + obs.width + gap;
                collided = true;
                break;
              }
            }
          }
        }
        result.set(item.id, { x: targetX, y: item.y + (item.titleReserve ?? 0) });
        placedObstacles.push({
          id: item.id,
          x: targetX,
          y: item.y,
          width: item.width,
          height: item.height,
          isGroup: item.isGroup,
        });
      }
      break;
    }

    case 'right': {
      const maxX =
        movingItems.length > 1
          ? Math.max(...movingItems.map((i) => i.x + i.width))
          : Math.max(...allItems.map((i) => i.x + i.width));
      // 降序排列：最右侧的麻将块优先结算就位
      const sorted = [...movingItems].sort((a, b) => {
        const rA = a.x + a.width;
        const rB = b.x + b.width;
        if (rA !== rB) return rB - rA;
        return a.y - b.y;
      });

      for (const item of sorted) {
        let targetX = maxX - item.width;
        let collided = true;
        while (collided) {
          collided = false;
          for (const obs of placedObstacles) {
            if (Math.max(item.y, obs.y) < Math.min(item.y + item.height, obs.y + obs.height)) {
              if (targetX < obs.x + obs.width + gap && targetX + item.width + gap > obs.x) {
                targetX = obs.x - gap - item.width;
                collided = true;
                break;
              }
            }
          }
        }
        result.set(item.id, { x: targetX, y: item.y + (item.titleReserve ?? 0) });
        placedObstacles.push({
          id: item.id,
          x: targetX,
          y: item.y,
          width: item.width,
          height: item.height,
          isGroup: item.isGroup,
        });
      }
      break;
    }

    case 'top': {
      const minY =
        movingItems.length > 1
          ? Math.min(...movingItems.map((i) => i.y))
          : Math.min(...allItems.map((i) => i.y));
      // 升序排列：最顶端的麻将块优先结算就位
      const sorted = [...movingItems].sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });

      for (const item of sorted) {
        let targetY = minY;
        let collided = true;
        while (collided) {
          collided = false;
          for (const obs of placedObstacles) {
            if (Math.max(item.x, obs.x) < Math.min(item.x + item.width, obs.x + obs.width)) {
              if (targetY < obs.y + obs.height + gap && targetY + item.height + gap > obs.y) {
                targetY = obs.y + obs.height + gap;
                collided = true;
                break;
              }
            }
          }
        }
        result.set(item.id, { x: item.x, y: targetY + (item.titleReserve ?? 0) });
        placedObstacles.push({
          id: item.id,
          x: item.x,
          y: targetY,
          width: item.width,
          height: item.height,
          isGroup: item.isGroup,
        });
      }
      break;
    }

    case 'bottom': {
      const maxY =
        movingItems.length > 1
          ? Math.max(...movingItems.map((i) => i.y + i.height))
          : Math.max(...allItems.map((i) => i.y + i.height));
      // 降序排列：最底端的麻将块优先结算就位
      const sorted = [...movingItems].sort((a, b) => {
        const bA = a.y + a.height;
        const bB = b.y + b.height;
        if (bA !== bB) return bB - bA;
        return a.x - b.x;
      });

      for (const item of sorted) {
        let targetY = maxY - item.height;
        let collided = true;
        while (collided) {
          collided = false;
          for (const obs of placedObstacles) {
            if (Math.max(item.x, obs.x) < Math.min(item.x + item.width, obs.x + obs.width)) {
              if (targetY < obs.y + obs.height + gap && targetY + item.height + gap > obs.y) {
                targetY = obs.y - gap - item.height;
                collided = true;
                break;
              }
            }
          }
        }
        result.set(item.id, { x: item.x, y: targetY + (item.titleReserve ?? 0) });
        placedObstacles.push({
          id: item.id,
          x: item.x,
          y: targetY,
          width: item.width,
          height: item.height,
          isGroup: item.isGroup,
        });
      }
      break;
    }
  }

  return result;
}
