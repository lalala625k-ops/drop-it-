import React, { memo, useState, useRef, useEffect } from 'react';
import { Card } from '../../types';
import { isFeishuUrl } from '../../utils/feishu';
import { SiteLogo } from '../SiteLogo';
import { textCardSize } from '../../utils/textCardSize';
import { imageRatioCache } from '../../utils/imageCardRatio';
import { MarkdownView } from '../MarkdownView';
import { getThumbnailUrl } from '../../utils/thumbnail';

interface CardBodyContentProps {
  card: Card;
  isSelected: boolean;
  onUpdate: (id: string, updates: Partial<Card>) => void;
  onTextEdit: (id: string, updates: Partial<Card>) => void;
  onTextEditStart: () => void;
  onTextEditingSize?: (size: { width: number; height: number } | null) => void;
  onWebLinkClick: (e: React.MouseEvent) => void;
  canvasImage?: boolean;
  highQualityImage?: boolean;
  crispRender?: boolean;
  contentScale: number;
}

const CardBodyContentInner: React.FC<CardBodyContentProps> = ({
  card,
  isSelected,
  onUpdate,
  onTextEdit,
  onTextEditStart,
  onTextEditingSize,
  onWebLinkClick,
  canvasImage = false,
  highQualityImage = false,
  crispRender = false,
  contentScale,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingText, setIsEditingText] = useState(!card.content);
  const [textEditorEpoch, setTextEditorEpoch] = useState(0);
  const [titleText, setTitleText] = useState(card.title || '');
  const [imgLoadError, setImgLoadError] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const isFeishu = card.type === 'web' && isFeishuUrl(card.url);

  const thumbSrc = getThumbnailUrl(card.image, card.thumbnail);
  const effectiveImageSrc = highQualityImage && card.image
    ? card.image
    : (!thumbFailed && thumbSrc) ? thumbSrc : card.image;

  const handleImageError = () => {
    if (!thumbFailed && thumbSrc && thumbSrc !== card.image) {
      setThumbFailed(true);
    } else {
      setImgLoadError(true);
    }
  };

  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const adjustedKeyRef = useRef<string | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const wasSelectedRef = useRef(isSelected);
  const textPointerRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const suppressTextClickRef = useRef(false);

  // Canvas dragging is handled by a window-level pointer state machine. Keep
  // a small local movement guard as well so the click fired after mouseup
  // cannot turn a drag of a selected text card into edit mode.
  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const pointer = textPointerRef.current;
      if (!pointer || pointer.dragged) return;
      pointer.dragged = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 3;
    };
    const handlePointerUp = () => {
      const pointer = textPointerRef.current;
      if (!pointer) return;
      suppressTextClickRef.current = pointer.dragged;
      textPointerRef.current = null;
    };
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, []);

  const startTextEditing = () => {
    if (card.type !== 'text') return;
    setIsEditingText(true);
    const size = textCardSize(card.content || '');
    onTextEditingSize?.({
      width: Math.max(card.width, size.width * contentScale),
      height: Math.max(card.height, (size.height + (card.tags?.length ? 32 : 0)) * contentScale),
    });
  };

  const handleTextChange = (content: string) => {
    if (card.type !== 'text') {
      onTextEdit(card.id, { content });
      return;
    }
    const size = textCardSize(content);
    const width = size.width * contentScale;
    const height = (size.height + (card.tags?.length ? 32 : 0)) * contentScale;
    onTextEdit(card.id, {
      content,
      ...(!card.sizeLocked ? { width, height } : {}),
    });
  };

  const finishTextEdit = (content: string) => {
    if (card.type !== 'text') return;
    const size = textCardSize(content);
    const width = size.width * contentScale;
    const height = (size.height + (card.tags?.length ? 32 : 0)) * contentScale;
    if (content === (card.content || '') && (card.sizeLocked
      || (card.width === width && card.height === height))) return;
    onTextEdit(card.id, { content,
      ...(!card.sizeLocked ? { width,
        height } : {}),
    });
  };

  const clearTextSelection = (input: HTMLTextAreaElement) => {
    const cursor = input.selectionEnd;
    input.setSelectionRange(cursor, cursor);
    window.getSelection()?.removeAllRanges();
  };

  useEffect(() => {
    if (!isSelected) {
      setIsEditingText(false);
      onTextEditingSize?.(null);
      if (textInputRef.current) {
        if (document.activeElement === textInputRef.current) textInputRef.current.blur();
        clearTextSelection(textInputRef.current);
        setTextEditorEpoch((epoch) => epoch + 1);
      }
      if (wasSelectedRef.current) window.getSelection()?.removeAllRanges();
    }
    wasSelectedRef.current = isSelected;
  }, [isSelected]);

  useEffect(() => {
    if (isEditingText && isSelected && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [isEditingText, isSelected]);

  useEffect(() => {
    setTitleText(card.title || '');
  }, [card.title]);

  useEffect(() => {
    setImgLoadError(false);
    setThumbFailed(false);
  }, [card.image, card.thumbnail]);

  useEffect(() => {
    if (isFeishu && card.image) {
      onUpdate(card.id, { image: '', height: card.sizeLocked ? card.height : 90 });
    }
  }, [isFeishu, card.id, card.image, card.height, card.sizeLocked, onUpdate]);

  useEffect(() => {
    if (!isSelected) {
      if (isEditingTitle) {
        setIsEditingTitle(false);
        if (titleText !== card.title) onUpdate(card.id, { title: titleText });
      }
    }
  }, [isSelected, isEditingTitle, titleText, card.title, card.id, onUpdate]);

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (titleText !== card.title) onUpdate(card.id, { title: titleText });
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setTitleText(card.title || '');
      setIsEditingTitle(false);
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      const ratio = img.naturalWidth / img.naturalHeight;
      imageRatioCache.set(card.id, ratio);
      if (card.image) imageRatioCache.set(card.image, ratio);

      if (card.sizeLocked) return;
      if (card.type === 'web') {
        const imgHeight = card.width / ratio;
        const footerH = footerRef.current?.offsetHeight || 68;
        const targetHeight = Math.round(imgHeight + footerH);
        const key = `${card.id}_${card.image}_${Math.round(card.width)}`;
        if (Math.abs(card.height - targetHeight) > 4 && adjustedKeyRef.current !== key) {
          adjustedKeyRef.current = key;
          onUpdate(card.id, { height: targetHeight });
        }
      } else if (card.type === 'image') {
        const titleH = titleRef.current?.offsetHeight || (card.title ? 24 : 0);
        const targetHeight = Math.round(card.width / ratio + titleH);
        const key = `${card.id}_${card.image}_${Math.round(card.width)}_${titleH}`;
        if (Math.abs(card.height - targetHeight) > 4 && adjustedKeyRef.current !== key) {
          adjustedKeyRef.current = key;
          onUpdate(card.id, { height: targetHeight });
        }
      }
    }
  };

  // Render Title and Link Footer for Web Cards
  const renderWebFooter = (isCompact = false) => (
    <div
      ref={footerRef}
      data-web-footer
      className={`bg-paper flex flex-col justify-center ${
        isCompact ? 'w-full flex-1 p-4 relative overflow-hidden' : 'flex-shrink-0 p-3.5 border-t border-ink/20'
      }`}
      style={{
        backgroundColor: card.color || undefined,
        color: card.textColor || undefined,
        borderTopColor: card.borderColor ? `${card.borderColor}33` : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <SiteLogo url={card.url} favicon={card.favicon} />
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={titleText}
            autoFocus
            onChange={(e) => setTitleText(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full bg-paper text-ink text-[13px] px-2 py-0.5 border border-ink rounded-[10px] outline-none font-retina"
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (isSelected) setIsEditingTitle(true);
            }}
            title={isSelected ? '双击可编辑网页标题' : undefined}
            className={`text-[15px] leading-[1.40] font-normal text-ink text-left line-clamp-2 select-none ${
              isSelected ? 'hover:underline cursor-text' : 'cursor-default'
            }`}
          >
            {card.title || card.url}
          </span>
        )}
      </div>

      {card.url && (
        <div className="mt-1.5 flex items-center">
          <button
            type="button"
            onClick={onWebLinkClick}
            title={isSelected ? `在新标签页打开: ${card.url}` : '请先单击高亮卡片'}
            className={`text-[11px] font-mono flex items-center gap-1 transition-colors truncate select-none text-left ${
              isSelected
                ? 'text-ink/80 hover:text-ink hover:underline cursor-pointer'
                : 'text-ink/40 cursor-default'
            }`}
          >
            <svg className="w-3 h-3 flex-shrink-0 text-ink/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span className="truncate">{card.url.replace(/^https?:\/\//, '')}</span>
          </button>
        </div>
      )}

      {card.tags && card.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.tags.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-ink bg-paper border border-ink/30 rounded-[10px] select-none hover:bg-ink hover:text-paper transition-colors"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  switch (card.type) {
    case 'image':
      return (
        <div className={`w-full h-full flex flex-col overflow-hidden relative rounded-none ${canvasImage ? 'bg-transparent' : 'bg-paper'} text-ink`}>
          {card.title && (
            <div
              ref={titleRef}
              data-card-title
              className="px-3.5 py-1 bg-stone/20 text-ink/70 text-[10px] font-mono uppercase tracking-[0.05em] truncate border-b border-ink/10 select-none flex-shrink-0"
            >
              {card.title}
            </div>
          )}
          <div className={`flex-1 flex items-center justify-center overflow-hidden relative min-h-0 ${canvasImage ? 'bg-transparent' : 'bg-paper'}`}>
            {!canvasImage && (
              <img
                src={effectiveImageSrc}
                alt={card.title || 'Image'}
                className="w-full h-full object-cover pointer-events-none"
                referrerPolicy="no-referrer"
                draggable={false}
                loading={crispRender ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={crispRender ? 'high' : 'auto'}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            )}
            {card.tags && card.tags.length > 0 && (
              <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 z-10 pointer-events-none">
                {card.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-ink bg-paper border border-ink/30 rounded-[10px]">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );

    case 'web':
      const showHeaderArea = !isFeishu && ((card.image && !imgLoadError) || card.isParsing);
      return (
        <div className="w-full h-full flex flex-col overflow-hidden rounded-none bg-paper text-ink select-none">
          {showHeaderArea ? (
            <>
              <div className="w-full flex-1 overflow-hidden relative flex items-center justify-center pointer-events-none min-h-0 bg-paper">
                {card.image && !imgLoadError && (
                  <img
                    src={effectiveImageSrc}
                    alt={card.title || 'Web preview'}
                    className="w-full h-full object-cover pointer-events-none"
                    referrerPolicy="no-referrer"
                    loading={crispRender ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={crispRender ? 'high' : 'auto'}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    draggable={false}
                  />
                )}
              </div>
              {renderWebFooter(false)}
            </>
          ) : (
            renderWebFooter(true)
          )}
        </div>
      );

    case 'text':
    default:
      const shouldShowEditor = isSelected && (isEditingText || !card.content);
      return (
        <div
          className="w-full h-full flex flex-col rounded-none overflow-hidden bg-paper text-ink"
          style={{
            backgroundColor: card.color || undefined,
            color: card.textColor || undefined,
          }}
        >
          <div
            className={`flex-1 p-3.5 flex flex-col overflow-hidden bg-paper ${isSelected ? 'pointer-events-auto' : 'pointer-events-none select-none'}`}
            style={{ backgroundColor: card.color || undefined }}
            onMouseDown={(event) => {
              if (event.button === 0 && isSelected) {
                textPointerRef.current = { x: event.clientX, y: event.clientY, dragged: false };
              }
            }}
            onClick={() => {
              if (suppressTextClickRef.current) {
                suppressTextClickRef.current = false;
                return;
              }
              if (isSelected && !isEditingText) {
                startTextEditing();
              }
            }}
          >
            {shouldShowEditor ? (
              <textarea
                key={textEditorEpoch}
                ref={textInputRef}
                data-text-editor
                value={card.content || ''}
                readOnly={!isSelected}
                tabIndex={isSelected ? 0 : -1}
                placeholder="空白便签（支持 Markdown）"
                onFocus={onTextEditStart}
                onChange={(event) => handleTextChange(event.target.value)}
                onBlur={(event) => {
                  clearTextSelection(event.target);
                  finishTextEdit(event.target.value);
                  setIsEditingText(false);
                  onTextEditingSize?.(null);
                  setTextEditorEpoch((epoch) => epoch + 1);
                }}
                onMouseDown={(event) => { if (isSelected && !event.ctrlKey && !event.metaKey) event.stopPropagation(); }}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setIsEditingText(false);
                    textInputRef.current?.blur();
                  }
                }}
                className="w-full h-full bg-transparent text-ink text-[15px] leading-[1.40] font-retina font-normal text-left resize-none border-0 outline-none p-0 m-0 placeholder:text-ink/40 placeholder:italic overflow-hidden select-text cursor-text"
                style={{ overflowWrap: 'anywhere', color: card.textColor || undefined }}
              />
            ) : (
              <div
                className="w-full h-full cursor-text overflow-hidden"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startTextEditing();
                }}
              >
                {card.content ? (
                  <MarkdownView content={card.content} color={card.textColor || undefined} />
                ) : (
                  <span className="italic opacity-40 text-[15px] leading-[1.40] font-retina select-none">空白便签（支持 Markdown）</span>
                )}
              </div>
            )}
          </div>
          {card.tags && card.tags.length > 0 && (
            <div
              className="px-3.5 py-1.5 flex flex-wrap gap-1.5 border-t border-ink/20 bg-paper flex-shrink-0 select-none"
              style={{
                backgroundColor: card.color || undefined,
                borderTopColor: card.borderColor ? `${card.borderColor}33` : undefined,
              }}
            >
              {card.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-ink bg-paper border border-ink/30 rounded-[10px] hover:bg-ink hover:text-paper transition-colors"
                  style={{
                    backgroundColor: card.color || undefined,
                    color: card.textColor || undefined,
                    borderColor: card.borderColor ? `${card.borderColor}4D` : undefined,
                  }}
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      );
  }
};

const positionFields = new Set<keyof Card>(['x', 'y', 'zIndex']);
function sameBodyCard(previous: Card, next: Card) {
  if (previous === next) return true;
  const keys = new Set<keyof Card>([
    ...Object.keys(previous) as (keyof Card)[],
    ...Object.keys(next) as (keyof Card)[],
  ]);
  for (const key of keys) {
    if (!positionFields.has(key) && previous[key] !== next[key]) return false;
  }
  return true;
}

// Position belongs to the outer wrapper. Moving an image should reuse the
// existing image/body DOM instead of reconciling its contents every frame.
export const CardBodyContent = memo(CardBodyContentInner, (previous, next) =>
  sameBodyCard(previous.card, next.card) &&
  previous.isSelected === next.isSelected && previous.canvasImage === next.canvasImage &&
  previous.highQualityImage === next.highQualityImage && previous.crispRender === next.crispRender &&
  previous.contentScale === next.contentScale && previous.onUpdate === next.onUpdate &&
  previous.onTextEdit === next.onTextEdit && previous.onTextEditStart === next.onTextEditStart &&
  previous.onTextEditingSize === next.onTextEditingSize && previous.onWebLinkClick === next.onWebLinkClick);
