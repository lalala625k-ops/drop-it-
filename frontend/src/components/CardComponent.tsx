import React, { useState, useRef, memo } from 'react';
import { Card } from '../types';
import { FloatingHeaderTitle } from './card/FloatingHeaderTitle';
import { CardResizeHandles, ResizeHandleDirection } from './card/CardResizeHandles';
import { CardHeaderBadges } from './card/CardHeaderBadges';
import { CardBodyContent } from './card/CardBodyContent';

export type { ResizeHandleDirection };

interface CardComponentProps {
  card: Card;
  isSelected: boolean;
  showSelectionControls: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (id: string, updates: Partial<Card>) => void;
  onDoubleClick: (card: Card) => void;
  onStartScale: (card: Card, startClientX: number, startWidth: number, startHeight: number) => void;
  onStartResize: (card: Card, handle: ResizeHandleDirection, e: React.MouseEvent) => void;
  zoom: number;
}

const CardComponentInner: React.FC<CardComponentProps> = ({
  card,
  isSelected,
  showSelectionControls,
  onSelect,
  onUpdate,
  onDoubleClick,
  onStartScale,
  onStartResize,
  zoom,
}) => {
  const [hoverTimeout, setHoverTimeout] = useState<number | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const wasSelectedAtPointerDownRef = useRef(false);
  const isTinyThumbnail = !!card.bundleId && Math.min(card.width, card.height) * zoom <= 20;
  const contentScale = card.contentScale ?? 1;

  const handleMouseDown = (e: React.MouseEvent) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    wasSelectedAtPointerDownRef.current = isSelected;

    // Middle click: prevent browser autoscroll and allow bubbling to canvas for panning
    if (e.button === 1) {
      e.preventDefault();
      return;
    }

    // Ctrl + Alt + Left click: proportional scale
    if (isSelected && e.ctrlKey && e.altKey && e.button === 0) {
      e.stopPropagation();
      e.preventDefault();
      onStartScale(card, e.clientX, card.width, card.height);
      return;
    }

    if (e.button === 0) {
      onSelect(e);
    }
  };

  const handleMouseEnter = () => {
    if (card.type === 'web' && card.description && isSelected) {
      const timer = window.setTimeout(() => setShowTooltip(true), 300);
      setHoverTimeout(timer);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setShowTooltip(false);
  };

  const handleWebLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Only open website when the card was already selected before pointer down
    if (!wasSelectedAtPointerDownRef.current || !isSelected) return;
    if (card.url) {
      window.open(card.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      data-card-id={card.id}
      data-selected={isSelected ? 'true' : 'false'}
      title={isTinyThumbnail ? card.headerTitle || card.title || card.content?.slice(0, 80) || '便签缩略图' : undefined}
      className={`absolute rounded-none select-none group bg-paper text-ink transition-colors ${
        showSelectionControls ? 'border-2 border-ink z-30' : 'border border-ink hover:border-2'
      }`}
      style={{
        transform: `translate(${card.x}px, ${card.y}px)`,
        width: `${card.width}px`,
        height: `${card.height}px`,
        zIndex: card.zIndex,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(card);
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isTinyThumbnail ? (
        <div className="h-full w-full overflow-hidden bg-paper pointer-events-none">
          {card.image && card.type !== 'text' ? (
            <img src={card.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" draggable={false} />
          ) : (
            <div className="flex h-full w-full flex-col justify-center gap-[2px] p-[2px]">
              <span className="h-[2px] w-3/4 bg-ink" />
              <span className="h-[2px] w-full bg-ink/50" />
              <span className="h-[2px] w-2/3 bg-ink/50" />
            </div>
          )}
        </div>
      ) : (
        <div className="absolute left-0 top-0"
          style={{ width: card.width / contentScale, height: card.height / contentScale,
            transform: `scale(${contentScale})`, transformOrigin: 'top left' }}>
          <FloatingHeaderTitle card={card} isSelected={isSelected} onSelect={onSelect} onUpdate={onUpdate} />
          <CardBodyContent card={card} isSelected={isSelected} onUpdate={onUpdate}
            onWebLinkClick={handleWebLinkClick} />
          {card.isParsing && (card.type === 'web' || card.type === 'image') && (
            <div role="status" aria-live="polite"
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-paper/90 text-ink pointer-events-none">
              <div aria-hidden="true" className="w-8 h-8 rounded-full border-2 border-ash border-t-ink animate-spin" />
              <span className="text-[11px] font-bold tracking-[0.05em] text-center px-2">
                {card.type === 'web' ? '标题和头图解析中…' : '图片文字识别中…'}
              </span>
            </div>
          )}
          <CardHeaderBadges card={card} />
        </div>
      )}

      {!isTinyThumbnail && showSelectionControls && <CardResizeHandles
        card={card}
        isSelected={isSelected}
        onStartResize={onStartResize}
      />}

      {!isTinyThumbnail && showTooltip && card.type === 'web' && card.description && (
        <div
          className="absolute left-0 top-full mt-2 w-72 p-3 bg-paper text-ink text-[13px] leading-[1.40] rounded-none border border-ash z-50 pointer-events-none animate-in fade-in duration-150"
          style={{ wordBreak: 'break-word' }}
        >
          {card.description}
        </div>
      )}
    </div>
  );
};

export const CardComponent = memo(CardComponentInner);
