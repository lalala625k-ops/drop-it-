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
  position,
  onConfirm,
  onClose,
}) => {
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

  const computedWidth = (() => {
    let charWidth = 0;
    for (let i = 0; i < title.length; i++) {
      charWidth += title.charCodeAt(i) > 255 ? 13 : 8;
    }
    return Math.min(460, Math.max(240, charWidth + 56));
  })();

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto bg-paper border border-ink p-2.5 shadow-md select-none rounded-[10px] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${computedWidth}px` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-paper text-ink text-[13px] px-2.5 py-1.5 outline-none font-retina rounded-[8px] border border-ink/40 focus:border-ink transition-colors"
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="取消"
          className="w-7 h-7 flex items-center justify-center rounded-[8px] border border-ink/40 text-ink/70 hover:border-ink hover:text-ink hover:bg-stone/20 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onConfirm(title.trim() || null)}
          aria-label="保存"
          className="w-7 h-7 flex items-center justify-center rounded-[8px] bg-ink text-paper hover:bg-ink/80 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};
