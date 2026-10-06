import React, { useEffect, useState } from 'react';
import { Card, Group } from '../types';
import { Point, placePieMenu } from '../utils/pieMenuGeometry';
import { commonRadialItems, radialAction, radialBranch, RadialAction } from '../utils/radialMenuModel';
import { RadialCommandMenu } from './RadialCommandMenu';
import { CanvasCommand } from './CanvasCommandMenu';
import { PieTitleInputModal } from './PieTitleInputModal';
import { PieTagModal } from './PieTagModal';
import { GradientColorArc } from './GradientColorArc';
export type PieMenuTarget = { kind: 'card'; card: Card } | { kind: 'bundle' | 'parent'; group: Group };
export interface PieDateMenuProps {
  target: PieMenuTarget; allCards: Card[]; parentId?: string | null; centerPosition: Point;
  currentPointerPosition: Point; isRightMouseDown: boolean;
  onConfirmDate: (dateStr: string | null) => void; onConfirmTitle: (title: string | null) => void;
  onToggleTag: (tag: string) => void; onReparseLink: () => void;
  onRecognizeImage: (mode: 'ocr' | 'link') => void; onUngroup: () => void; onResetSize: () => void;
  onDetachFromBundle: () => void; onDisconnectParent: () => void; onGroupColor: (color: string) => void;
  onCommand: (command: CanvasCommand) => void; onClose: () => void;
  selectedCardIds?: Set<string>; onUniformWidth?: () => void;
}
export const PieDateMenu: React.FC<PieDateMenuProps> = ({ target, allCards, parentId, centerPosition,
  isRightMouseDown, onConfirmTitle, onToggleTag, onReparseLink, onRecognizeImage, onUngroup,
  onResetSize, onDetachFromBundle, onDisconnectParent, onGroupColor, onCommand, onClose,
  selectedCardIds, onUniformWidth }) => {
  const [mode, setMode] = useState<'menu' | 'title' | 'tag' | 'color'>('menu');
  const card = target.kind === 'card' ? target.card : undefined;
  const { center, scale } = placePieMenu(centerPosition, 170);
  const selectedCards = card && selectedCardIds?.has(card.id) && selectedCardIds.size > 1
    ? allCards.filter((item) => selectedCardIds.has(item.id)) : card ? [card] : [];
  const image = card?.type === 'image', web = card?.type === 'web' && !!card.url;
  const items = [radialAction('title', { description: card ? '设置悬浮标题'
    : target.kind === 'bundle' ? '设置 Group 标题' : '重命名原点' }), radialAction('tag'),
    ...(target.kind === 'parent' ? [radialAction('color')] : []),
    radialAction('cut'), radialAction('copy'), radialAction('paste'),
    radialBranch('group-menu', { group: !!card, ungroup: !card,
      detach: !!card?.bundleId, disconnect: !!(card?.groupId || parentId) }),
    ...(target.kind !== 'parent' ? [radialBranch('layout-menu', { 'uniform-width': selectedCards.length > 1 })] : []),
    ...(image || web ? [radialBranch('recognize-menu', { ocr: image && !card?.isParsing,
      link: image && !card?.isParsing, reparse: web && !card?.isParsing })] : []), ...commonRadialItems()];
  const choose = (id: RadialAction) => {
    if (id === 'title' || id === 'tag' || id === 'color') { setMode(id); return; }
    if (id === 'reset-size') onResetSize();
    else if (id === 'uniform-width') onUniformWidth?.();
    else if (id === 'reparse') onReparseLink();
    else if (id === 'ocr' || id === 'link') onRecognizeImage(id);
    else if (id === 'ungroup') onUngroup();
    else if (id === 'detach') onDetachFromBundle();
    else if (id === 'disconnect') onDisconnectParent();
    else onCommand(id);
    onClose();
  };
  useEffect(() => {
    if (mode === 'menu') return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [mode, onClose]);
  if (mode === 'menu') return <RadialCommandMenu position={centerPosition} items={items}
    rightMouseDown={isRightMouseDown} onAction={choose} onClose={onClose} />;
  const tags = card ? card.tags : target.kind !== 'card' ? target.group.tags : undefined;
  return <div className="fixed inset-0 z-[10002] pointer-events-auto select-none"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onContextMenu={(event) => event.preventDefault()}>
    {mode === 'title' ? <PieTitleInputModal initialTitle={card
      ? card.headerTitle || (card.type === 'text' ? card.title || '' : '')
      : target.kind !== 'card' ? target.group.title : ''}
      position={center} onConfirm={onConfirmTitle} onBackToPie={() => setMode('menu')} onClose={onClose} />
      : mode === 'tag' ? <PieTagModal tags={tags} allCards={allCards} position={center}
        onToggleTag={onToggleTag} onBackToPie={() => setMode('menu')} onClose={onClose} />
        : <div data-radial-colors className="absolute" style={{ left: center.x - 170 * scale,
          top: center.y - 170 * scale, width: 340, height: 340, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          <GradientColorArc width={340} height={340} center={{ x: 170, y: 170 }}
            onSelect={(color) => { onGroupColor(color); onClose(); }} />
          <button type="button" className="absolute left-[144px] top-[144px] h-[52px] w-[52px] rounded-full border border-ink bg-paper text-[11px]"
            onClick={() => setMode('menu')}>返回</button>
        </div>}
  </div>;
};
