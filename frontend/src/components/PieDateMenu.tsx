import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../types';
import { getNowFormatted } from '../utils/dateParser';
import { getTopTags } from '../utils/tagUtils';
import { PieDateInputModal } from './PieDateInputModal';
import { PieTitleInputModal } from './PieTitleInputModal';
import { PieTagModal } from './PieTagModal';
import { GROUP_COLOR_FAMILIES, groupBaseColor, groupColorText, groupShadeColors } from '../utils/groupColors';

export interface PieDateMenuProps {
  card: Card;
  allCards: Card[];
  groupKind?: 'bundle' | 'parent';
  groupColor?: string;
  onGroupColor?: (color: string) => void;
  centerPosition: { x: number; y: number };
  currentPointerPosition: { x: number; y: number };
  isRightMouseDown: boolean;
  onConfirmDate: (dateStr: string | null) => void;
  onConfirmTitle: (title: string | null) => void;
  onToggleTag: (tag: string) => void;
  onReparseLink: () => void;
  onRecognizeImage: (mode: 'ocr' | 'link') => void;
  onUngroup: () => void;
  onDetachFromBundle: () => void;
  onDisconnectCardParent: () => void;
  groupConnections?: { id: string; title: string }[];
  onDisconnectGroupParent?: (parentId: string) => void;
  onClose: () => void;
}

type MenuMode = 'menu' | 'date-input' | 'title-input' | 'tag-search' | 'color-family' | 'color-shades';
type ItemId = 'title' | 'date' | 'now' | 'tag_0' | 'tag_1' | 'tag_2' | 'tag_3' | 'tag_4'
  | 'tag_other' | 'ocr' | 'link' | 'ungroup' | 'color';
type PositionedItem = { id: ItemId; x: number; y: number };
type Layout = { width: number; height: number; center: { x: number; y: number }; items: PositionedItem[] };
const ITEM_SIZE = 72;

const CARD_LAYOUT: Layout = {
  width: 360, height: 360, center: { x: 180, y: 180 },
  items: [
    { id: 'tag_0', x: 131, y: 4 }, { id: 'tag_1', x: 44, y: 34 },
    { id: 'tag_2', x: 5, y: 106 }, { id: 'tag_3', x: 5, y: 190 },
    { id: 'tag_4', x: 44, y: 264 }, { id: 'tag_other', x: 131, y: 284 },
    { id: 'title', x: 251, y: 33 }, { id: 'date', x: 283, y: 144 },
    { id: 'now', x: 251, y: 254 },
  ],
};
const IMAGE_LAYOUT: Layout = {
  width: 260, height: 150, center: { x: 130, y: 75 },
  items: [{ id: 'ocr', x: 8, y: 39 }, { id: 'link', x: 180, y: 39 }],
};
const BUNDLE_LAYOUT: Layout = {
  width: 300, height: 300, center: { x: 150, y: 150 },
  items: [
    { id: 'title', x: 25, y: 15 }, { id: 'date', x: 3, y: 114 },
    { id: 'now', x: 25, y: 213 }, { id: 'tag_other', x: 203, y: 15 },
    { id: 'color', x: 203, y: 114 },
    { id: 'ungroup', x: 203, y: 213 },
  ],
};
const PARENT_LAYOUT: Layout = {
  width: 260, height: 190, center: { x: 130, y: 95 },
  items: [{ id: 'title', x: 8, y: 59 }, { id: 'color', x: 94, y: 0 }, { id: 'ungroup', x: 180, y: 59 }],
};
const COLOR_POSITIONS = [
  { x: 114, y: 0 }, { x: 203, y: 42 }, { x: 203, y: 172 },
  { x: 114, y: 228 }, { x: 25, y: 172 }, { x: 25, y: 42 },
];
const COLOR_LAYOUT: Layout = { width: 300, height: 300, center: { x: 150, y: 150 }, items: [] };

export const PieDateMenu: React.FC<PieDateMenuProps> = ({
  card, allCards, groupKind, groupColor, onGroupColor, centerPosition, currentPointerPosition, isRightMouseDown,
  onConfirmDate, onConfirmTitle, onToggleTag, onReparseLink, onRecognizeImage,
  onUngroup, onDetachFromBundle, onDisconnectCardParent,
  groupConnections, onDisconnectGroupParent, onClose,
}) => {
  const [mode, setMode] = useState<MenuMode>('menu');
  const [shadeHue, setShadeHue] = useState(0);
  const gestureTargetRef = useRef<ItemId | null>(null);
  const wasDraggingRef = useRef(false);
  const topTags = useMemo(() => getTopTags(allCards, 5), [allCards]);
  const cardTags = Array.isArray(card.tags) ? card.tags : [];
  const layout = mode === 'color-family' || mode === 'color-shades' ? COLOR_LAYOUT
    : groupKind === 'bundle' ? BUNDLE_LAYOUT : groupKind === 'parent' ? PARENT_LAYOUT
    : card.type === 'image' ? IMAGE_LAYOUT : CARD_LAYOUT;
  const dx = currentPointerPosition.x - centerPosition.x;
  const dy = currentPointerPosition.y - centerPosition.y;
  const isDragging = isRightMouseDown && Math.hypot(dx, dy) > 18;
  const activeItem = useMemo(() => {
    if (!isDragging) return null;
    const distance = Math.hypot(dx, dy);
    let nearest: ItemId | null = null;
    let bestScore = -Infinity;
    for (const item of layout.items) {
      const itemDx = item.x + ITEM_SIZE / 2 - layout.center.x;
      const itemDy = item.y + ITEM_SIZE / 2 - layout.center.y;
      const score = (dx * itemDx + dy * itemDy) / (distance * Math.hypot(itemDx, itemDy));
      if (score > bestScore) { bestScore = score; nearest = item.id; }
    }
    return nearest;
  }, [isDragging, dx, dy, layout]);
  if (isDragging) {
    wasDraggingRef.current = true;
    gestureTargetRef.current = activeItem;
  }

  const chooseItem = (id: ItemId) => {
    if (id === 'title') setMode('title-input');
    else if (id === 'date') setMode('date-input');
    else if (id === 'now') onConfirmDate(getNowFormatted().formattedText);
    else if (id === 'tag_other') setMode('tag-search');
    else if (id === 'color') setMode('color-family');
    else if (id === 'ocr' || id === 'link') {
      if (!card.isParsing) onRecognizeImage(id);
    }
    else if (id === 'ungroup') onUngroup();
    else {
      const tag = topTags[Number(id.slice(4))];
      if (tag) onToggleTag(tag);
    }
  };
  useEffect(() => {
    if (!isRightMouseDown && wasDraggingRef.current && mode === 'menu') {
      wasDraggingRef.current = false;
      const target = gestureTargetRef.current;
      gestureTargetRef.current = null;
      if (target) chooseItem(target);
    }
  }, [isRightMouseDown, mode]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const hasExtras = !groupKind && (card.type === 'web' && !!card.url || !!card.bundleId || !!card.groupId);
  const bottomExtra = 12 + (hasExtras ? 82 : 0) + (groupConnections?.length ? 146 : 0);
  const scale = Math.min(1, (window.innerWidth - 24) / layout.width,
    (window.innerHeight - 24) / (layout.height + bottomExtra));
  const halfWidth = layout.width * scale / 2;
  const halfHeight = layout.height * scale / 2;
  const clampedX = Math.max(halfWidth + 12, Math.min(window.innerWidth - halfWidth - 12, centerPosition.x));
  const clampedY = Math.max(halfHeight + 12,
    Math.min(window.innerHeight - halfHeight - bottomExtra * scale - 12, centerPosition.y));

  const itemLabel = (id: ItemId) => {
    if (id.startsWith('tag_') && id !== 'tag_other') return topTags[Number(id.slice(4))];
    return ({ title: '设置标题', date: '输入时间', now: 'NOW', tag_other: '其他标签', color: '颜色',
      ocr: 'OCR 识别', link: '识别原链接', ungroup: groupKind === 'parent' ? '解散父物体' : '解散 Group' } as Record<string, string>)[id];
  };

  return (
    <div className="fixed inset-0 z-[10002] pointer-events-auto select-none"
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {mode === 'menu' || mode === 'color-family' || mode === 'color-shades' ? (
        <div className="absolute pointer-events-auto"
          style={{ left: clampedX, top: clampedY, width: layout.width,
            transform: `translate(-50%, -50%) scale(${scale})` }}
          onMouseDown={(event) => event.stopPropagation()}>
          <div className="relative" style={{ width: layout.width, height: layout.height }}>
            {mode === 'menu' ? layout.items.map(({ id, x, y }) => {
              const isTagged = id.startsWith('tag_') && id !== 'tag_other' && cardTags.includes(itemLabel(id));
              const isActive = activeItem === id;
              return (
                <button key={id} type="button" onClick={() => chooseItem(id)}
                  disabled={card.isParsing && (id === 'ocr' || id === 'link')}
                  title={itemLabel(id)}
                  style={{ left: x, top: y }}
                  className={`absolute flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 px-1.5 text-center transition-colors duration-100 disabled:opacity-50 ${
                    isActive ? 'border-ink bg-paper text-ink' : 'border-ink bg-ink text-paper hover:bg-paper hover:text-ink'
                  }`}>
                  <span className="max-h-[2.4em] max-w-[58px] overflow-hidden break-all text-[11px] font-bold leading-[1.2] tracking-[0.02em]">
                    {isTagged ? '✓ ' : id.startsWith('tag_') && id !== 'tag_other' ? '# ' : ''}{itemLabel(id)}
                  </span>
                </button>
              );
            }) : COLOR_POSITIONS.map(({ x, y }, index) => {
              const family = GROUP_COLOR_FAMILIES[index];
              const color = mode === 'color-family' ? groupBaseColor(family.hue) : groupShadeColors(shadeHue)[index];
              return <button key={`${mode}-${index}`} type="button"
                title={mode === 'color-family' ? `${family.name}色；右键细选` : `${GROUP_COLOR_FAMILIES.find((item) => item.hue === shadeHue)?.name || ''}色变体 ${index + 1}`}
                aria-label={mode === 'color-family' ? `${family.name}色，右键查看更多` : `颜色变体 ${index + 1}`}
                onClick={() => onGroupColor?.(color)}
                onContextMenu={(event) => { event.preventDefault(); event.stopPropagation();
                  if (mode === 'color-family') { setShadeHue(family.hue); setMode('color-shades'); } }}
                style={{ left: x, top: y, backgroundColor: color, color: groupColorText(color) }}
                className={`absolute flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 text-[11px] font-bold text-white ${
                  groupColor === color ? 'border-[4px] border-ink' : 'border-paper hover:border-ink'
                }`}>
                {mode === 'color-family' ? family.name : ''}
              </button>;
            })}
            <div className="absolute flex h-[32px] w-[32px] items-center justify-center rounded-full border-2 border-ink bg-ink text-paper"
              style={{ left: layout.center.x - 16, top: layout.center.y - 16 }}>
              {mode !== 'menu' ? (
                <button type="button" onClick={() => setMode(mode === 'color-shades' ? 'color-family' : 'menu')}
                  title="返回" className="h-full w-full rounded-full text-[13px] font-bold">‹</button>
              ) : card.reminder && !isDragging && groupKind !== 'parent' && card.type !== 'image' ? (
                <button type="button" onClick={() => onConfirmDate(null)} title="清除已标记的日期"
                  className="h-full w-full rounded-full text-[9px] font-bold text-paper hover:bg-paper hover:text-ink">清除</button>
              ) : <span className="h-1.5 w-1.5 rounded-full bg-paper" />}
            </div>
          </div>
          {mode === 'menu' && hasExtras && (
            <div className="mx-auto mt-2 flex w-fit max-w-full flex-wrap justify-center gap-2">
              {card.type === 'web' && card.url && (
                <button type="button" onClick={onReparseLink} disabled={card.isParsing}
                  className="h-[72px] w-[72px] rounded-full border-2 border-ink bg-ink px-1.5 text-center text-[10px] font-bold leading-tight text-paper hover:bg-paper hover:text-ink disabled:opacity-50">
                  {card.isParsing ? '解析中' : '重新解析链接'}
                </button>
              )}
              {card.bundleId && <button type="button" onClick={onDetachFromBundle}
                className="h-[72px] w-[72px] rounded-full border-2 border-ink bg-ink px-1.5 text-center text-[10px] font-bold leading-tight text-paper hover:bg-paper hover:text-ink">脱离 Group</button>}
              {card.groupId && <button type="button" onClick={onDisconnectCardParent}
                className="h-[72px] w-[72px] rounded-full border-2 border-ink bg-ink px-1.5 text-center text-[10px] font-bold leading-tight text-paper hover:bg-paper hover:text-ink">断开连线</button>}
            </div>
          )}
          {mode === 'menu' && groupConnections && groupConnections.length > 0 && (
            <div className="mx-auto mt-2 flex max-h-32 w-[300px] flex-wrap justify-center gap-2 overflow-y-auto p-1">
              {groupConnections.map((parent) => (
                <button key={parent.id} type="button"
                  title={`断开与「${parent.title || '父物体'}」的连接`}
                  className="h-[72px] w-[72px] rounded-full border-2 border-ink bg-ink px-1 text-center text-[10px] font-bold leading-tight text-paper hover:bg-paper hover:text-ink"
                  onClick={() => onDisconnectGroupParent?.(parent.id)}>
                  <span className="mx-auto block max-h-[2.5em] max-w-[60px] overflow-hidden break-all">
                    断开 {parent.title || '父物体'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : mode === 'date-input' ? (
        <PieDateInputModal card={card} position={{ x: clampedX, y: clampedY }}
          onConfirm={onConfirmDate} onClearDate={() => onConfirmDate(null)}
          onBackToPie={() => setMode('menu')} onClose={onClose} />
      ) : mode === 'title-input' ? (
        <PieTitleInputModal
          initialTitle={card.headerTitle || (card.type === 'text' ? card.title || '' : '')}
          originalTitle={card.title || undefined} cardType={card.type}
          position={{ x: clampedX, y: clampedY }} onConfirm={onConfirmTitle}
          onBackToPie={() => setMode('menu')} onClose={onClose} />
      ) : (
        <PieTagModal card={card} allCards={allCards} position={{ x: clampedX, y: clampedY }}
          onToggleTag={onToggleTag} onBackToPie={() => setMode('menu')} onClose={onClose} />
      )}
    </div>
  );
};
