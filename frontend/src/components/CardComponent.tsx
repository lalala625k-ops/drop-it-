import React, { useState, useRef, useCallback, memo } from 'react';
import { Card } from '../types';
import { FloatingHeaderTitle } from './card/FloatingHeaderTitle';
import { CardResizeHandles, ResizeHandleDirection } from './card/CardResizeHandles';
import { CardHeaderBadges } from './card/CardHeaderBadges';
import { CardBodyContent } from './card/CardBodyContent';
import { isFeishuUrl } from '../utils/feishu';
import { getThumbnailUrl } from '../utils/thumbnail';

export type { ResizeHandleDirection };

interface CardComponentProps {
  card: Card;
  isSelected: boolean;
  isDragging?: boolean;
  showSelectionControls: boolean;
  parentHighlighted?: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (id: string, updates: Partial<Card>) => void;
  onTextEdit: (id: string, updates: Partial<Card>) => void;
  onTextEditStart: () => void;
  onDoubleClick: (card: Card) => void;
  onStartScale: (card: Card, startClientX: number, startWidth: number, startHeight: number) => void;
  onStartResize: (card: Card, handle: ResizeHandleDirection, e: React.MouseEvent) => void;
  isTinyThumbnail?: boolean;
  useCanvasImage?: boolean;
  highQualityImage?: boolean;
  crispRender?: boolean;
  contentScale: number;
}

const CardComponentInner: React.FC<CardComponentProps> = ({
  card,
  isSelected,
  isDragging = false,
  showSelectionControls,
  parentHighlighted = false,
  onSelect,
  onUpdate,
  onTextEdit,
  onTextEditStart,
  onDoubleClick,
  onStartScale,
  onStartResize,
  isTinyThumbnail = false,
  useCanvasImage = false,
  highQualityImage = false,
  crispRender = false,
  contentScale,
}) => {
  const [hoverTimeout, setHoverTimeout] = useState<number | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [editingTextSize, setEditingTextSize] = useState<{ width: number; height: number } | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const wasSelectedAtPointerDownRef = useRef(false);

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

    if ((e.ctrlKey || e.metaKey) && e.button === 0) e.preventDefault();

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

  const handleWebLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Only open website when the card was already selected before pointer down
    if (!wasSelectedAtPointerDownRef.current || !isSelected) return;
    if (card.url) {
      window.open(card.url, '_blank', 'noopener,noreferrer');
    }
  }, [isSelected, card.url]);

  const displayCard = editingTextSize ? { ...card, ...editingTextSize } : card;

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
        willChange: isDragging ? 'transform' : undefined,
        width: `${displayCard.width}px`,
        height: `${displayCard.height}px`,
        zIndex: card.zIndex,
        backgroundColor: useCanvasImage ? 'transparent' : undefined,
        outline: parentHighlighted ? '3px solid #1d1d1d' : undefined,
        outlineOffset: parentHighlighted ? '2px' : undefined,
      } as React.CSSProperties}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (card.type === 'text') {
          (e.currentTarget.querySelector('[data-text-editor]') as HTMLTextAreaElement | null)?.focus();
          return;
        }
        onDoubleClick(card);
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isTinyThumbnail ? (
        <div className={`h-full w-full overflow-hidden ${useCanvasImage ? 'bg-transparent' : 'bg-paper'} pointer-events-none`}>
          {card.image && card.type !== 'text' && !isFeishuUrl(card.url) && !useCanvasImage ? (
            <img
              src={(highQualityImage ? card.image : getThumbnailUrl(card.image, card.thumbnail)) || card.image}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
              draggable={false}
              loading={crispRender ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={crispRender ? 'high' : 'auto'}
            />
          ) : !useCanvasImage ? (
            <div className="flex h-full w-full flex-col justify-center gap-[2px] p-[2px]">
              <span className="h-[2px] w-3/4 bg-ink" />
              <span className="h-[2px] w-full bg-ink/50" />
              <span className="h-[2px] w-2/3 bg-ink/50" />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="absolute left-0 top-0"
          style={{ width: displayCard.width / contentScale, height: displayCard.height / contentScale,
            transform: `scale(${contentScale})`, transformOrigin: 'top left' }}>
          <FloatingHeaderTitle card={card} contentScale={contentScale} isSelected={isSelected} onSelect={onSelect} onUpdate={onUpdate} />
          <CardBodyContent card={displayCard} isSelected={isSelected} canvasImage={useCanvasImage}
            highQualityImage={highQualityImage} crispRender={crispRender} onUpdate={onUpdate}
            onTextEdit={onTextEdit} onTextEditStart={onTextEditStart}
            onTextEditingSize={setEditingTextSize}
            onWebLinkClick={handleWebLinkClick} contentScale={contentScale} />
          {card.isParsing && (card.type === 'web' || card.type === 'image') && (
            <div role="status" aria-live="polite"
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-paper/90 text-ink pointer-events-none">
              <div aria-hidden="true" className="w-8 h-8 rounded-full border-2 border-ash border-t-ink animate-spin" />
              <span className="text-[11px] font-bold tracking-[0.05em] text-center px-2">
                {card.type === 'web' ? isFeishuUrl(card.url) ? '标题解析中…' : '标题和头图解析中…' : '图片文字识别中…'}
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

export const CardComponent = memo(CardComponentInner, (previous, next) =>
  previous.card === next.card &&
  previous.isSelected === next.isSelected &&
  previous.isDragging === next.isDragging &&
  previous.showSelectionControls === next.showSelectionControls &&
  previous.parentHighlighted === next.parentHighlighted &&
  previous.contentScale === next.contentScale &&
  previous.isTinyThumbnail === next.isTinyThumbnail &&
  previous.useCanvasImage === next.useCanvasImage &&
  previous.highQualityImage === next.highQualityImage &&
  previous.crispRender === next.crispRender);
