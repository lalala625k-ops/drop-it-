import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, Group, Viewport } from '../types';
import { CanvasPin } from './useCanvasPins';
import { TourCardHint } from '../components/CardComponent';

export type TourStage =
  | 'INGEST'
  | 'GROUP'
  | 'CREATE_PARENT'
  | 'CONNECT_PARENT'
  | 'ALIGN_WIDTH'
  | 'PACK_WATERFALL'
  | 'ALIGN_ARROWS'
  | 'COMPLETED';

interface UseTourGuideProps {
  cards: Card[];
  groups: Group[];
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
  onFitCanvas?: () => void;
}

export function useTourGuide({
  cards,
  groups,
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
  onFitCanvas,
}: UseTourGuideProps) {
  const [isHandbookOpen, setIsHandbookOpen] = useState(false);
  const [isSandboxActive, setIsSandboxActive] = useState(false);
  const [currentStage, setCurrentStage] = useState<TourStage>('INGEST');

  // Pre-tour snapshot
  const preTourSnapshotRef = useRef<{
    cards: Card[];
    groups: Group[];
    pins: CanvasPin[];
    viewport: Viewport;
  } | null>(null);

  // Anchor center in world coordinates
  const tourCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tour Hints for cards/groups
  const [tourHints, setTourHints] = useState<Record<string, TourCardHint>>({});

  // Prompt message info
  const [promptText, setPromptText] = useState('');
  const [shortcutText, setShortcutText] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);

  // Transition lock to prevent duplicate advancements
  const isAdvancingRef = useRef(false);

  // Baseline tracking for auto-detection
  const initialCardsCountRef = useRef(0);
  const initialParentsCountRef = useRef(0);
  const sortCardPrevPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // Enter a specific tour stage
  const setupStage = useCallback(
    (stage: TourStage) => {
      setCurrentStage(stage);
      isAdvancingRef.current = false;
      const cx = tourCenterRef.current.x;
      const cy = tourCenterRef.current.y;

      if (stage === 'INGEST') {
        setIsCompleted(false);
        const tourCards: Card[] = [
          {
            id: 'tour-ingest-text',
            type: 'text',
            x: cx - 330,
            y: cy - 70,
            width: 190,
            height: 130,
            zIndex: 100,
            content: '✦ 随想便签\n可直接双击或选中就地编辑文字，支持 Markdown 语法排版。',
          },
          {
            id: 'tour-ingest-web',
            type: 'web',
            x: cx - 110,
            y: cy - 70,
            width: 230,
            height: 130,
            zIndex: 101,
            title: '随想无界看板 · 知识管理',
            url: 'https://github.com/lalala625k-ops/note2026',
            description: '粘贴任何 URL 链接即可自动解析标题、封面与网站图标。',
          },
          {
            id: 'tour-ingest-img',
            type: 'image',
            x: cx + 150,
            y: cy - 70,
            width: 210,
            height: 130,
            zIndex: 102,
            image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="210" height="130" viewBox="0 0 210 130"><rect width="210" height="130" fill="%23f0eee6"/><text x="105" y="60" font-family="sans-serif" font-size="13" font-weight="bold" fill="%231d1d1d" text-anchor="middle">✦ 样例截图便签</text><text x="105" y="85" font-family="sans-serif" font-size="10" fill="%23666666" text-anchor="middle">右键 10点识字 / 11点溯源</text></svg>`,
          },
        ];

        commitState(tourCards, []);
        initialCardsCountRef.current = tourCards.length;
        setTourHints({
          'tour-ingest-text': { label: '文本便签', bounce: false },
          'tour-ingest-web': { label: '网页便签', bounce: false },
          'tour-ingest-img': { label: '图片便签 (右键识字/溯源)', bounce: false },
        });
        setPromptText('画布支持摄入一切内容：试着按 Ctrl+N 新建一张便签，或直接粘贴一段文字、网页链接或图片。');
        setShortcutText('快捷键：Ctrl+N 新建便签 / Ctrl+V 直接粘贴 / 右键轮盘 10点识字·11点溯源');
      } else if (stage === 'GROUP') {
        setTourHints({
          'tour-ingest-text': { label: '框选我', bounce: true },
          'tour-ingest-web': { label: '框选我', bounce: true },
          'tour-ingest-img': { label: '待入组卡片', bounce: false },
        });
        setPromptText('用鼠标在空白处拉框，同时框选上方两张正在跳动的卡片，按下 Ctrl+G 将它们打包成组。');
        setShortcutText('快捷键：Ctrl+G 打包成组 / 右键轮盘 重命名');
      } else if (stage === 'CREATE_PARENT') {
        setTourHints({});
        initialParentsCountRef.current = groupsRef.current.filter((g) => g.kind === 'parent').length;
        setPromptText('在连接父级之前，先按下快捷键 Ctrl+J，在光标位置新建一个圆形父级。');
        setShortcutText('快捷键：Ctrl+J 新建圆形父级');
      } else if (stage === 'CONNECT_PARENT') {
        const parents = groupsRef.current.filter((g) => g.kind === 'parent');
        const parentId = parents[parents.length - 1]?.id || 'tour-parent-auto';
        setTourHints({
          'tour-ingest-text': { label: '按住 Ctrl+Shift 拖出引线', bounce: true },
          [parentId]: { label: '松手连接至我', bounce: false },
        });
        setPromptText('按住 Ctrl+Shift 从下方卡片或 Group 边缘拖出引线，松手吸附连接到刚建好的圆形父级！');
        setShortcutText('快捷键：按住 Ctrl+Shift 拖拽建立引线 / 拖动父物体联动整条分支');
      } else if (stage === 'ALIGN_WIDTH') {
        // Step 4: Sorting cards with different sizes, no headerTitle
        const sortCards: Card[] = [
          {
            id: 'tour-sort-1',
            type: 'text',
            x: cx - 290,
            y: cy + 120,
            width: 160,
            height: 90,
            zIndex: 110,
            content: '✦ 模块 A\n网络协议解析',
          },
          {
            id: 'tour-sort-2',
            type: 'text',
            x: cx - 100,
            y: cy + 110,
            width: 240,
            height: 125,
            zIndex: 111,
            content: '✦ 模块 B\n离线缓存与 IndexedDB 暂存',
          },
          {
            id: 'tour-sort-3',
            type: 'text',
            x: cx + 170,
            y: cy + 125,
            width: 180,
            height: 100,
            zIndex: 112,
            content: '✦ 模块 C\nSVG 连线与凸包轮廓计算',
          },
          {
            id: 'tour-sort-4',
            type: 'text',
            x: cx - 280,
            y: cy + 245,
            width: 260,
            height: 130,
            zIndex: 113,
            content: '✦ 模块 D\n本地完整 .note 格式打包归档',
          },
          {
            id: 'tour-sort-5',
            type: 'text',
            x: cx + 10,
            y: cy + 260,
            width: 200,
            height: 110,
            zIndex: 114,
            content: '✦ 模块 E\n高精度 OCR 与原链接视觉识别',
          },
          {
            id: 'tour-sort-6',
            type: 'text',
            x: cx + 240,
            y: cy + 250,
            width: 220,
            height: 95,
            zIndex: 115,
            content: '✦ 模块 F\n自定义快捷键与多端配置持久化',
          },
        ];

        // Retain existing cards & groups, and append sorting cards
        const existingCards = cardsRef.current.filter((c) => !c.id.startsWith('tour-sort-'));
        commitState([...existingCards, ...sortCards], groupsRef.current);

        setTourHints({
          'tour-sort-1': { label: '右键均宽', bounce: true },
          'tour-sort-2': { label: '右键均宽', bounce: true },
          'tour-sort-3': { label: '右键均宽', bounce: true },
          'tour-sort-4': { label: '右键均宽', bounce: true },
          'tour-sort-5': { label: '右键均宽', bounce: true },
          'tour-sort-6': { label: '右键均宽', bounce: true },
        });

        // Record positions before packing
        const posMap: Record<string, { x: number; y: number }> = {};
        sortCards.forEach((c) => {
          posMap[c.id] = { x: c.x, y: c.y };
        });
        sortCardPrevPositionsRef.current = posMap;

        setPromptText('排序第一步：框选下方大小不一的卡片，在右键轮盘中选择“均宽”，一键统一所有卡片宽度。');
        setShortcutText('右键轮盘 ➔ 均宽');
      } else if (stage === 'PACK_WATERFALL') {
        // Cards keep uniform width, prompt to press Ctrl+P
        setTourHints({
          'tour-sort-1': { label: 'Ctrl+P 排版', bounce: true },
          'tour-sort-2': { label: 'Ctrl+P 排版', bounce: true },
          'tour-sort-3': { label: 'Ctrl+P 排版', bounce: true },
          'tour-sort-4': { label: 'Ctrl+P 排版', bounce: true },
          'tour-sort-5': { label: 'Ctrl+P 排版', bounce: true },
          'tour-sort-6': { label: 'Ctrl+P 排版', bounce: true },
        });

        const posMap: Record<string, { x: number; y: number }> = {};
        cardsRef.current
          .filter((c) => c.id.startsWith('tour-sort-'))
          .forEach((c) => {
            posMap[c.id] = { x: c.x, y: c.y };
          });
        sortCardPrevPositionsRef.current = posMap;

        setPromptText('排序第二步：按下快捷键 Ctrl+P，将这些卡片一键自动规整排版为紧凑瀑布流！');
        setShortcutText('快捷键：Ctrl+P 自动装箱排版');
      } else if (stage === 'ALIGN_ARROWS') {
        // Once packed, user requested: NO BOUNCING! Stop jumping immediately!
        setTourHints({});

        const posMap: Record<string, { x: number; y: number }> = {};
        cardsRef.current
          .filter((c) => c.id.startsWith('tour-sort-'))
          .forEach((c) => {
            posMap[c.id] = { x: c.x, y: c.y };
          });
        sortCardPrevPositionsRef.current = posMap;

        setPromptText('排序第三步：框选这几张卡片，按住 Alt + 键盘方向键（↑ / ↓ / ← / →），体验带 5px 边缘避障的规整对齐！');
        setShortcutText('快捷键：Alt + 方向键（↑ ↓ ← →） 5px 边缘避障对齐');
      } else if (stage === 'COMPLETED') {
        setTourHints({});
        setIsCompleted(true);
        setPromptText('🎉 恭喜！教学已全部完成！你已完全掌握了画布摄入、打组、父级树状从属与智能排版的核心技能。');
        setShortcutText('');

        // Smoothly auto-fit canvas overview
        setTimeout(() => {
          onFitCanvas?.();
        }, 150);
      }
    },
    [cardsRef, groupsRef, commitState, onFitCanvas]
  );

  // Start Tour Sandbox
  const startTourSandbox = useCallback(() => {
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
    setupStage('INGEST');
    showToast('已进入极简交互式实操引导');
  }, [cardsRef, groupsRef, canvasPins.pins, viewportRef, setupStage, showToast]);

  // Exit Tour Sandbox
  const exitTour = useCallback(
    (cleanCards: boolean) => {
      setIsSandboxActive(false);
      setTourHints({});
      setIsCompleted(false);

      if (cleanCards && preTourSnapshotRef.current) {
        const snap = preTourSnapshotRef.current;
        commitState(snap.cards, snap.groups);
        canvasPins.replacePins(snap.pins);
        setViewport(snap.viewport);
        showToast('已退出演练并恢复原画布');
      } else {
        showToast('教学完成！当前结构已保留，尽情开始创作吧');
      }
      preTourSnapshotRef.current = null;
    },
    [commitState, canvasPins, setViewport, showToast]
  );

  // Manual Skip
  const skipToNextStage = useCallback(() => {
    const stageFlow: TourStage[] = [
      'INGEST',
      'GROUP',
      'CREATE_PARENT',
      'CONNECT_PARENT',
      'ALIGN_WIDTH',
      'PACK_WATERFALL',
      'ALIGN_ARROWS',
      'COMPLETED',
    ];
    const currentIndex = stageFlow.indexOf(currentStage);
    if (currentIndex >= 0 && currentIndex < stageFlow.length - 1) {
      setupStage(stageFlow[currentIndex + 1]);
    }
  }, [currentStage, setupStage]);

  // Reactive Auto-Detection Loop
  useEffect(() => {
    if (!isSandboxActive || isAdvancingRef.current) return;

    if (currentStage === 'INGEST') {
      // Auto-advance if user added a card (Ctrl+N or pasted)
      if (cards.length > initialCardsCountRef.current) {
        isAdvancingRef.current = true;
        showToast('✓ 已感知新便签创建！进入下一步');
        setTimeout(() => setupStage('GROUP'), 700);
      }
    } else if (currentStage === 'GROUP') {
      // Auto-advance when bundle group is created
      const hasBundle = groups.some((g) => g.kind === 'bundle');
      if (hasBundle) {
        isAdvancingRef.current = true;
        setTourHints({});
        showToast('✓ 已成功打包为 Group！');
        setTimeout(() => setupStage('CREATE_PARENT'), 750);
      }
    } else if (currentStage === 'CREATE_PARENT') {
      // Auto-advance when parent is created
      const parentCount = groups.filter((g) => g.kind === 'parent').length;
      if (parentCount > initialParentsCountRef.current) {
        isAdvancingRef.current = true;
        showToast('✓ 已成功新建圆形父物体！');
        setTimeout(() => setupStage('CONNECT_PARENT'), 750);
      }
    } else if (currentStage === 'CONNECT_PARENT') {
      // Auto-advance when wiring is connected
      const hasCardParent = cards.some((c) => !!c.groupId);
      const hasGroupParent = groups.some(
        (g) => g.kind === 'bundle' && Array.isArray(g.parentIds) && g.parentIds.length > 0
      );
      if (hasCardParent || hasGroupParent) {
        isAdvancingRef.current = true;
        setTourHints({});
        showToast('✓ 引线已建立！拖动父级可联动整条树状分支');
        setTimeout(() => setupStage('ALIGN_WIDTH'), 850);
      }
    } else if (currentStage === 'ALIGN_WIDTH') {
      // Auto-advance when sorting cards have uniform width
      const sortCards = cards.filter((c) => c.id.startsWith('tour-sort-'));
      if (sortCards.length >= 4) {
        const widths = sortCards.map((c) => Math.round(c.width));
        const minW = Math.min(...widths);
        const maxW = Math.max(...widths);
        if (maxW - minW <= 2) {
          isAdvancingRef.current = true;
          showToast('✓ 已统一宽度！');
          setTimeout(() => setupStage('PACK_WATERFALL'), 700);
        }
      }
    } else if (currentStage === 'PACK_WATERFALL') {
      // Auto-advance when positions changed from packing (Ctrl+P)
      const prevMap = sortCardPrevPositionsRef.current;
      const sortCards = cards.filter((c) => c.id.startsWith('tour-sort-'));
      let movedCount = 0;
      sortCards.forEach((c) => {
        const prev = prevMap[c.id];
        if (prev && (Math.abs(prev.x - c.x) > 10 || Math.abs(prev.y - c.y) > 10)) {
          movedCount++;
        }
      });

      if (movedCount >= 3) {
        isAdvancingRef.current = true;
        // Instantly stop bouncing!
        setTourHints({});
        showToast('✓ 已排成紧凑瀑布流！');
        setTimeout(() => setupStage('ALIGN_ARROWS'), 800);
      }
    } else if (currentStage === 'ALIGN_ARROWS') {
      // Auto-advance when positions aligned via Alt+Arrows
      const prevMap = sortCardPrevPositionsRef.current;
      const sortCards = cards.filter((c) => c.id.startsWith('tour-sort-'));
      let movedCount = 0;
      sortCards.forEach((c) => {
        const prev = prevMap[c.id];
        if (prev && (Math.abs(prev.x - c.x) > 5 || Math.abs(prev.y - c.y) > 5)) {
          movedCount++;
        }
      });

      if (movedCount >= 2) {
        isAdvancingRef.current = true;
        showToast('✓ 已完成避障对齐！');
        setTimeout(() => setupStage('COMPLETED'), 800);
      }
    }
  }, [cards, groups, isSandboxActive, currentStage, setupStage, showToast]);

  return {
    isHandbookOpen,
    setIsHandbookOpen,
    isSandboxActive,
    currentStage,
    tourHints,
    promptText,
    shortcutText,
    isCompleted,
    startTourSandbox,
    skipToNextStage,
    exitTour,
  };
}
