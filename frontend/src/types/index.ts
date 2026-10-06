export type CardType = 'image' | 'web' | 'text';

export interface Card {
  id: string;               // 唯一标识
  type: CardType;           // 类型
  x: number;                // X坐标
  y: number;                // Y坐标
  width: number;            // 宽度
  height: number;           // 高度
  zIndex: number;           // 层级
  groupId?: string | null;  // 树中的唯一父节点 ID（卡片、外层 Group 或圆形原点）
  bundleId?: string | null; // 所属外层 Group ID；与原点连线独立
  content?: string;         // 文本内容 / OCR全文
  title?: string;           // 网页标题 / 图片提取标题 / 原标题
  headerTitle?: string;     // 顶部超大字粗体自定义标题 (占满卡片宽度)
  url?: string;             // 网页链接
  image?: string;           // 网页缩略图 / 图片卡片Base64或路径
  thumbnail?: string;       // 800px WebP 低阶预览图路径（用于流畅缩放）
  description?: string;     // 网页完整描述 (悬停展示)
  favicon?: string;         // 网站图标
  reminder?: string | null; // 标记日期与提醒时间 (如 "2026-06-26")
  tags?: string[];          // 卡片标签集合 (如 ["灵感", "待办"])
  isParsing?: boolean;      // 图片/网页元数据解析中状态 (显示旋转加载动效)
  sizeLocked?: boolean;     // 手动/整组缩放后不再由网页头图自动改写高度
  defaultWidth?: number;    // 手动缩放前的卡片宽度，供恢复默认大小
  defaultHeight?: number;   // 手动缩放前的卡片高度
  contentScale?: number;    // 整组缩放后的卡片内部内容比例
  color?: string;           // 卡片背景底色 (如 "#ffffff")
  textColor?: string;       // 卡片文字与油墨色 (如 "#1d1d1d")
  borderColor?: string;     // 卡片边框颜色 (如 "#1d1d1d")
}

export interface Group {
  id: string;               // 唯一标识
  title: string;            // 原点名称 / 容器标题
  x: number;                // X坐标
  y: number;                // Y坐标
  width: number;            // 宽度
  height: number;           // 高度
  color?: string;           // 容器强调色
  zIndex?: number;          // 层级 (默认为底板层级)
  kind?: 'parent' | 'bundle'; // 旧数据无 kind 时为圆形原点
  parentIds?: string[];       // 外层 Group 的唯一父节点；保留数组字段兼容旧数据，最多一项
  collapsed?: boolean;      // 外层 Group 收起状态
  outlinePadding?: number;  // 外层 Group 轮廓与成员卡片间距，默认 18
  tags?: string[];          // 外层 Group 标签
  reminder?: string | null; // 外层 Group 日期标记
  textColor?: string;
  borderColor?: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapLine {
  type: 'vertical' | 'horizontal';
  position: number;
  start: number;
  end: number;
}

export interface HistoryState {
  cards: Card[];
  groups: Group[];
  pins?: CanvasPin[];
}

export interface CanvasPin {
  id: string;
  index: number;
  x: number;
  y: number;
  zoom?: number;
  createdAt: number;
}
