export type GeneralCategoryId = 'files' | 'recovery' | 'canvas';
export interface GeneralItem { id: string; label: string; english: string }
export const generalCategories: { id: GeneralCategoryId; label: string; english: string; items: GeneralItem[] }[] = [
  { id: 'files', label: '文件', english: 'Files', items: [
    { id: 'save_dir', label: '文件保存地址', english: 'Save Folder' },
    { id: 'temp_dir', label: '文件暂存地址', english: 'Draft Folder' },
  ] },
  { id: 'recovery', label: '恢复', english: 'Recovery', items: [
    { id: 'autosave_enabled', label: '自动暂存', english: 'Autosave' },
    { id: 'idle_seconds', label: '暂存频率', english: 'Autosave Interval' },
    { id: 'retention_count', label: '保留版本', english: 'Versions to Keep' },
    { id: 'history', label: '恢复记录', english: 'Recovery History' },
  ] },
  { id: 'canvas', label: '画布', english: 'Canvas', items: [
    { id: 'wheel', label: '滚轮方向', english: 'Wheel Direction' },
    { id: 'minimap', label: '地图显示', english: 'Minimap Display' },
  ] },
];
