import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '../types';
import { parseMarkdownHeading } from '../utils/headingUtils';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: Card[];
  onSelectCard: (card: Card) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  cards,
  onSelectCard,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return cards.filter((card) => {
      const parsedHeading = parseMarkdownHeading(card.headerTitle);
      const titleMatch =
        card.title?.toLowerCase().includes(q) ||
        card.headerTitle?.toLowerCase().includes(q) ||
        (parsedHeading.cleanText && parsedHeading.cleanText.toLowerCase().includes(q));
      const contentMatch = card.content?.toLowerCase().includes(q);
      const urlMatch = card.url?.toLowerCase().includes(q) || card.fileSource?.path.toLowerCase().includes(q);
      const descMatch = card.description?.toLowerCase().includes(q);
      const cleanQ = q.replace(/^#/, '');
      const tagMatch = card.tags?.some((t) => t.toLowerCase().includes(cleanQ));
      return Boolean(titleMatch || contentMatch || urlMatch || descMatch || tagMatch);
    });
  }, [cards, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCards]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' && filteredCards.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredCards.length);
    } else if (e.key === 'ArrowUp' && filteredCards.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCards.length) % Math.max(1, filteredCards.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCards[selectedIndex]) {
        onSelectCard(filteredCards[selectedIndex]);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-start justify-center pt-24 bg-ink/30 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-paper border border-ash rounded-none flex flex-col overflow-hidden text-ink shadow-none animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 bg-paper">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索便签"
            aria-label="搜索便签"
            className="w-full bg-transparent text-[15px] leading-[1.40] text-ink placeholder-ink/40 outline-none font-retina"
          />
        </div>

        {filteredCards.length > 0 && (
          <div className="max-h-80 overflow-y-auto border-t border-ash divide-y divide-ash/40">
            {filteredCards.map((card, idx) => {
              const isSelected = idx === selectedIndex;
              const parsedHeading = parseMarkdownHeading(card.headerTitle);
              const cleanHeader = parsedHeading.cleanText || card.headerTitle;
              const displayTitle = cleanHeader || card.title || card.content?.trim().split('\n')[0] || card.description || card.url || '未命名便签';

              return (
                <div
                  key={card.id}
                  onClick={() => {
                    onSelectCard(card);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer select-none ${
                    isSelected ? 'bg-stone/70 text-ink' : 'hover:bg-stone/30 text-ink'
                  }`}
                >
                  {card.image && (
                    <img src={card.image} alt="" className="w-8 h-8 flex-shrink-0 object-cover pointer-events-none" referrerPolicy="no-referrer" />
                  )}
                  <span className="min-w-0 truncate text-[15px] leading-[1.40] font-retina text-left">{displayTitle}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
