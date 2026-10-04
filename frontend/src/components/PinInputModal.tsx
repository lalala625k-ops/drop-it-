import React, { useState, useEffect, useRef } from 'react';
import { CanvasPin } from '../hooks/useCanvasPins';

interface PinInputModalProps {
  prompt: {
    screen: { x: number; y: number };
    world: { x: number; y: number };
  };
  existingPins: CanvasPin[];
  onConfirm: (index: number) => void;
  onClose: () => void;
}

export const PinInputModal: React.FC<PinInputModalProps> = ({
  prompt,
  existingPins,
  onConfirm,
  onClose,
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const existingIndices = new Set(existingPins.map((p) => p.index));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSelect = (num: number) => {
    if (num >= 1 && num <= 8) {
      onConfirm(num);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    // Direct single digit press 1-8
    if (/^[1-8]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      handleSelect(parseInt(e.key, 10));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = parseInt(inputValue.trim(), 10);
      if (val >= 1 && val <= 8) {
        handleSelect(val);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10003] flex items-center justify-center bg-ink/20 backdrop-blur-[2px] animate-in fade-in duration-100 select-none"
      onMouseDown={onClose}
    >
      <div
        className="w-[320px] bg-paper border-2 border-ink shadow-sharp p-4 flex flex-col gap-3 font-retina animate-in zoom-in-95 duration-150"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/15 pb-2">
          <div className="flex items-center gap-1.5 font-bold text-base text-ink">
            <span className="text-lg">📌</span>
            <span>在当前位置打图钉</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-ink/60 hover:text-ink hover:bg-ink/10 transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-ink/70 leading-relaxed">
          点击或输入数字键 <span className="font-bold font-mono text-ink">1 ~ 8</span>，之后随时按 <span className="font-bold font-mono text-ink">Ctrl + 对应数字</span> 即可平滑瞬移至此处：
        </p>

        {/* 1 - 8 quick selection buttons */}
        <div className="grid grid-cols-4 gap-2 my-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
            const isTaken = existingIndices.has(num);
            return (
              <button
                key={num}
                type="button"
                onClick={() => handleSelect(num)}
                title={isTaken ? `图钉 ${num} 已存在（点击将覆盖更新到此处）` : `设置图钉 ${num}`}
                className={`relative h-11 border border-ink flex flex-col items-center justify-center font-bold text-base transition-all cursor-pointer ${
                  isTaken
                    ? 'bg-paper text-ink hover:bg-ink hover:text-paper hover:scale-105'
                    : 'bg-paper text-ink/80 hover:bg-ink hover:text-paper hover:scale-105'
                }`}
              >
                <span>{num}</span>
                {isTaken && (
                  <span className="absolute bottom-0.5 right-1 w-1.5 h-1.5 rounded-full bg-ink group-hover:bg-paper" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-1">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={inputValue}
            onChange={(e) => {
              const val = e.target.value.replace(/[^1-8]/g, '');
              setInputValue(val);
              if (val) handleSelect(parseInt(val, 10));
            }}
            onKeyDown={handleKeyDown}
            placeholder="按 1~8..."
            className="flex-1 h-9 px-3 bg-paper border border-ink text-center font-bold text-base outline-none focus:border-2"
          />
          <button
            type="button"
            onClick={() => {
              const val = parseInt(inputValue.trim(), 10);
              if (val >= 1 && val <= 8) handleSelect(val);
            }}
            disabled={!inputValue || parseInt(inputValue, 10) < 1 || parseInt(inputValue, 10) > 8}
            className="h-9 px-4 bg-ink text-paper font-bold text-sm border border-ink disabled:opacity-40 cursor-pointer hover:opacity-90 active:scale-95 transition-all"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};
