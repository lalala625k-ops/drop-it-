import React from 'react';
import { Card, Group } from '../types';
import { bundleCollapsedHeight, bundleCollapsedWidth, bundleOutline, bundleOutlinePoints, bundleResizeHandles, BundleResizeCorner } from '../hooks/useBundleGroups';
import { parseMarkdownHeading } from '../utils/headingUtils';
import { isFeishuUrl } from '../utils/feishu';
import { FeishuLogo } from './FeishuLogo';

interface Props {
  group: Group;
  members: Card[];
  selected: boolean;
  parentHighlighted?: boolean;
  onDrag: (event: React.MouseEvent) => void;
  onResize: (corner: BundleResizeCorner, event: React.MouseEvent) => void;
  onToggle: () => void;
  onOpenPieMenu: (x: number, y: number) => void;
}

const MemberIcon: React.FC<{ card: Card }> = ({ card }) => {
  const [iconIndex, setIconIndex] = React.useState(0);
  const icons = card.favicon ? [card.favicon] : [];
  if (card.type === 'web' && isFeishuUrl(card.url)) return <FeishuLogo className="w-4 h-4" />;
  if (card.type === 'web' && card.url) {
    try {
      const siteIcon = new URL('/favicon.ico', card.url).href;
      if (!icons.includes(siteIcon)) icons.push(siteIcon);
    } catch { /* Invalid URL: use the generic icon. */ }
  }
  if (card.type === 'web' && icons[iconIndex]) {
    return <img src={icons[iconIndex]} alt="" className="w-4 h-4 shrink-0 object-contain" referrerPolicy="no-referrer" onError={() => setIconIndex((index) => index + 1)} />;
  }
  return <span className="w-4 h-4 shrink-0 text-center text-xs leading-4" aria-hidden="true">{card.type === 'web' ? '🌐' : card.type === 'image' ? '▧' : '▤'}</span>;
};

const memberTitle = (card: Card) => {
  const title = (card.headerTitle || card.title || card.content?.split('\n').find((line) => line.trim()) || '').replace(/^#{1,6}\s+/, '').trim();
  return title || (card.type === 'web' ? '网页' : card.type === 'image' ? '图片' : '便签');
};

const BundleGroupComponentInner: React.FC<Props> = ({ group, members, selected, parentHighlighted = false, onDrag, onResize, onToggle, onOpenPieMenu }) => {
  const tags = group.tags || [];
  const collapsed = !!group.collapsed;
  const parsedTitle = parseMarkdownHeading(group.title);
  const titleScale = (group.outlinePadding ?? 18) / 18;
  const outline = !collapsed ? bundleOutline(members, group) : '';
  const topLeftOutlinePoint = !collapsed ? (() => {
    const points = bundleOutlinePoints(members, group);
    const boxLeft = Math.min(...points.map((point) => point.x));
    const boxTop = Math.min(...points.map((point) => point.y));
    return points.reduce((best, point) => {
      const distance = (point.x - boxLeft) ** 2 + (point.y - boxTop) ** 2;
      const bestDistance = (best.x - boxLeft) ** 2 + (best.y - boxTop) ** 2;
      return distance < bestDistance ? point : best;
    });
  })() : null;
  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleOutlineMouseDown = (event: React.MouseEvent) => {
    if (event.button === 2) { event.preventDefault(); event.stopPropagation(); return; }
    onDrag(event);
  };

  return <div data-bundle-id={group.id} className="absolute pointer-events-none z-[0]"
    style={{ left: group.x, top: group.y, width: collapsed ? bundleCollapsedWidth(group.width) : group.width,
      height: collapsed ? bundleCollapsedHeight(members.length) : group.height,
      border: collapsed ? `${parentHighlighted ? 4 : 2}px solid ${selected || parentHighlighted ? '#1d1d1d' : '#a8a7a2'}` : undefined,
      backgroundColor: collapsed ? (group.color || '#ffffff') : 'transparent', color: '#1d1d1d' }}>
    {!collapsed && <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox={`0 0 ${group.width} ${group.height}`}>
      <path d={outline} fill={group.color || '#ffffff'} fillOpacity="0.2" stroke="transparent" strokeWidth="16" className="pointer-events-auto cursor-move"
        onMouseDown={handleOutlineMouseDown} onContextMenu={openMenu} />
      <path d={outline} fill="none" stroke={selected || parentHighlighted ? '#1d1d1d' : '#a8a7a2'} strokeWidth={parentHighlighted ? 4 : 2} strokeDasharray="7 5" pointerEvents="none" />
    </svg>}
    {!collapsed && selected && bundleResizeHandles(members, group).map(({ corner, point }) => (
      <button key={corner} type="button" data-resize-handle={corner} title={`拖动缩放 Group（${corner.toUpperCase()}）`}
        aria-label={`缩放 Group ${corner.toUpperCase()}`}
        className={`absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2 border-ink bg-paper pointer-events-auto ${
          corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
        }`}
        style={{ left: point.x, top: point.y }}
        onMouseDown={(event) => onResize(corner, event)} />
    ))}
    {parsedTitle.cleanText && <div className="absolute bottom-full right-0 pointer-events-auto select-none cursor-move font-retina"
      style={{ left: 40 * titleScale, marginBottom: 6 * titleScale,
        fontSize: (parsedTitle.level === 2 ? 27 : 36) * titleScale,
        lineHeight: parsedTitle.level === 2 ? 1.2 : 1.15,
        fontWeight: parsedTitle.level === 2 ? 700 : 900 }}
      onMouseDown={handleOutlineMouseDown} onContextMenu={openMenu} title={parsedTitle.cleanText}>
      <span className="line-clamp-2">{parsedTitle.cleanText}</span>
    </div>}
    <button type="button" className="absolute left-0 -top-9 z-10 w-7 h-7 rounded-none bg-paper border border-ink text-sm font-bold cursor-pointer pointer-events-auto"
      style={topLeftOutlinePoint ? { left: topLeftOutlinePoint.x - 14, top: topLeftOutlinePoint.y - 36 } : undefined}
      title={collapsed ? '展开 Group' : '收起 Group'}
      onMouseDown={(event) => event.stopPropagation()} onContextMenu={openMenu}
      onClick={(event) => { event.stopPropagation(); onToggle(); }}>{collapsed ? '▸' : '▾'}</button>
    {collapsed && <div className="absolute left-0 top-0 right-0 h-11 flex items-center justify-end gap-2 px-2 bg-paper border-b border-ash pointer-events-auto cursor-move select-none"
      onMouseDown={handleOutlineMouseDown}
      onContextMenu={openMenu}>
      <span className="text-[11px] text-ink/60">{members.length} 张</span>
      {collapsed && tags.length > 0 && <span className="max-w-16 truncate text-[10px] text-ink/60" title={tags.join('、')}>#{tags[0]}{tags.length > 1 ? ` +${tags.length - 1}` : ''}</span>}
      {group.reminder && <span className="text-[10px] font-bold whitespace-nowrap">{group.reminder}</span>}
      <button type="button" title="Group 右键菜单" className="px-1 text-sm cursor-pointer"
        onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const box = event.currentTarget.getBoundingClientRect(); onOpenPieMenu(box.right, box.bottom); }}>⋯</button>
    </div>}
    {collapsed && <div className="absolute top-11 bottom-0 left-0 right-0 overflow-y-auto pointer-events-auto"
      onMouseDown={handleOutlineMouseDown}
      onContextMenu={openMenu}>
      {members.length ? members.map((card) => <div key={card.id} className="h-8 flex items-center gap-2 px-3 border-t border-ash/40 text-xs" title={memberTitle(card)}>
        <MemberIcon key={card.favicon || card.url || card.id} card={card} />
        <span className="min-w-0 truncate">{memberTitle(card)}</span>
      </div>) : <div className="h-8 px-3 leading-8 text-xs text-ink/50">空 Group</div>}
    </div>}
    {!collapsed && tags.length > 0 && <div className="absolute top-10 left-2 flex flex-wrap gap-1 pointer-events-none">
      {tags.map((tag) => <span key={tag} className="bg-stone px-1.5 py-0.5 text-[10px] font-bold">#{tag}</span>)}
    </div>}
  </div>;
};

export const BundleGroupComponent = React.memo(BundleGroupComponentInner, (previous, next) =>
  previous.group === next.group && previous.members === next.members &&
  previous.selected === next.selected && previous.parentHighlighted === next.parentHighlighted);
