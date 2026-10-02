import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../../types';

interface CardBodyContentProps {
  card: Card;
  isSelected: boolean;
  onUpdate: (id: string, updates: Partial<Card>) => void;
  onWebLinkClick: (e: React.MouseEvent) => void;
}

export const CardBodyContent: React.FC<CardBodyContentProps> = ({
  card,
  isSelected,
  onUpdate,
  onWebLinkClick,
}) => {
  const [isEditingText, setIsEditingText] = useState(false);
  const [textContent, setTextContent] = useState(card.content || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(card.title || '');
  const [imgLoadError, setImgLoadError] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const adjustedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setTextContent(card.content || '');
  }, [card.content]);

  useEffect(() => {
    setTitleText(card.title || '');
  }, [card.title]);

  useEffect(() => {
    setImgLoadError(false);
  }, [card.image]);

  useEffect(() => {
    if (isEditingText && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditingText]);

  useEffect(() => {
    if (!isSelected) {
      if (isEditingText) {
        setIsEditingText(false);
        if (textContent !== card.content) onUpdate(card.id, { content: textContent });
      }
      if (isEditingTitle) {
        setIsEditingTitle(false);
        if (titleText !== card.title) onUpdate(card.id, { title: titleText });
      }
    }
  }, [isSelected, isEditingText, isEditingTitle, textContent, titleText, card.content, card.title, card.id, onUpdate]);

  const handleTextBlur = () => {
    setIsEditingText(false);
    if (textContent !== card.content) onUpdate(card.id, { content: textContent });
  };

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
    if (card.sizeLocked) return;
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      const ratio = img.naturalWidth / img.naturalHeight;
      const imgHeight = card.width / ratio;
      const footerH = footerRef.current?.offsetHeight || 68;
      const targetHeight = Math.round(imgHeight + footerH);
      const key = `${card.id}_${card.image}_${Math.round(card.width)}`;
      if (Math.abs(card.height - targetHeight) > 4 && adjustedKeyRef.current !== key) {
        adjustedKeyRef.current = key;
        onUpdate(card.id, { height: targetHeight });
      }
    }
  };

  // Render Title and Link Footer for Web Cards
  const renderWebFooter = (isCompact = false) => (
    <div
      ref={footerRef}
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
        {card.favicon ? (
          <img
            src={card.favicon}
            alt="icon"
            className="w-4 h-4 flex-shrink-0 pointer-events-none"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
        ) : (
          <svg className="w-4 h-4 text-ink flex-shrink-0 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        )}
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
        <div className="w-full h-full flex flex-col overflow-hidden relative rounded-none bg-paper text-ink">
          {card.title && (
            <div className="px-3.5 py-1 bg-stone/20 text-ink/70 text-[10px] font-mono uppercase tracking-[0.05em] truncate border-b border-ink/10 select-none">
              {card.title}
            </div>
          )}
          <div className="flex-1 bg-stone/20 flex items-center justify-center overflow-hidden relative">
            <img
              src={card.image}
              alt={card.title || 'Image'}
              className="w-full h-full object-contain pointer-events-none"
              referrerPolicy="no-referrer"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
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
      const showHeaderArea = (card.image && !imgLoadError) || card.isParsing;
      return (
        <div className="w-full h-full flex flex-col overflow-hidden rounded-none bg-paper text-ink select-none">
          {showHeaderArea ? (
            <>
              <div className="w-full flex-1 bg-stone/20 overflow-hidden relative flex items-center justify-center pointer-events-none min-h-0">
                {card.image && !imgLoadError && (
                  <img
                    src={card.image}
                    alt={card.title || 'Web preview'}
                    className="w-full h-full object-contain pointer-events-none"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    onLoad={handleImageLoad}
                    onError={() => setImgLoadError(true)}
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
          >
            {isSelected && isEditingText ? (
              <textarea
                ref={textareaRef}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                onBlur={handleTextBlur}
                className="w-full h-full bg-paper text-ink text-[15px] leading-[1.40] outline-none resize-none font-retina font-normal selection:bg-stone selection:text-ink"
                style={{
                  cursor: 'text',
                  backgroundColor: card.color || undefined,
                  color: card.textColor || undefined,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                onClick={(e) => {
                  if (isSelected) {
                    e.stopPropagation();
                    setIsEditingText(true);
                  }
                }}
                className={`w-full h-full text-ink text-[15px] leading-[1.40] whitespace-pre-wrap font-retina font-normal text-left ${
                  isSelected ? 'overflow-y-auto cursor-text select-text' : 'overflow-hidden cursor-default'
                }`}
                style={{
                  wordBreak: 'break-word',
                  color: card.textColor || undefined,
                }}
              >
                {textContent || (
                  <span
                    className="text-ink/40 italic select-none"
                    style={{ color: card.textColor ? `${card.textColor}66` : undefined }}
                  >
                    {isSelected ? '点击输入文本...' : '空白便签'}
                  </span>
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
