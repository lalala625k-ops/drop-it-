import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card } from '../../types';
import { parseMarkdownHeading } from '../../utils/headingUtils';

interface FloatingHeaderTitleProps {
  card: Card;
  contentScale: number;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (id: string, updates: Partial<Card>) => void;
}

export const FloatingHeaderTitle: React.FC<FloatingHeaderTitleProps> = ({
  card,
  contentScale,
  isSelected,
  onSelect,
  onUpdate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [headerTitleText, setHeaderTitleText] = useState(card.headerTitle || '');
  const headerTitleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHeaderTitleText(card.headerTitle || '');
  }, [card.headerTitle]);

  useEffect(() => {
    if (isEditing && headerTitleInputRef.current) {
      headerTitleInputRef.current.focus();
      headerTitleInputRef.current.select();
    }
  }, [isEditing]);

  const displayHeaderTitle = card.headerTitle || (card.type === 'text' ? card.title : undefined);
  const parsedDisplay = useMemo(() => parseMarkdownHeading(displayHeaderTitle), [displayHeaderTitle]);

  useEffect(() => {
    if (!isSelected && isEditing) {
      setIsEditing(false);
      const clean = headerTitleText.trim();
      const parsed = parseMarkdownHeading(clean);
      const finalToSave = parsed.cleanText ? clean : undefined;
      if (finalToSave !== (card.headerTitle || undefined)) {
        onUpdate(card.id, { headerTitle: finalToSave });
      }
    }
  }, [isSelected, isEditing, headerTitleText, card.headerTitle, card.id, onUpdate]);

  const handleHeaderTitleBlur = () => {
    setIsEditing(false);
    const clean = headerTitleText.trim();
    const parsed = parseMarkdownHeading(clean);
    const finalToSave = parsed.cleanText ? clean : undefined;
    if (finalToSave !== (card.headerTitle || undefined)) {
      onUpdate(card.id, { headerTitle: finalToSave });
    }
  };

  const handleHeaderTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleHeaderTitleBlur();
    } else if (e.key === 'Escape') {
      setHeaderTitleText(card.headerTitle || '');
      setIsEditing(false);
    }
  };

  // Determine heading style for editing state (real-time feedback as user types # or ##)
  const parsedEditing = useMemo(() => parseMarkdownHeading(headerTitleText), [headerTitleText]);
  const isEditingLevel2 = parsedEditing.hasMarkdownPrefix && parsedEditing.level === 2;

  // Don't render anything if there's no title to display and not in edit mode
  if (!parsedDisplay.cleanText && !isEditing) return null;

  const isLevel2 = parsedDisplay.level === 2;

  return (
    <div
      className={`absolute bottom-full left-0 w-full pointer-events-auto select-none z-10 flex flex-col justify-end ${
        (isEditing ? isEditingLevel2 : isLevel2) ? 'mb-1' : 'mb-1.5'
      }`}
      style={{ width: `${card.width / contentScale}px` }}
    >
      {isEditing ? (
        <input
          ref={headerTitleInputRef}
          type="text"
          value={headerTitleText}
          onChange={(e) => setHeaderTitleText(e.target.value)}
          onBlur={handleHeaderTitleBlur}
          onKeyDown={handleHeaderTitleKeyDown}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full bg-transparent tracking-tight outline-none border-b-2 border-ink py-0 font-retina transition-all"
          style={{
            fontSize: isEditingLevel2 ? '18px' : '24px',
            lineHeight: isEditingLevel2 ? 1.2 : 1.15,
            fontWeight: isEditingLevel2 ? 700 : 900,
            letterSpacing: isEditingLevel2 ? '-0.02em' : '-0.025em',
            color: card.textColor || '#1d1d1d',
            borderColor: card.borderColor || '#1d1d1d',
          }}
          placeholder="输入标题 (如 # 一级, ## 二级)..."
        />
      ) : (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            onSelect(e);
            setIsEditing(true);
          }}
          title={parsedDisplay.cleanText}
          className={`w-full tracking-tight select-none cursor-text break-words line-clamp-2 font-retina transition-all ${
            isLevel2
              ? 'text-[18px] font-bold leading-[1.2]'
              : 'text-[24px] font-black leading-[1.15]'
          }`}
          style={{
            letterSpacing: isLevel2 ? '-0.02em' : '-0.025em',
            color: card.textColor || '#1d1d1d',
          }}
        >
          {parsedDisplay.cleanText}
        </div>
      )}
    </div>
  );
};
