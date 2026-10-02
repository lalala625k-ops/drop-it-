import React, { useState, useEffect, useRef } from 'react';

interface PieTitleInputModalProps {
  initialTitle: string;
  originalTitle?: string;
  cardType?: string;
  subject?: 'card' | 'bundle' | 'parent';
  position: { x: number; y: number };
  onConfirm: (title: string | null) => void;
  onBackToPie: () => void;
  onClose: () => void;
}

export const PieTitleInputModal: React.FC<PieTitleInputModalProps> = ({
  initialTitle,
  originalTitle,
  cardType,
  subject = 'card',
  position,
  onConfirm,
  onBackToPie,
  onClose,
}) => {
  const isCard = subject === 'card';
  const heading = isCard ? '设置便签顶部标题' : subject === 'bundle' ? '设置 Group 标题' : '重命名父物体';
  const fieldLabel = isCard ? '输入卡片标题 (# 一级 · ## 二级)' : '输入名称';
  const saveLabel = isCard ? '保存顶部标题 (Enter)' : '保存名称 (Enter)';
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 50);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(title.trim() || null);
    }
  };

  const handleClear = () => {
    onConfirm(null);
  };

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto bg-paper border border-ash shadow-none text-ink w-80 p-4 select-none animate-in fade-in zoom-in-95 duration-100 rounded-none"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-ash">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-ink" />
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink">{heading}</span>
        </div>
        <button
          type="button"
          onClick={onBackToPie}
          className="text-[10px] font-bold uppercase tracking-[0.05em] text-ink/70 hover:text-ink px-2 py-0.5 rounded-[10px] border border-ash hover:border-ink transition-colors"
        >
          返回
        </button>
      </div>

      {/* Input */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.05em] text-ink/60 mb-1.5">
            <span>{fieldLabel}</span>
            {initialTitle && (
              <span className="text-ink/60 font-mono truncate max-w-[120px]" title={initialTitle}>
                当前: {initialTitle}
              </span>
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isCard ? '如: # 待办清单 或 ## 项目灵感...' : '输入名称...'}
            className="w-full bg-paper text-ink text-[13px] px-3 py-1.5 outline-none font-retina rounded-[10px] transition-colors border border-ink/40 focus:border-ink"
          />
          {subject !== 'parent' && <div className="mt-1 text-[10px] text-ink/50 font-mono">
            提示: # + 空格为一级标题，## + 空格为二级标题
          </div>}
          {originalTitle && cardType === 'web' && (
            <div className="mt-1.5 text-[10px] font-mono text-ink/50 truncate" title={originalTitle}>
              原网页标题: {originalTitle} (将完整保留，不被替换)
            </div>
          )}
          {originalTitle && cardType === 'image' && (
            <div className="mt-1.5 text-[10px] font-mono text-ink/50 truncate" title={originalTitle}>
              原图片标题: {originalTitle} (将完整保留，不被替换)
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {initialTitle && (
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink/80 hover:text-ink border border-ash hover:border-ink transition-colors rounded-[10px]"
              >
                {isCard ? '清除顶部标题' : '清除名称'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink/70 hover:text-ink border border-ash hover:border-ink transition-colors rounded-[10px]"
            >
              取消 (ESC)
            </button>
            <button
              type="button"
              onClick={() => onConfirm(title.trim() || null)}
              className="px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] rounded-[10px] transition-all bg-ink text-paper border border-ink hover:bg-ink/90 cursor-pointer"
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
