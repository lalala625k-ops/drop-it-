export type RadialAction = 'note' | 'parent' | 'pin' | 'title' | 'tag' | 'color'
  | 'cut' | 'copy' | 'paste' | 'group' | 'ungroup' | 'detach' | 'disconnect'
  | 'reset-size' | 'uniform-width' | 'auto-pack' | 'open' | 'save' | 'save-as'
  | 'new-board' | 'ocr' | 'link' | 'reparse' | 'search' | 'settings';
export type RadialBranch = 'file-menu' | 'layout-menu' | 'group-menu' | 'recognize-menu';
export type RadialItemId = RadialAction | RadialBranch;
export interface RadialItem {
  id: RadialItemId; label: string; description: string; angle: number;
  shortcut?: string; disabled?: boolean; children?: RadialItem[];
}
const definitions: Record<RadialAction, [string, string, string?]> = {
  note: ['新标签', '新建便签', 'Ctrl+N'], parent: ['原点', '新建原点', 'Ctrl+J'],
  pin: ['图钉', '在当前位置打图钉'], title: ['标题', '编辑标题', 'Ctrl+H'],
  tag: ['标签', '搜索和管理标签', 'Ctrl+L'], color: ['颜色', '设置原点颜色'],
  cut: ['剪切', '剪切选中对象', 'Ctrl+X'], copy: ['复制', '复制选中对象', 'Ctrl+C'],
  paste: ['粘贴', '粘贴系统剪贴板中的对象', 'Ctrl+V'],
  group: ['编组', '将选中便签组成 Group', 'Ctrl+G'],
  ungroup: ['解组', '解散组并保留关联对象', 'Ctrl+Shift+G'],
  detach: ['移出组', '将便签移出当前 Group', 'Ctrl+Alt+G'],
  disconnect: ['断线', '断开上级连线', 'Ctrl+Shift+P'],
  'reset-size': ['复原', '恢复默认大小', 'Ctrl+R'],
  'uniform-width': ['等宽', '统一便签宽度', 'Ctrl+Shift+R'],
  'auto-pack': ['自动排版', '自动整理便签', 'Ctrl+P'],
  open: ['打开', '打开 .drop 画板文件'], save: ['保存', '保存当前 .drop 文件', 'Ctrl+S'],
  'save-as': ['另存', '另存为新的 .drop 文件', 'Ctrl+Shift+S'],
  'new-board': ['新画板', '打开独立的新画板窗口'],
  ocr: ['OCR', '识别图片文字', 'Ctrl+I'], link: ['溯源', '识别图片原链接', 'Ctrl+Shift+I'],
  reparse: ['解析', '重新解析网页链接', 'Ctrl+U'],
  search: ['搜索', '搜索便签', 'Ctrl+K'], settings: ['设置', '打开设置', 'Ctrl+,'],
};
// These angles never change when an unavailable operation is omitted.
const angles: Partial<Record<RadialItemId, number>> = {
  note: -90, title: -90, pin: -60, tag: -60, parent: -30, color: -30,
  cut: 0, copy: 30, paste: 60, 'group-menu': 90, 'layout-menu': 120,
  'recognize-menu': 150, 'file-menu': 180, search: 210, settings: 240,
};
const branches: Record<RadialBranch, [string, RadialAction[]]> = {
  'file-menu': ['文件', ['open', 'save', 'save-as', 'new-board']],
  'layout-menu': ['排版', ['reset-size', 'uniform-width', 'auto-pack']],
  'group-menu': ['组', ['group', 'ungroup', 'detach', 'disconnect']],
  'recognize-menu': ['识别', ['ocr', 'link', 'reparse']],
};
export function radialAction(id: RadialAction, overrides: Partial<RadialItem> = {}): RadialItem {
  const [label, description, shortcut] = definitions[id];
  return { id, label, description, shortcut, angle: angles[id] ?? 0, ...overrides };
}
export function radialBranch(id: RadialBranch, availability: Partial<Record<RadialAction, boolean>> = {}): RadialItem {
  const [label, children] = branches[id];
  // Disabled children retain their slots so every submenu also stays fixed.
  return { id, label, description: label, angle: angles[id]!,
    children: children.map((child) => radialAction(child, { disabled: availability[child] === false })) };
}
export const commonRadialItems = () => [radialBranch('file-menu'), radialAction('search'), radialAction('settings')];
