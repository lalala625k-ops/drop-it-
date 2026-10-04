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
    title: '框选与打组 (Bundle Group)',
    badge: '1/5',
    instruction: '在空白处拉框，同时选中正在上下跳动的【便签 A】与【便签 B】，按【Ctrl+G】打包成组。',
    shortcut: 'Ctrl + G 打包成组',
  },
  {
    id: 2,
    title: '拖拽入组与折叠 (Add & Collapse)',
    badge: '2/5',
    instruction: '拖动跳动的【便签 C】进入左侧 Group 的虚线多边形内（动态入组），点击左上角方块折叠成列表。',
    shortcut: '拖拽进组 / 点击左上角折叠',
  },
  {
    id: 3,
    title: '圆形父级与树状引线 (Parent & Wiring)',
    badge: '3/5',
    instruction: '按住【Ctrl+Shift】从下方 Group 或便签拖出引线连接至圆形父物体；拖动父物体联动整条树状分支！',
    shortcut: 'Ctrl + Shift + 拖拽 建立引线 / Ctrl + J 新建父级',
  },
  {
    id: 4,
    title: '拓展多级分支与规整排版 (Multi-Level & Packing)',
    badge: '4/5',
    instruction: '框选下方参差错落的二级子任务便签，按【Ctrl+P】分行紧凑装箱，或按【Alt+方向键】5px 避障规整对齐。',
    shortcut: 'Ctrl + P 分行装箱 / Alt + 方向键 避障对齐',
  },
  {
    id: 5,
    title: '图钉快速穿梭与宏观全览 (Pins & Grand Tree)',
    badge: '5/5',
    instruction: '在树状顶部已钉上 1 号十字星图钉；按住空格漫游到远方，按【Ctrl+1】平滑飞跃穿梭回核心总览！',
    shortcut: 'Ctrl + 1 飞向图钉 / 空白右键全览',
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
