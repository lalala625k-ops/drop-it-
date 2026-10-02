import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '../types';
import { getAllTagsWithCounts } from '../utils/tagUtils';

interface PieTagModalProps {
  card: Card;
  allCards: Card[];
  position: { x: number; y: number };
  onToggleTag: (tag: string) => void;
  onBackToPie: () => void;
  onClose: () => void;
}

export const PieTagModal: React.FC<PieTagModalProps> = ({
  card,
  allCards,
  position,
  onToggleTag,
  onBackToPie,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const currentTags = useMemo(() => {
    return Array.isArray(card.tags) ? card.tags : [];
  }, [card.tags]);

  const allTagsWithCounts = useMemo(() => {
    return getAllTagsWithCounts(allCards);
  }, [allCards]);

  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allTagsWithCounts;
    return allTagsWithCounts.filter((item) => item.tag.toLowerCase().includes(q));
  }, [allTagsWithCounts, searchQuery]);

  const isExactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allTagsWithCounts.some((item) => item.tag.toLowerCase() === q);
  }, [allTagsWithCounts, searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchQuery.trim();
      if (q) {
        onToggleTag(q);
        setSearchQuery('');
      } else if (filteredTags.length > 0) {
        onToggleTag(filteredTags[0].tag);
      }
    }
  };

  const clampedX = Math.max(160, Math.min(window.innerWidth - 180, position.x));
  const clampedY = Math.max(120, Math.min(window.innerHeight - 200, position.y));

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 z-[10003] w-80 bg-paper border border-ash shadow-none rounded-none p-4 flex flex-col gap-3 select-none animate-in fade-in zoom-in-95 duration-100 text-ink"
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ash pb-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onBackToPie}
            title="返回轮盘菜单"
            className="p-1 text-ink/70 hover:text-ink hover:bg-stone/50 transition-colors rounded-[10px]"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink">搜索与管理标签</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink/60 hover:text-ink p-1 text-xs rounded-[10px]"
        >
          ✕
        </button>
      </div>

      {/* Search & Create Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索或输入新标签按回车..."
          className="w-full bg-paper text-ink text-[13px] px-3 py-1.5 border border-ink/40 focus:border-ink rounded-[10px] outline-none font-retina"
        />
        {searchQuery.trim() && !isExactMatch && (
          <button
            type="button"
            onClick={() => {
              onToggleTag(searchQuery.trim());
              setSearchQuery('');
            }}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink border border-ink/40 hover:bg-ink hover:text-paper transition-colors rounded-[10px]"
          >
            <span>+ 创建新标签「{searchQuery.trim()}」 (Enter)</span>
          </button>
        )}
      </div>

      {/* Current Card Tags */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink/60">当前已添加标签:</span>
        {currentTags.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {currentTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                title="点击移除标签"
                className="group flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] bg-stone text-ink border border-ash hover:border-ink rounded-[10px] transition-colors"
              >
                <span>#{tag}</span>
                <span className="text-[10px] text-ink/60 group-hover:text-ink">×</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-ink/40 italic">暂无标签</span>
        )}
      </div>

      {/* Historical & Available Tags */}
      <div className="flex flex-col gap-1.5 border-t border-ash pt-2">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.05em] text-ink/60">
          <span>画布标签库 ({allTagsWithCounts.length}):</span>
          {searchQuery && <span>匹配 {filteredTags.length} 个</span>}
        </div>
        <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
          {filteredTags.length > 0 ? (
            filteredTags.map((item) => {
              const isSelected = currentTags.includes(item.tag);
              return (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => onToggleTag(item.tag)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] rounded-[10px] transition-colors ${
                    isSelected
                      ? 'bg-ink text-paper border border-ink'
                      : 'bg-paper text-ink border border-ash hover:border-ink'
                  }`}
                >
                  <span>{isSelected ? '✓ ' : ''}#{item.tag}</span>
                  <span className={`text-[10px] ${isSelected ? 'text-paper/70' : 'text-ink/50'}`}>({item.count})</span>
                </button>
              );
            })
          ) : (
            <span className="text-[11px] text-ink/50">无匹配历史标签</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-ash pt-2 mt-1">
        <button
          type="button"
          onClick={onBackToPie}
          className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink/70 hover:text-ink transition-colors"
        >
          ← 返回轮盘
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink border border-ink/40 hover:bg-ink hover:text-paper transition-colors rounded-[10px]"
        >
          完成
        </button>
      </div>
    </div>
  );
};
