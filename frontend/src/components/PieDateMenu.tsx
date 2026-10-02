import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Group } from '../types';
import { getNowFormatted } from '../utils/dateParser';
import { groupGradientColor } from '../utils/groupColors';
import { PieMenuSlot, pieGestureMoved, pieSectorAt, pieSlotPoint, placePieMenu, Point } from '../utils/pieMenuGeometry';
import { PieDateInputModal } from './PieDateInputModal';
import { PieTitleInputModal } from './PieTitleInputModal';
import { PieTagModal } from './PieTagModal';
import { GradientColorArc } from './GradientColorArc';
import { MenuShortcutHint, useMenuShortcutHint } from './MenuShortcutHint';

export type PieMenuTarget =
  | { kind: 'card'; card: Card }
  | { kind: 'bundle' | 'parent'; group: Group };

export interface PieDateMenuProps {
  target: PieMenuTarget;
  allCards: Card[];
  parentId?: string | null;
  centerPosition: Point;
  currentPointerPosition: Point;
  isRightMouseDown: boolean;
  onConfirmDate: (dateStr: string | null) => void;
  onConfirmTitle: (title: string | null) => void;
  onToggleTag: (tag: string) => void;
  onReparseLink: () => void;
  onRecognizeImage: (mode: 'ocr' | 'link') => void;
  onUngroup: () => void;
  onResetSize: () => void;
  onDetachFromBundle: () => void;
  onDisconnectParent: () => void;
  onGroupColor: (color: string) => void;
  onClose: () => void;
}

type MenuMode = 'menu' | 'date-input' | 'title-input' | 'tag-search';
type ItemId = 'title' | 'date' | 'now' | 'reset_size' | 'reparse' | 'ungroup'
  | 'detach' | 'disconnect' | 'tag' | 'ocr' | 'link';

const ITEM_SIZE = 72;
const RADIUS = 180;
const EXTENT = 228;
const SLOT_ANGLES: Record<ItemId, number> = {
  title: -60, date: -30, now: 0, reset_size: 30, reparse: 60,
  ungroup: 90, detach: 120, disconnect: 150, tag: 180, ocr: 210, link: 240,
};

function menuSlots(target: PieMenuTarget, parentId?: string | null): PieMenuSlot<ItemId>[] {
  const ids: ItemId[] = ['title'];
  if (target.kind !== 'parent') {
    ids.push('date', 'now', 'reset_size', 'tag');
    if (target.kind === 'bundle') {
      ids.push('ungroup');
      if (parentId) ids.push('disconnect');
    } else if (target.kind === 'card') {
      if (target.card.type === 'web' && target.card.url) ids.push('reparse');
      if (target.card.type === 'image') ids.push('ocr', 'link');
      if (target.card.bundleId) ids.push('detach');
      if (target.card.groupId) ids.push('disconnect');
    }
  } else ids.push('ungroup');
  return ids.map((id) => ({ id, angle: SLOT_ANGLES[id],
    disabled: target.kind === 'card' && !!target.card.isParsing
      && (id === 'reparse' || id === 'ocr' || id === 'link') }));
}

function parentColorAt(pointer: Point, center: Point, scale: number): string | null {
  const x = (pointer.x - center.x) / scale;
  const y = (pointer.y - center.y) / scale;
  const radius = Math.hypot(x, y);
  if (x > 0 || radius < 88 || radius > 138) return null;
  const angle = Math.atan2(y, x);
  const leftAngle = angle > 0 ? angle - Math.PI * 2 : angle;
  const progress = (-Math.PI / 2 - leftAngle) / Math.PI;
  if (progress < 0 || progress > 1) return null;
  const index = Math.min(63, Math.floor(progress * 64));
  return groupGradientColor((index + 0.5) / 64);
}

export const PieDateMenu: React.FC<PieDateMenuProps> = ({
  target, allCards, parentId, centerPosition, currentPointerPosition, isRightMouseDown,
  onConfirmDate, onConfirmTitle, onToggleTag, onReparseLink, onRecognizeImage,
  onUngroup, onResetSize, onDetachFromBundle, onDisconnectParent, onGroupColor, onClose,
}) => {
  const [mode, setMode] = useState<MenuMode>('menu');
  const { hint, showHint, hideHint } = useMenuShortcutHint();
  const rightHeldRef = useRef(isRightMouseDown);
  const { center, scale } = placePieMenu(centerPosition, EXTENT);
  const slots = useMemo(() => menuSlots(target, parentId), [target, parentId]);
  const card = target.kind === 'card' ? target.card : undefined;
  const reminder = target.kind === 'card' ? target.card.reminder : target.group.reminder;
  const tags = target.kind === 'card' ? target.card.tags : target.group.tags;
  const isDragging = isRightMouseDown && pieGestureMoved(centerPosition, currentPointerPosition);
  const overColor = target.kind === 'parent'
    && !!parentColorAt(currentPointerPosition, center, scale);
  const activeItem = isDragging && !overColor
    ? pieSectorAt(currentPointerPosition, center, scale, RADIUS, slots) : null;

  const chooseItem = (id: ItemId) => {
    if (slots.find((slot) => slot.id === id)?.disabled) return;
    if (id === 'title') setMode('title-input');
    else if (id === 'date') setMode('date-input');
    else if (id === 'now') onConfirmDate(getNowFormatted().formattedText);
    else if (id === 'tag') setMode('tag-search');
    else if (id === 'reset_size') onResetSize();
    else if (id === 'reparse') onReparseLink();
    else if (id === 'ocr' || id === 'link') onRecognizeImage(id);
    else if (id === 'ungroup') onUngroup();
    else if (id === 'detach') onDetachFromBundle();
    else if (id === 'disconnect') onDisconnectParent();
  };

  useEffect(() => {
    if (isRightMouseDown || !rightHeldRef.current) return;
    rightHeldRef.current = false;
    if (!pieGestureMoved(centerPosition, currentPointerPosition)) return;
    if (target.kind === 'parent') {
      const color = parentColorAt(currentPointerPosition, center, scale);
      if (color) { onGroupColor(color); return; }
    }
    const item = pieSectorAt(currentPointerPosition, center, scale, RADIUS, slots);
    if (item) chooseItem(item);
    else onClose();
  }, [isRightMouseDown, currentPointerPosition, mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const label = (id: ItemId) => ({
    title: '标题', date: '时间', now: 'NOW', reset_size: '复位',
    reparse: '解析', ungroup: '解组', detach: '解组', disconnect: '断线',
    tag: '标签', ocr: '识字', link: '溯源',
  })[id];
  const description = (id: ItemId) => ({
    title: target.kind === 'card' ? '设置悬浮标题'
      : target.kind === 'bundle' ? '设置 Group 标题' : '重命名父物体',
    date: '设置或清除时间', now: '标记当前时间', reset_size: '恢复默认大小',
    reparse: '重新解析链接', ungroup: target.kind === 'parent' ? '解散父物体并保留关联对象' : '解散 Group 并保留成员',
    detach: '从当前 Group 中移出卡片', disconnect: '断开上级连线',
    tag: '搜索和管理标签', ocr: '识别图片文字', link: '识别图片原链接',
  })[id];

  return <div className="fixed inset-0 z-[10002] pointer-events-auto select-none"
    onContextMenu={(event) => event.preventDefault()}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    {mode === 'menu' ? <>
      <div className="absolute pointer-events-auto"
        style={{ left: center.x, top: center.y, width: EXTENT * 2, height: EXTENT * 2,
          transform: `translate(-50%, -50%) scale(${scale})` }}
        onMouseDown={(event) => event.stopPropagation()}>
        {target.kind === 'parent' && <GradientColorArc width={EXTENT * 2} height={EXTENT * 2}
          center={{ x: EXTENT, y: EXTENT }} onSelect={onGroupColor} />}
        {slots.map(({ id, angle, disabled }) => {
          const point = pieSlotPoint({ x: EXTENT, y: EXTENT }, RADIUS, angle);
          return <button key={id} type="button" data-pie-item={id} disabled={disabled}
            aria-label={description(id)} title={description(id)} onClick={() => chooseItem(id)}
            style={{ left: point.x - ITEM_SIZE / 2, top: point.y - ITEM_SIZE / 2 }}
            onMouseEnter={(event) => showHint(event.currentTarget,
              id === 'reset_size' ? 'Ctrl+O（选中后）' : id === 'ungroup' ? 'Ctrl+Shift+G（选中后）' : null)}
            onMouseLeave={hideHint}
            className={`absolute flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 px-1.5 text-center transition-colors duration-100 disabled:opacity-40 ${activeItem === id
              ? 'border-ink bg-paper text-ink' : 'border-ink bg-ink text-paper hover:bg-paper hover:text-ink'}`}>
            <span className="max-h-[2.4em] max-w-[58px] overflow-hidden break-all text-[11px] font-bold leading-[1.2] tracking-[0.02em]">
              {label(id)}
            </span>
          </button>;
        })}
        <div className="absolute flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-ink"
          style={{ left: EXTENT - 16, top: EXTENT - 16 }} aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-paper" />
        </div>
      </div>
      <MenuShortcutHint hint={hint} />
    </> : mode === 'date-input' ? (
      <PieDateInputModal reminder={reminder} position={center}
        onConfirm={onConfirmDate} onClearDate={() => onConfirmDate(null)}
        onBackToPie={() => setMode('menu')} onClose={onClose} />
    ) : mode === 'title-input' ? (
      <PieTitleInputModal
        initialTitle={target.kind === 'card'
          ? target.card.headerTitle || (target.card.type === 'text' ? target.card.title || '' : '')
          : target.group.title}
        originalTitle={card?.title} cardType={card?.type} subject={target.kind}
        position={center} onConfirm={onConfirmTitle}
        onBackToPie={() => setMode('menu')} onClose={onClose} />
    ) : (
      <PieTagModal tags={tags} allCards={allCards} position={center}
        onToggleTag={onToggleTag} onBackToPie={() => setMode('menu')} onClose={onClose} />
    )}
  </div>;
};
