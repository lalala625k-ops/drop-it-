import React from 'react';

export interface TourStep {
  id: number;
  title: string;
  badge: string;
  instruction: string;
  shortcut: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    title: '组织打组 (Bundle Group)',
    badge: '1/4',
    instruction: '框选画布中央的卡片，按下快捷键打包成组；尝试点击左上角折叠/展开，或拖入外部卡片。',
    shortcut: 'Ctrl + G 打包成组 / Ctrl + Shift + G 解散',
  },
  {
    id: 2,
    title: '圆形父级与引线连线 (Parent & Wiring)',
    badge: '2/4',
    instruction: '按住 Ctrl+Shift 从便签边缘拖出引线连接至圆形父物体；拖拽父物体联动整个分支。',
    shortcut: 'Ctrl + Shift + 拖拽 建立引线 / Ctrl + J 新建父级',
  },
  {
    id: 3,
    title: '自动排版与避障对齐 (Packing & Align)',
    badge: '3/4',
    instruction: '按下快捷键体验错落卡片一键分行装箱，或多选后使用方向键体验带 5px 物理避障的对齐。',
    shortcut: 'Ctrl + P 自动装箱 / Alt + 方向键 5px 避障对齐',
  },
  {
    id: 4,
    title: '空间图钉与飞行动画 (Pins & Navigation)',
    badge: '4/4',
    instruction: '在空白处右键选择“图钉”在当前视野标记 1 号图钉；漫游到远方后按快捷键平滑穿梭。',
    shortcut: 'Ctrl + 1 飞向 1 号图钉 / 空白右键选择图钉',
  },
];

interface TourOverlayBarProps {
  currentStepIndex: number;
  onNextStep: () => void;
  onPrevStep: () => void;
  onExitTour: (cleanCards: boolean) => void;
}

export const TourOverlayBar: React.FC<TourOverlayBarProps> = ({
  currentStepIndex,
  onNextStep,
  onPrevStep,
  onExitTour,
}) => {
  const step = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0];
  const isLast = currentStepIndex >= TOUR_STEPS.length - 1;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[125] flex flex-col items-center select-none animate-fadeIn">
      <div className="bg-paper text-ink border-2 border-ink px-5 py-3 shadow-xl flex items-center gap-5 min-w-[580px] max-w-[90vw] justify-between">
        {/* Left: Step Info */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold bg-ink text-paper px-2 py-0.5 rounded-[10px]">
              实操关卡 {step.badge}
            </span>
            <span className="text-[14px] font-black font-retina tracking-tight">
              {step.title}
            </span>
          </div>
          <div className="text-[12px] text-ink/80 leading-normal max-w-[420px]">
            {step.instruction}
          </div>
          <div className="text-[11px] font-mono font-bold text-ink/90 bg-stone/20 px-2 py-0.5 rounded-[10px] w-fit mt-0.5">
            🔑 {step.shortcut}
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {currentStepIndex > 0 && (
            <button
              type="button"
              onClick={onPrevStep}
              className="px-2.5 py-1 text-[12px] font-bold border border-ink/40 hover:border-ink rounded-[10px] transition-colors cursor-pointer"
            >
              上一步
            </button>
          )}

          {!isLast ? (
            <button
              type="button"
              onClick={onNextStep}
              className="px-3.5 py-1 text-[12px] font-bold bg-ink text-paper hover:bg-ink/80 rounded-[10px] transition-colors cursor-pointer"
            >
              下一步 ➔
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onExitTour(true)}
              className="px-3.5 py-1 text-[12px] font-bold bg-ink text-paper hover:bg-ink/80 rounded-[10px] transition-colors cursor-pointer"
            >
              完成演练 ✓
            </button>
          )}

          <div className="w-[1px] h-6 bg-ink/20 mx-1" />

          <button
            type="button"
            onClick={() => onExitTour(false)}
            title="退出演练（保留当前演练卡片）"
            className="px-2 py-1 text-[11px] font-bold text-ink/60 hover:text-ink transition-colors cursor-pointer"
          >
            退出
          </button>
          <button
            type="button"
            onClick={() => onExitTour(true)}
            title="清空演练卡片并退出"
            className="px-2 py-1 text-[11px] font-bold text-ink/60 hover:text-ink transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
