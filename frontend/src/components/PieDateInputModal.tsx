import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../types';
import { parseReminderDate, ParsedDateResult } from '../utils/dateParser';

interface PieDateInputModalProps {
  card: Card;
  position: { x: number; y: number };
  onConfirm: (dateStr: string) => void;
  onClearDate: () => void;
  onBackToPie: () => void;
  onClose: () => void;
}

export const PieDateInputModal: React.FC<PieDateInputModalProps> = ({
  card,
  position,
  onConfirm,
  onClearDate,
  onBackToPie,
  onClose,
}) => {
  const [dateInput, setDateInput] = useState(card.reminder || '');
  const [parseResult, setParseResult] = useState<ParsedDateResult>({
    isValid: false,
    parsedDate: null,
    formattedText: '',
    summaryText: '',
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const res = parseReminderDate(dateInput);
    setParseResult(res);
  }, [dateInput]);

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
      if (parseResult.isValid && parseResult.formattedText) {
        e.preventDefault();
        onConfirm(parseResult.formattedText);
      }
    }
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
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink">标记卡片日期</span>
        </div>
        <button
          type="button"
          onClick={onBackToPie}
          className="text-[10px] font-bold uppercase tracking-[0.05em] text-ink/70 hover:text-ink px-2 py-0.5 rounded-[10px] border border-ash hover:border-ink transition-colors"
        >
          返回
        </button>
      </div>

      {/* Input Box */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.05em] text-ink/60 mb-1.5">
            <span>输入年月日 (缺省年默认今年)</span>
            {card.reminder && (
              <span className="text-ink/60 font-mono truncate max-w-[120px]" title={card.reminder}>
                当前: {card.reminder}
              </span>
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="如: 06/26, 6-26, 0626, 2026/06/26..."
            className={`w-full bg-paper text-ink text-[13px] px-3 py-1.5 outline-none font-retina rounded-[10px] transition-colors border ${
              parseResult.isValid
                ? 'border-2 border-ink'
                : 'border-ash text-ink focus:border-ink/60'
            }`}
          />
        </div>

        {/* Smart Recognition Live Status */}
        <div
          className={`text-[12px] px-3 py-2 border transition-all rounded-[10px] font-retina ${
            parseResult.isValid
              ? 'bg-stone/50 border-ink text-ink'
              : 'bg-stone/20 border-ash text-ink/50'
          }`}
        >
          {parseResult.isValid ? (
            <div className="flex items-center gap-1.5 font-retina">
              <svg className="w-3.5 h-3.5 text-ink flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-bold">识别为: {parseResult.summaryText}</span>
            </div>
          ) : dateInput.trim() ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ash flex-shrink-0" />
              <span>日期不完整或格式不合法</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-ink/50">
              <span className="w-1.5 h-1.5 rounded-full bg-ash flex-shrink-0" />
              <span>支持 06/26, 6/26, 0626, 2026-06-26, 今天, 明天...</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {card.reminder && (
              <button
                type="button"
                onClick={onClearDate}
                className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink/80 hover:text-ink border border-ash hover:border-ink transition-colors rounded-[10px]"
              >
                清除日期
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
              disabled={!parseResult.isValid}
              onClick={() => {
                if (parseResult.isValid && parseResult.formattedText) {
                  onConfirm(parseResult.formattedText);
                }
              }}
              className={`px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] rounded-[10px] transition-all ${
                parseResult.isValid
                  ? 'bg-ink text-paper border border-ink hover:bg-ink/90 cursor-pointer'
                  : 'bg-stone/40 text-ink/30 border border-ash cursor-not-allowed'
              }`}
            >
              确认标记 (Enter)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
