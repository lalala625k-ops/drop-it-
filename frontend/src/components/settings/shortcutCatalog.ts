import type { ShortcutSettings } from '../../hooks/useSettings';

export interface ShortcutItem {
  id: string;
  label: string;
  english: string;
  shortcut: string;
  key?: keyof ShortcutSettings;
  bindings?: string[];
  note?: string;
}

export type ShortcutCategoryId = 'navigation' | 'notes' | 'groups' | 'layout' | 'workspace' | 'editing';
export interface ShortcutCategory { id: ShortcutCategoryId; label: string; english: string; items: ShortcutItem[] }

export const shortcutCategories: ShortcutCategory[] = [
  { id: 'navigation', label: '导航', english: 'Navigation', items: [
    { id: 'pan', label: '平移画布', english: 'Pan Canvas', shortcut: 'Space/Alt + 左键拖动\n中键拖动' },
    { id: 'zoom', label: '缩放画布', english: 'Zoom Canvas', shortcut: '滚轮' },
    { id: 'smoothZoom', label: '连续缩放', english: 'Continuous Zoom', shortcut: 'Alt + 中键上下拖动' },
    { id: 'minimap', label: '放大地图', english: 'Expand Minimap', shortcut: '按住 M', bindings: ['M'], note: '松开或窗口失焦后恢复；输入框聚焦时不触发' },
    { id: 'jumpPin', label: '跳转图钉', english: 'Go to Pin', shortcut: 'Ctrl + 1–8', bindings: Array.from({ length: 8 }, (_, i) => `Ctrl+${i + 1}`) },
    { id: 'fit', label: '全览画布', english: 'Fit Canvas', shortcut: 'Shift+1', bindings: ['Shift+1'] },
    { id: 'search', key: 'search', label: '全局搜索', english: 'Search', shortcut: 'Ctrl+K' },
    { id: 'quickSearch', label: '快速搜索', english: 'Quick Search', shortcut: '双击空白画布' },
    { id: 'focusCard', label: '聚焦便签', english: 'Focus Note', shortcut: '双击便签', note: '再次双击同一便签恢复先前视口' },
  ] },
  { id: 'notes', label: '便签', english: 'Notes', items: [
    { id: 'newCard', key: 'newCard', label: '新建便签', english: 'New Note', shortcut: 'Ctrl+N' },
    { id: 'copy', label: '复制', english: 'Copy', shortcut: 'Ctrl+C', bindings: ['Ctrl+C'] },
    { id: 'cut', label: '剪切', english: 'Cut', shortcut: 'Ctrl+X', bindings: ['Ctrl+X'], note: '可跨画板粘贴，保留标题、样式和内部关系；支持撤销' },
    { id: 'paste', label: '粘贴', english: 'Paste', shortcut: 'Ctrl+V', bindings: ['Ctrl+V'], note: '内部对象粘贴后单击确认落点，Escape 取消' },
    { id: 'duplicate', label: '克隆', english: 'Duplicate', shortcut: 'Ctrl+D', bindings: ['Ctrl+D'] },
    { id: 'delete', label: '删除', english: 'Delete', shortcut: 'Delete / Backspace', bindings: ['Delete', 'Backspace'], note: '删除原点同时删除有效下级；删除 Group 保留未单独选中的成员' },
    { id: 'undo', label: '撤销', english: 'Undo', shortcut: 'Ctrl+Z', bindings: ['Ctrl+Z'] },
    { id: 'select', label: '框选', english: 'Marquee Select', shortcut: '空白处左键拖动', note: '支持便签、Group、原点与图钉；框选跨过 Group 轮廓或包住 Group 时选整组，Ctrl 框选可直接命中组区域' },
    { id: 'toggleSelect', label: '切换选择', english: 'Toggle Selection', shortcut: 'Shift + 单击' },
    { id: 'addSelect', label: '追加框选', english: 'Add to Selection', shortcut: 'Shift + 框选' },
  ] },
  { id: 'groups', label: '分组', english: 'Groups', items: [
    { id: 'bundle', key: 'bundle', label: '编组', english: 'Group', shortcut: 'Ctrl+G' },
    { id: 'newParent', key: 'newParent', label: '创建原点', english: 'New Origin', shortcut: 'Ctrl+J', note: '有选中对象时将它们关联到新原点' },
    { id: 'ungroup', label: '解组', english: 'Ungroup', shortcut: 'Ctrl+Shift+G', bindings: ['Ctrl+Shift+G'] },
    { id: 'detach', label: '移出组', english: 'Leave Group', shortcut: 'Ctrl+Alt+G', bindings: ['Ctrl+Alt+G'] },
    { id: 'connect', label: '建立连接', english: 'Connect', shortcut: 'Ctrl+Shift + 左键拖动', note: '从便签或 Group 拖向目标；拖到空白处松开可断开上级' },
    { id: 'disconnect', label: '断开上级', english: 'Disconnect Upstream', shortcut: 'Ctrl+Shift+P', bindings: ['Ctrl+Shift+P'] },
    { id: 'unlink', label: '点击断线', english: 'Unlink', shortcut: 'Ctrl+Shift + 单击' },
    { id: 'moveAlone', label: '独立移动', english: 'Move Independently', shortcut: 'Ctrl/Cmd + 左键拖动', note: 'Group 带自身成员，不带下级分支' },
  ] },
  { id: 'layout', label: '排版', english: 'Layout', items: [
    { id: 'autoPack', key: 'autoPack', label: '自动排版', english: 'Auto Arrange', shortcut: 'Ctrl+P' },
    { id: 'alignTop', label: '上对齐', english: 'Align Top', shortcut: 'Alt+↑ / Ctrl+↑', bindings: ['Alt+ArrowUp', 'Ctrl+ArrowUp'] },
    { id: 'alignBottom', label: '下对齐', english: 'Align Bottom', shortcut: 'Alt+↓ / Ctrl+↓', bindings: ['Alt+ArrowDown', 'Ctrl+ArrowDown'] },
    { id: 'alignLeft', label: '左对齐', english: 'Align Left', shortcut: 'Alt+← / Ctrl+←', bindings: ['Alt+ArrowLeft', 'Ctrl+ArrowLeft'] },
    { id: 'alignRight', label: '右对齐', english: 'Align Right', shortcut: 'Alt+→ / Ctrl+→', bindings: ['Alt+ArrowRight', 'Ctrl+ArrowRight'] },
    { id: 'resetSize', key: 'resetSize', label: '恢复尺寸', english: 'Reset Size', shortcut: 'Ctrl+R', bindings: ['Ctrl+R'], note: '组内便签恢复整个 Group 的尺寸和文字比例；Ctrl+R 保留为固定入口' },
    { id: 'uniformWidth', label: '统一宽度', english: 'Equal Width', shortcut: 'Ctrl+Shift+R', bindings: ['Ctrl+Shift+R'] },
    { id: 'scale', label: '等比缩放', english: 'Scale Proportionally', shortcut: 'Ctrl+Alt + 左键水平拖动' },
    { id: 'snap', label: '磁吸对齐', english: 'Snap Align', shortcut: '拖动中按 Shift+Space', note: '仅单卡拖动启用' },
  ] },
  { id: 'workspace', label: '工作区', english: 'Workspace', items: [
    { id: 'save', label: '保存', english: 'Save', shortcut: 'Ctrl+S', bindings: ['Ctrl+S'], note: '编辑文字时也可保存 .drop 工作区' },
    { id: 'saveAs', label: '另存为', english: 'Save As', shortcut: 'Ctrl+Shift+S', bindings: ['Ctrl+Shift+S'] },
    { id: 'openSettings', key: 'openSettings', label: '打开设置', english: 'Open Settings', shortcut: 'Ctrl+,' },
    { id: 'reload', label: '刷新', english: 'Reload', shortcut: 'F5', bindings: ['F5'] },
    { id: 'devtools', label: '开发工具', english: 'Developer Tools', shortcut: 'F12（开发模式）', bindings: ['F12'], note: '桌面开发模式下由 WebView2 提供' },
  ] },
  { id: 'editing', label: '编辑', english: 'Editing', items: [
    { id: 'editTitle', label: '编辑标题', english: 'Edit Title', shortcut: 'Ctrl+H', bindings: ['Ctrl+H'] },
    { id: 'clearTitle', label: '清除标题', english: 'Clear Title', shortcut: 'Ctrl+Shift+H', bindings: ['Ctrl+Shift+H'] },
    { id: 'tags', label: '管理标签', english: 'Manage Tags', shortcut: 'Ctrl+L', bindings: ['Ctrl+L'] },
    { id: 'reparse', label: '重新解析', english: 'Reparse Link', shortcut: 'Ctrl+U', bindings: ['Ctrl+U'], note: '仅网页便签' },
    { id: 'ocr', label: '识别文字', english: 'Recognize Text', shortcut: 'Ctrl+I', bindings: ['Ctrl+I'], note: '仅图片便签，成功后转为文本便签' },
    { id: 'resolveLink', label: '识别原链接', english: 'Find Source Link', shortcut: 'Ctrl+Shift+I', bindings: ['Ctrl+Shift+I'], note: '仅图片便签，失败时保留原图' },
    { id: 'previousResult', label: '上一结果', english: 'Previous Result', shortcut: '↑', bindings: ['ArrowUp'], note: '搜索弹窗内' },
    { id: 'nextResult', label: '下一结果', english: 'Next Result', shortcut: '↓', bindings: ['ArrowDown'], note: '搜索弹窗内' },
    { id: 'confirm', label: '确认', english: 'Confirm', shortcut: 'Enter', bindings: ['Enter'], note: '搜索定位、标题保存、标签创建和图钉确认等局部操作' },
    { id: 'cancel', label: '取消', english: 'Cancel', shortcut: 'Escape', bindings: ['Escape'], note: '关闭弹窗、取消标题编辑、粘贴预览或快捷键录制' },
    { id: 'pinNumber', label: '图钉编号', english: 'Pin Number', shortcut: '1–8', bindings: Array.from({ length: 8 }, (_, i) => String(i + 1)), note: '图钉编号弹窗内' },
  ] },
];

export const shortcutItems: ShortcutItem[] = shortcutCategories.flatMap((category) => category.items);

export function shortcutLabel(item: ShortcutItem, shortcuts: ShortcutSettings) {
  if (!item.key) return item.shortcut;
  return [...new Set([shortcuts[item.key], ...(item.bindings || [])])].join(' / ');
}

export const settingsNames = [
  ['设置', 'Settings'], ['快捷键', 'Shortcuts'], ['通用设置', 'General Settings'],
  ['文件', 'Files'], ['恢复', 'Recovery'], ['画布', 'Canvas'],
  ['文件保存地址', 'Save Folder'], ['文件暂存地址', 'Draft Folder'],
  ['自动暂存', 'Autosave'], ['暂存频率', 'Autosave Interval'], ['保留版本', 'Versions to Keep'],
  ['恢复记录', 'Recovery History'], ['查看记录', 'View History'], ['恢复（操作）', 'Restore'],
  ['开启', 'Enabled'], ['关闭（自动暂存）', 'Disabled'], ['读取中', 'Loading'],
  ['选择文件夹', 'Choose Folder'], ['打开文件夹', 'Open Folder'],
  ['恢复默认', 'Reset Defaults'],
  ['切换', 'Switch'], ['滚轮方向', 'Wheel Direction'], ['地图显示', 'Minimap Display'],
  ['向上放大', 'Scroll Up to Zoom In'], ['向上缩小', 'Scroll Up to Zoom Out'],
  ['常驻', 'Always Visible'], ['按 M 显示', 'Show on M'],
  ['全览', 'Overview'], ['关闭', 'Close'], ['按下快捷键', 'Press Shortcut'],
  ['点击调整', 'Click to Edit'], ['不可调整', 'Fixed Shortcut'],
  ['切换中', 'Switching'], ['目录绝对路径', 'Absolute Folder Path'],
] as const;
