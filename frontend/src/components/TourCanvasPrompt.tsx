import React from 'react';

export interface TourCanvasPromptProps {
  x: number;
  y: number;
  stepNumber: number;
  totalSteps: number;
  title: string;
  instruction: string;
  shortcut?: string;
  onNext?: () => void;
  onPrev?: () => void;
}

export const TourCanvasPrompt: React.FC<TourCanvasPromptProps> = ({
  x,
  y,
  stepNumber,
  totalSteps,
  title,
  instruction,
  shortcut,
  onNext,
  onPrev,
}) => {
  return (
    <div
      data-tour-canvas-prompt="true"
      className="absolute pointer-events-auto select-none z-[80] -translate-x-1/2 flex flex-col items-center"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: '460px',
      }}
    >
      {/* Upward Indicator Arrow */}
      <div className="flex flex-col items-center mb-1">
        <div className="w-0 h-0 border-x-[6px] border-x-transparent border-b-[6px] border-b-ink" />
      </div>

      {/* Main Instruction Box */}
      <div className="w-full bg-paper border-2 border-ink p-4 shadow-[4px_4px_0px_#1d1d1d] flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-ink/15 pb-2">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-ink text-paper">
              步骤 {stepNumber}/{totalSteps}
            </span>
            <span className="text-[13px] font-black tracking-tight text-ink">
              {title}
            </span>
          </div>
          {shortcut && (
            <div className="text-[11px] font-mono font-bold text-ink bg-stone/25 px-2 py-0.5 border border-ink/20">
              {shortcut}
            </div>
          )}
        </div>

        <div className="text-[12px] text-ink leading-relaxed font-normal">
          {instruction}
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px]">
          <span className="text-ink/60 font-mono">
            {stepNumber < totalSteps ? '完成操作或点击下方下一步继续 ➔' : '已达成完整层级树！'}
          </span>
          <div className="flex items-center gap-2">
            {onPrev && stepNumber > 1 && (
              <button
                type="button"
                onClick={onPrev}
                className="px-2.5 py-1 font-bold border border-ink bg-paper text-ink hover:bg-stone/20 transition-colors cursor-pointer rounded-[10px]"
              >
                上一步
              </button>
            )}
            {onNext && stepNumber < totalSteps && (
              <button
                type="button"
                onClick={onNext}
                className="px-3 py-1 font-bold bg-ink text-paper hover:bg-ink/80 transition-colors cursor-pointer rounded-[10px]"
              >
                下一步 ➔
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
