import { useState, useCallback, useRef } from 'react';
import { Card, Group, Viewport } from '../types';
import { CanvasPin } from './useCanvasPins';

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

  // Step 1 cards (Group)
  const spawnStepCards = useCallback((stepIdx: number) => {
    const vp = viewportRef.current;
    // Calculate world center
    const cx = (window.innerWidth / 2 - vp.x) / vp.zoom;
    const cy = (window.innerHeight / 2 - vp.y) / vp.zoom;

    if (stepIdx === 0) {
      // Step 1: Grouping
      const tourCards: Card[] = [
        {
          id: 'tour-card-1',
          type: 'text',
          x: cx - 220,
          y: cy - 70,
          width: 180,
          height: 140,
          zIndex: 100,
          content: '✦ 便签 A\n框选我和右边便签，按【Ctrl+G】打组成组！',
          headerTitle: '第一步：框选我们',
        },
        {
          id: 'tour-card-2',
          type: 'text',
          x: cx + 40,
          y: cy - 70,
          width: 180,
          height: 140,
          zIndex: 101,
          content: '✦ 便签 B\n打包后生成多边形虚线轮廓，点击左上角折叠！',
          headerTitle: '按 Ctrl+G 打组',
        },
        {
          id: 'tour-card-3',
          type: 'text',
          x: cx + 280,
          y: cy - 70,
          width: 180,
          height: 140,
          zIndex: 102,
          content: '✦ 便签 C\n试着把我也拖进打好的虚线框内，自动入组！',
          headerTitle: '拖拽动态入组',
        },
      ];
      commitState(tourCards, []);
    } else if (stepIdx === 1) {
      // Step 2: Parent & Wiring
      const tourCards: Card[] = [
        {
          id: 'tour-wire-card-1',
          type: 'text',
          x: cx - 180,
          y: cy + 40,
          width: 200,
          height: 130,
          zIndex: 100,
          content: '按住【Ctrl+Shift】从我边缘拖出引线，吸附到上方的圆球！',
          headerTitle: '按住 Ctrl+Shift 拖出引线',
        },
        {
          id: 'tour-wire-card-2',
          type: 'text',
          x: cx + 80,
          y: cy + 40,
          width: 200,
          height: 130,
          zIndex: 101,
          content: '拖动上方父级，下级整条分支一起同步位移！',
          headerTitle: '分支位移联动',
        },
      ];
      const tourParent: Group = {
        id: 'tour-parent-1',
        title: '主题父级',
        x: cx - 60,
        y: cy - 140,
        width: 120,
        height: 120,
        color: '#FACB0E',
        kind: 'parent',
        zIndex: 90,
      };
      commitState(tourCards, [tourParent]);
    } else if (stepIdx === 2) {
      // Step 3: Packing & Aligning
      const tourCards: Card[] = [
        {
          id: 'tour-pack-1',
          type: 'text',
          x: cx - 180,
          y: cy - 120,
          width: 170,
          height: 110,
          zIndex: 100,
          content: '按【Ctrl+P】一键分行装箱自动排版！',
          headerTitle: '排版便签 1',
        },
        {
          id: 'tour-pack-2',
          type: 'text',
          x: cx + 20,
          y: cy - 90,
          width: 170,
          height: 120,
          zIndex: 101,
          content: '多选后按【Alt+方向键】5px避障对齐！',
          headerTitle: '排版便签 2',
        },
        {
          id: 'tour-pack-3',
          type: 'text',
          x: cx - 140,
          y: cy + 40,
          width: 170,
          height: 100,
          zIndex: 102,
          content: '整洁有序，杜绝凌乱。',
          headerTitle: '排版便签 3',
        },
        {
          id: 'tour-pack-4',
          type: 'text',
          x: cx + 60,
          y: cy + 60,
          width: 170,
          height: 110,
          zIndex: 103,
          content: '空白右键轮盘还可以“均宽”！',
          headerTitle: '排版便签 4',
        },
      ];
      commitState(tourCards, []);
    } else if (stepIdx === 3) {
      // Step 4: Canvas Pins
      const tourCards: Card[] = [
        {
          id: 'tour-pin-card',
          type: 'text',
          x: cx - 140,
          y: cy - 60,
          width: 280,
          height: 150,
          zIndex: 100,
          content: '1. 右键空白处选择“图钉”，在当前位置钉上 1 号图钉。\n2. 按住空格把画布拖到远远的地方。\n3. 按下【Ctrl+1】，镜头瞬间平滑飞回！',
          headerTitle: '图钉与平滑穿梭',
        },
      ];
      commitState(tourCards, []);
      canvasPins.addOrUpdatePin(1, { x: cx, y: cy - 120 }, vp.zoom);
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

    setIsHandbookOpen(false);
    setIsSandboxActive(true);
    setCurrentStepIndex(0);
    spawnStepCards(0);
    showToast('已进入核心功能画布实操演练（可随时在顶部退出演练）');
  }, [cardsRef, groupsRef, canvasPins.pins, viewportRef, spawnStepCards, showToast]);

  const goToNextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const next = prev + 1;
      spawnStepCards(next);
      return next;
    });
  }, [spawnStepCards]);

  const goToPrevStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const next = Math.max(0, prev - 1);
      spawnStepCards(next);
      return next;
    });
  }, [spawnStepCards]);

  const exitTour = useCallback((cleanCards: boolean) => {
    setIsSandboxActive(false);
    if (cleanCards && preTourSnapshotRef.current) {
      const snap = preTourSnapshotRef.current;
      commitState(snap.cards, snap.groups);
      canvasPins.replacePins(snap.pins);
      setViewport(snap.viewport);
      showToast('已退出演练并恢复原画布');
    } else {
      showToast('已完成演练！尽情开始创作吧');
    }
    preTourSnapshotRef.current = null;
  }, [commitState, canvasPins, setViewport, showToast]);

  return {
    isHandbookOpen,
    setIsHandbookOpen,
    isSandboxActive,
    currentStepIndex,
    startTourSandbox,
    goToNextStep,
    goToPrevStep,
    exitTour,
  };
}
