import { useState, useCallback, useRef } from 'react';
import { Card, Group, Viewport } from '../types';
import { CanvasPin } from './useCanvasPins';
import { TourCardHint } from '../components/CardComponent';

interface UseTourGuideProps {
  cardsRef: React.MutableRefObject<Card[]>;
  groupsRef: React.MutableRefObject<Group[]>;
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  viewportRef: React.MutableRefObject<Viewport>;
  setViewport: (vp: Viewport) => void;
  canvasPins: {
    pins: CanvasPin[];
    addOrUpdatePin: (index: number, world: { x: number; y: number }, zoom?: number) => void;
    replacePins: (pins: CanvasPin[]) => void;
  };
  pushHistory: (cards: Card[], groups: Group[]) => void;
  commitState: (cards: Card[], groups: Group[]) => void;
  showToast: (msg: string) => void;
}

export interface TourCanvasPromptInfo {
  x: number;
  y: number;
  stepNumber: number;
  totalSteps: number;
  title: string;
  instruction: string;
  shortcut?: string;
}

export function useTourGuide({
  cardsRef,
  groupsRef,
  setCards,
  setGroups,
  viewportRef,
  setViewport,
  canvasPins,
  pushHistory,
  commitState,
  showToast,
}: UseTourGuideProps) {
  const [isHandbookOpen, setIsHandbookOpen] = useState(false);
  const [isSandboxActive, setIsSandboxActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Snapshot before starting tour
  const preTourSnapshotRef = useRef<{ cards: Card[]; groups: Group[]; pins: CanvasPin[]; viewport: Viewport } | null>(null);

  // Fixed world anchor center for the tour
  const tourCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tour Hints for bouncing and tooltips
  const [tourHints, setTourHints] = useState<Record<string, TourCardHint>>({});

  // Canvas Prompt Info
  const [currentPrompt, setCurrentPrompt] = useState<TourCanvasPromptInfo | null>(null);

  // Progressive State Generator
  const applyTourStep = useCallback((stepIdx: number) => {
    const cx = tourCenterRef.current.x;
    const cy = tourCenterRef.current.y;

    if (stepIdx === 0) {
      // Step 1: Grouping A and B
      const tourCards: Card[] = [
        {
          id: 'tour-card-1',
          type: 'text',
          x: cx - 210,
          y: cy - 90,
          width: 190,
          height: 130,
          zIndex: 100,
          content: '✦ 便签 A\n项目构想与目标设定',
        },
        {
          id: 'tour-card-2',
          type: 'text',
          x: cx + 10,
          y: cy - 90,
          width: 190,
          height: 130,
          zIndex: 101,
          content: '✦ 便签 B\n技术方案与架构蓝图',
        },
        {
          id: 'tour-card-3',
          type: 'text',
          x: cx + 230,
          y: cy - 90,
          width: 190,
          height: 130,
          zIndex: 102,
          content: '✦ 便签 C\n待分配参考素材',
        },
      ];

      commitState(tourCards, []);
      setTourHints({
        'tour-card-1': { label: '框选我', bounce: true },
        'tour-card-2': { label: '框选我', bounce: true },
        'tour-card-3': { label: '稍后拖我入组', bounce: false },
      });
      setCurrentPrompt({
        x: cx + 10,
        y: cy + 70,
        stepNumber: 1,
        totalSteps: 5,
        title: '框选与打组 (Bundle Group)',
        instruction: '👆 提示：用鼠标在空白处拉框，同时框选上方正在上下跳动的【便签 A】与【便签 B】，然后按下快捷键【Ctrl+G】打包成组。',
        shortcut: 'Ctrl + G',
      });
    } else if (stepIdx === 1) {
      // Step 2: Drag C into Group and Collapse/Expand
      const tourCards: Card[] = [
        {
          id: 'tour-card-1',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 210,
          y: cy - 90,
          width: 190,
          height: 130,
          zIndex: 100,
          content: '✦ 便签 A\n项目构想与目标设定',
        },
        {
          id: 'tour-card-2',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx + 10,
          y: cy - 90,
          width: 190,
          height: 130,
          zIndex: 101,
          content: '✦ 便签 B\n技术方案与架构蓝图',
        },
        {
          id: 'tour-card-3',
          type: 'text',
          x: cx + 250,
          y: cy - 90,
          width: 190,
          height: 130,
          zIndex: 102,
          content: '✦ 便签 C\n待分配参考素材',
        },
      ];

      const tourGroups: Group[] = [
        {
          id: 'tour-group-1',
          title: '核心研发模块',
          x: cx - 230,
          y: cy - 110,
          width: 450,
          height: 170,
          kind: 'bundle',
          zIndex: 50,
        },
      ];

      commitState(tourCards, tourGroups);
      setTourHints({
        'tour-card-3': { label: '拖我进左侧虚线框', bounce: true },
        'tour-group-1': { label: '目标 Group 框', bounce: false },
      });
      setCurrentPrompt({
        x: cx + 10,
        y: cy + 90,
        stepNumber: 2,
        totalSteps: 5,
        title: '拖拽入组与折叠 (Add & Collapse)',
        instruction: '👆 提示：按住左键拖动跳动的【便签 C】，放进左侧虚线框内（自动吸收入组）；然后点击左上角的小方块按钮折叠成紧凑列表。',
        shortcut: '拖拽进框 / 点击左上角折叠',
      });
    } else if (stepIdx === 2) {
      // Step 3: Create Parent Node and Wire Hierarchy
      const tourCards: Card[] = [
        {
          id: 'tour-card-1',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 260,
          y: cy - 10,
          width: 180,
          height: 120,
          zIndex: 100,
          content: '✦ 便签 A\n项目构想与目标设定',
        },
        {
          id: 'tour-card-2',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 70,
          y: cy - 10,
          width: 180,
          height: 120,
          zIndex: 101,
          content: '✦ 便签 B\n技术方案与架构蓝图',
        },
        {
          id: 'tour-card-3',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 165,
          y: cy + 120,
          width: 180,
          height: 110,
          zIndex: 102,
          content: '✦ 便签 C\n待分配参考素材',
        },
        {
          id: 'tour-card-4',
          type: 'text',
          x: cx + 180,
          y: cy - 10,
          width: 190,
          height: 130,
          zIndex: 103,
          content: '✦ 便签 D\n产品运营与发布策略',
        },
      ];

      const tourGroups: Group[] = [
        {
          id: 'tour-parent-root',
          title: '随想系统总纲',
          x: cx - 60,
          y: cy - 200,
          width: 120,
          height: 120,
          color: '#FACB0E',
          kind: 'parent',
          zIndex: 90,
        },
        {
          id: 'tour-group-1',
          title: '核心研发模块',
          x: cx - 280,
          y: cy - 30,
          width: 410,
          height: 280,
          kind: 'bundle',
          zIndex: 50,
        },
      ];

      commitState(tourCards, tourGroups);
      setTourHints({
        'tour-group-1': { label: 'Ctrl+Shift 拖出引线', bounce: true },
        'tour-card-4': { label: 'Ctrl+Shift 拖出引线', bounce: true },
        'tour-parent-root': { label: '松手连接至我', bounce: false },
      });
      setCurrentPrompt({
        x: cx,
        y: cy + 270,
        stepNumber: 3,
        totalSteps: 5,
        title: '创建父级与树状引线 (Parent & Wiring)',
        instruction: '👆 提示：按住【Ctrl+Shift】从下方 Group 或便签 D 拖出引线，松手连接到上方黄色圆形父级；拖动圆形父级，整条分支将同步位移！',
        shortcut: 'Ctrl + Shift + 拖拽 建立引线',
      });
    } else if (stepIdx === 3) {
      // Step 4: Multi-Level Child Branch & Packing/Alignment
      const tourCards: Card[] = [
        {
          id: 'tour-card-1',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 260,
          y: cy - 10,
          width: 180,
          height: 120,
          zIndex: 100,
          content: '✦ 便签 A\n项目构想与目标设定',
        },
        {
          id: 'tour-card-2',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 70,
          y: cy - 10,
          width: 180,
          height: 120,
          zIndex: 101,
          content: '✦ 便签 B\n技术方案与架构蓝图',
        },
        {
          id: 'tour-card-3',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 165,
          y: cy + 120,
          width: 180,
          height: 110,
          zIndex: 102,
          content: '✦ 便签 C\n待分配参考素材',
        },
        {
          id: 'tour-card-4',
          type: 'text',
          groupId: 'tour-parent-root',
          x: cx + 180,
          y: cy - 10,
          width: 200,
          height: 120,
          zIndex: 103,
          content: '✦ 便签 D\n产品运营与发布策略',
        },
        // Level 3 child tasks (ragged / misaligned)
        {
          id: 'tour-card-5',
          type: 'text',
          groupId: 'tour-card-4',
          x: cx + 140,
          y: cy + 140,
          width: 160,
          height: 85,
          zIndex: 104,
          content: '✦ 子任务 1\n多平台网页元数据抓取',
        },
        {
          id: 'tour-card-6',
          type: 'text',
          groupId: 'tour-card-4',
          x: cx + 330,
          y: cy + 165,
          width: 170,
          height: 95,
          zIndex: 105,
          content: '✦ 子任务 2\n本地完整 .note 打包导出',
        },
        {
          id: 'tour-card-7',
          type: 'text',
          groupId: 'tour-card-4',
          x: cx + 180,
          y: cy + 255,
          width: 160,
          height: 80,
          zIndex: 106,
          content: '✦ 子任务 3\n高精度 OCR 文字提取',
        },
      ];

      const tourGroups: Group[] = [
        {
          id: 'tour-parent-root',
          title: '随想系统总纲',
          x: cx - 60,
          y: cy - 200,
          width: 120,
          height: 120,
          color: '#FACB0E',
          kind: 'parent',
          zIndex: 90,
        },
        {
          id: 'tour-group-1',
          title: '核心研发模块',
          x: cx - 280,
          y: cy - 30,
          width: 410,
          height: 280,
          kind: 'bundle',
          parentIds: ['tour-parent-root'],
          zIndex: 50,
        },
      ];

      commitState(tourCards, tourGroups);
      setTourHints({
        'tour-card-5': { label: '框选我们排版', bounce: true },
        'tour-card-6': { label: '框选我们排版', bounce: true },
        'tour-card-7': { label: '框选我们排版', bounce: true },
      });
      setCurrentPrompt({
        x: cx + 180,
        y: cy + 360,
        stepNumber: 4,
        totalSteps: 5,
        title: '拓展多级分支与智能排版',
        instruction: '👆 提示：框选右下方参差错落的二级子任务便签，按【Ctrl+P】分行紧凑装箱，或按【Alt+方向键】5px 避障规整对齐，也可空白右键轮盘选择‘均宽’。',
        shortcut: 'Ctrl + P 装箱 / Alt + 方向键 对齐',
      });
    } else if (stepIdx === 4) {
      // Step 5: Complete Grand Tree & Pin Jump
      const tourCards: Card[] = [
        {
          id: 'tour-card-1',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 260,
          y: cy - 10,
          width: 180,
          height: 120,
          zIndex: 100,
          content: '✦ 便签 A\n项目构想与目标设定',
        },
        {
          id: 'tour-card-2',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 70,
          y: cy - 10,
          width: 180,
          height: 120,
          zIndex: 101,
          content: '✦ 便签 B\n技术方案与架构蓝图',
        },
        {
          id: 'tour-card-3',
          type: 'text',
          bundleId: 'tour-group-1',
          x: cx - 165,
          y: cy + 120,
          width: 180,
          height: 110,
          zIndex: 102,
          content: '✦ 便签 C\n待分配参考素材',
        },
        {
          id: 'tour-card-4',
          type: 'text',
          groupId: 'tour-parent-root',
          x: cx + 180,
          y: cy - 10,
          width: 200,
          height: 120,
          zIndex: 103,
          content: '✦ 便签 D\n产品运营与发布策略',
        },
        // Level 3 child tasks neatly aligned
        {
          id: 'tour-card-5',
          type: 'text',
          groupId: 'tour-card-4',
          x: cx + 150,
          y: cy + 140,
          width: 160,
          height: 85,
          zIndex: 104,
          content: '✦ 子任务 1\n多平台网页元数据抓取',
        },
        {
          id: 'tour-card-6',
          type: 'text',
          groupId: 'tour-card-4',
          x: cx + 325,
          y: cy + 140,
          width: 160,
          height: 85,
          zIndex: 105,
          content: '✦ 子任务 2\n本地完整 .note 打包导出',
        },
        {
          id: 'tour-card-7',
          type: 'text',
          groupId: 'tour-card-4',
          x: cx + 150,
          y: cy + 240,
          width: 160,
          height: 85,
          zIndex: 106,
          content: '✦ 子任务 3\n高精度 OCR 文字提取',
        },
      ];

      const tourGroups: Group[] = [
        {
          id: 'tour-parent-root',
          title: '随想系统总纲',
          x: cx - 60,
          y: cy - 200,
          width: 120,
          height: 120,
          color: '#FACB0E',
          kind: 'parent',
          zIndex: 90,
        },
        {
          id: 'tour-group-1',
          title: '核心研发模块',
          x: cx - 280,
          y: cy - 30,
          width: 410,
          height: 280,
          kind: 'bundle',
          parentIds: ['tour-parent-root'],
          zIndex: 50,
        },
      ];

      commitState(tourCards, tourGroups);
      // Place Pin 1 right above root parent
      canvasPins.addOrUpdatePin(1, { x: cx, y: cy - 250 }, viewportRef.current.zoom);

      setTourHints({
        'tour-parent-root': { label: '1 号图钉已就位', bounce: false },
      });
      setCurrentPrompt({
        x: cx,
        y: cy + 350,
        stepNumber: 5,
        totalSteps: 5,
        title: '宏观全览与图钉穿梭 (Pins & Grand Tree)',
        instruction: '🎉 恭喜！你已亲手打造出了一幅包含【外层打组】、【圆形父级】、【多级树状引线】与【规整排版】的完整知识树！按住空格把画布拖到远方，按【Ctrl+1】可瞬间平滑飞回！',
        shortcut: 'Ctrl + 1 飞向图钉 / 空白右键全览',
      });
    }
  }, [commitState, canvasPins, viewportRef]);

  const startTourSandbox = useCallback(() => {
    // Save current state
    preTourSnapshotRef.current = {
      cards: [...cardsRef.current],
      groups: [...groupsRef.current],
      pins: [...canvasPins.pins],
      viewport: { ...viewportRef.current },
    };

    const vp = viewportRef.current;
    tourCenterRef.current = {
      x: (window.innerWidth / 2 - vp.x) / vp.zoom,
      y: (window.innerHeight / 2 - vp.y) / vp.zoom,
    };

    setIsHandbookOpen(false);
    setIsSandboxActive(true);
    setCurrentStepIndex(0);
    applyTourStep(0);
    showToast('已进入核心功能画布实操演练（可随时在顶部退出演练）');
  }, [cardsRef, groupsRef, canvasPins.pins, viewportRef, applyTourStep, showToast]);

  const goToNextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const next = Math.min(4, prev + 1);
      applyTourStep(next);
      return next;
    });
  }, [applyTourStep]);

  const goToPrevStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const next = Math.max(0, prev - 1);
      applyTourStep(next);
      return next;
    });
  }, [applyTourStep]);

  const exitTour = useCallback((cleanCards: boolean) => {
    setIsSandboxActive(false);
    setTourHints({});
    setCurrentPrompt(null);
    if (cleanCards && preTourSnapshotRef.current) {
      const snap = preTourSnapshotRef.current;
      commitState(snap.cards, snap.groups);
      canvasPins.replacePins(snap.pins);
      setViewport(snap.viewport);
      showToast('已退出演练并恢复原画布');
    } else {
      showToast('已完成演练！当前树状结构已保留，尽情开始创作吧');
    }
    preTourSnapshotRef.current = null;
  }, [commitState, canvasPins, setViewport, showToast]);

  return {
    isHandbookOpen,
    setIsHandbookOpen,
    isSandboxActive,
    currentStepIndex,
    tourHints,
    currentPrompt,
    startTourSandbox,
    goToNextStep,
    goToPrevStep,
    exitTour,
  };
}
