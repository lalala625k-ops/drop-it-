import React from 'react';

export interface TourMinimalPromptProps {
  promptText: string;
  shortcutText?: string;
  isCompleted?: boolean;
  onExit: (cleanCards: boolean) => void;
  onSkipStep?: () => void;
}

export const TourMinimalPrompt: React.FC<TourMinimalPromptProps> = ({
  promptText,
  shortcutText,
  isCompleted = false,
  onExit,
  onSkipStep,
}) => {
  return (
    <div
      data-tour-minimal-prompt="true"
      className="fixed bottom-7 left-1/2 -translate-x-1/2 z-[125] pointer-events-auto select-none flex flex-col items-center gap-1.5 max-w-[85vw] text-center animate-in fade-in duration-200"
    >
      {/* Pure text instruction with no background */}
      <div className="text-[16px] md:text-[17px] font-bold text-ink tracking-tight font-retina">
        {promptText}
      </div>

      {/* Shortcut chip (no container box, subtle styling) */}
      {shortcutText && !isCompleted && (
        <div className="text-[12px] font-mono font-medium text-ink/70 flex items-center gap-2">
          <span>{shortcutText}</span>
          {onSkipStep && (
            <button
              type="button"
              onClick={onSkipStep}
              className="text-[11px] underline opacity-50 hover:opacity-100 transition-opacity cursor-pointer ml-1"
              title="跳过此步"
            >
              (跳过)
            </button>
          )}
        </div>
      )}

      {/* Completion actions */}
      {isCompleted && (
        <div className="flex items-center gap-4 mt-2">
          <button
            type="button"
            onClick={() => onExit(false)}
            className="px-4 py-1.5 text-[13px] font-bold bg-ink text-paper rounded-[10px] hover:bg-ink/80 transition-colors cursor-pointer"
          >
            保留结构并开始创作
          </button>
          <button
            type="button"
            onClick={() => onExit(true)}
            className="px-3 py-1.5 text-[12px] font-bold text-ink/70 hover:text-ink underline transition-colors cursor-pointer"
          >
            恢复原画布
          </button>
        </div>
      )}

      {/* Discreet Exit link when not completed */}
      {!isCompleted && (
        <button
          type="button"
          onClick={() => onExit(true)}
          className="text-[11px] font-mono text-ink/40 hover:text-ink transition-colors cursor-pointer underline mt-0.5"
        >
          退出演练
        </button>
      )}
    </div>
  );
};
