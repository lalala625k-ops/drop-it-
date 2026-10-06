import { shortcutCategories, ShortcutCategoryId, ShortcutItem } from './shortcutCatalog';
import { generalCategories, GeneralCategoryId, GeneralItem } from './generalCatalog';

export interface SettingsTreeNode {
  x: number; y: number; width: number; height: number; level: 0 | 1 | 2;
}
export interface TreeBounds { width: number; height: number; centerX: number; centerY: number }
export interface TreeLink { from: SettingsTreeNode; to: SettingsTreeNode; path: string }
export interface ShortcutRow { item: ShortcutItem; title: SettingsTreeNode; keys: SettingsTreeNode }
export interface GeneralRow { item: GeneralItem; title: SettingsTreeNode; control: SettingsTreeNode }

const node = (x: number, y: number, level: 0 | 1 | 2 = 2): SettingsTreeNode => ({
  x, y, level, width: [216, 192, 144][level], height: [84, 72, 56][level],
});

export const tree = {
  root: node(0, 0, 0), shortcuts: node(300, 0, 1),
  general: node(-300, 0, 1),
  categories: shortcutCategories.map((_, i) => node(560, -240 + i * 96, 1)),
  generalCategories: generalCategories.map((_, i) => node(-560, (i - (generalCategories.length - 1) / 2) * 120, 1)),
  reset: node(300, 360),
};

export function linkBoundary(from: SettingsTreeNode, to: SettingsTreeNode) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const scale = 1 / Math.max(Math.abs(dx) / (from.width / 2), Math.abs(dy) / (from.height / 2));
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

function link(from: SettingsTreeNode, to: SettingsTreeNode, trunkX?: number): TreeLink {
  const direction = to.x > from.x ? 1 : -1;
  const start = trunkX === undefined ? linkBoundary(from, to) : { x: from.x + direction * from.width / 2, y: from.y };
  const end = trunkX === undefined ? linkBoundary(to, from) : { x: to.x - direction * to.width / 2, y: to.y };
  return { from, to, path: trunkX === undefined
    ? `M ${start.x} ${start.y} L ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} H ${trunkX} V ${end.y} H ${end.x}` };
}

function bounds(nodes: SettingsTreeNode[]): TreeBounds {
  const left = Math.min(...nodes.map((n) => n.x - n.width / 2));
  const right = Math.max(...nodes.map((n) => n.x + n.width / 2));
  const top = Math.min(...nodes.map((n) => n.y - n.height / 2)) - 48;
  const bottom = Math.max(...nodes.map((n) => n.y + n.height / 2)) + 24;
  return { width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

const baseNodes = [tree.root, tree.shortcuts, tree.general, tree.reset, ...tree.categories, ...tree.generalCategories];
const baseLinks = [link(tree.root, tree.shortcuts), link(tree.root, tree.general),
  ...tree.categories.map((category) => link(tree.shortcuts, category, 430)),
  link(tree.shortcuts, tree.reset),
  ...tree.generalCategories.map((category) => link(tree.general, category, -430))];

export function createSettingsLayout(active: ShortcutCategoryId | null, activeGeneral: GeneralCategoryId | null = null) {
  const categoryIndex = shortcutCategories.findIndex((category) => category.id === active);
  const category = shortcutCategories[categoryIndex];
  const categoryNode = tree.categories[categoryIndex];
  const rows: ShortcutRow[] = [];
  const links = [...baseLinks];
  if (category) {
    const rowCount = Math.ceil(category.items.length / 2);
    category.items.forEach((item, i) => {
      const column = Math.floor(i / rowCount), row = i % rowCount;
      const y = categoryNode.y + (row - (rowCount - 1) / 2) * 76;
      const title = node(890 + column * 430, y);
      const keys = { ...node(1094 + column * 430, y), width: 216 };
      rows.push({ item, title, keys });
      if (column === 0) links.push(link(categoryNode, title, 780));
      else {
        const endX = title.x - title.width / 2;
        const topY = categoryNode.y - (rowCount - 1) * 38 - 48;
        links.push({ from: categoryNode, to: title,
          path: `M ${categoryNode.x + categoryNode.width / 2} ${categoryNode.y} H 740 V ${topY} H 1210 V ${y} H ${endX}` });
      }
      links.push(link(title, keys));
    });
  }
  const generalIndex = generalCategories.findIndex((entry) => entry.id === activeGeneral);
  const general = generalCategories[generalIndex];
  const generalNode = tree.generalCategories[generalIndex];
  const generalRows: GeneralRow[] = [];
  let generalReset: SettingsTreeNode | null = null;
  if (general) {
    general.items.forEach((item, index) => {
      const y = generalNode.y + (index - (general.items.length - 1) / 2) * 120;
      const title = node(-850, y);
      const control = { ...node(-1094, y), width: 216, height: 84 };
      generalRows.push({ item, title, control });
      links.push(link(generalNode, title, -740), link(title, control));
    });
    generalReset = node(-850, generalRows[generalRows.length - 1].title.y + 120);
    links.push(link(generalNode, generalReset, -740));
  }
  const detailNodes = [...rows.flatMap((row) => [row.title, row.keys]),
    ...generalRows.flatMap((row) => [row.title, row.control]), ...(generalReset ? [generalReset] : [])];
  const nodes = [...baseNodes, ...detailNodes];
  return { rows, generalRows, generalReset, links, nodes, bounds: bounds(nodes),
    focusBounds: category ? bounds([...tree.categories, ...detailNodes])
      : general ? bounds([...tree.generalCategories, ...detailNodes]) : bounds(baseNodes) };
}

export type SettingsLayout = ReturnType<typeof createSettingsLayout>;
