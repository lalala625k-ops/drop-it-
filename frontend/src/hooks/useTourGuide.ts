import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, Group, Viewport } from '../types';
import { CanvasPin } from './useCanvasPins';
import { TourCardHint } from '../components/CardComponent';

export type TourStepId =
  | 'STEP_1_BLANK_NEW_CARD'
  | 'STEP_2_PASTE_CARD'
  | 'STEP_3_WEB_CARD'
  | 'STEP_4_IMG_OCR_CARD'
  | 'STEP_5_GROUP'
  | 'STEP_6_DRAG_INTO_GROUP'
  | 'STEP_7_CREATE_PARENT'
  | 'STEP_8_WIRE_PARENT'
  | 'STEP_9_DRAG_PARENT'
  | 'STEP_10_DRAG_CHILD'
  | 'STEP_11_MESSY_COPY_PASTE'
  | 'STEP_12_UNIFORM_WIDTH'
  | 'STEP_13_PACK_WATERFALL'
  | 'STEP_14_ALIGN_ARROWS'
  | 'STEP_15_COMPLETED';

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
  const [currentStep, setCurrentStep] = useState<TourStepId>('STEP_1_BLANK_NEW_CARD');

  // Pre-tour snapshot
  const preTourSnapshotRef = useRef<{
    cards: Card[];
    groups: Group[];
    pins: CanvasPin[];
    viewport: Viewport;
  } | null>(null);

  // Center anchor
  const tourCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tour Hints for bouncing and badges
  const [tourHints, setTourHints] = useState<Record<string, TourCardHint>>({});

  // Concise prompt text & shortcut text
  const [promptText, setPromptText] = useState('');
  const [shortcutText, setShortcutText] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);

  // Auto-advance guard
  const isAdvancingRef = useRef(false);

  // Tracking references for actions
  const prevCardsCountRef = useRef(0);
  const trackedParentIdRef = useRef<string | null>(null);
  const parentStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const childStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const sortCardPrevPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // Switch to a tour step
  const setupStep = useCallback(
    (step: TourStepId) => {
      setCurrentStep(step);
      isAdvancingRef.current = false;
      const cx = tourCenterRef.current.x;
      const cy = tourCenterRef.current.y;

      switch (step) {
        case 'STEP_1_BLANK_NEW_CARD': {
          setIsCompleted(false);
          // Completely blank canvas!
          commitState([], []);
          canvasPins.replacePins([]);
          prevCardsCountRef.current = 0;
          setTourHints({});
          setPromptText('按下 Ctrl+N 新建一张文本便签');
          setShortcutText('快捷键：Ctrl+N');
          break;
        }

        case 'STEP_2_PASTE_CARD': {
          setTourHints({});
          prevCardsCountRef.current = cardsRef.current.length;
          setPromptText('按下 Ctrl+V 粘贴内容新建便签');
          setShortcutText('快捷键：Ctrl+V 粘贴新建');
          break;
        }

        case 'STEP_3_WEB_CARD': {
          // Add Web parsing card
          const webCard: Card = {
            id: 'tour-web-card',
            type: 'web',
            x: cx + 120,
            y: cy - 70,
            width: 220,
            height: 125,
            zIndex: 102,
            title: '随想无界看板 · 核心架构',
            url: 'https://github.com/lalala625k-ops/note2026',
            description: '无限二维画布上的轻量知识收集与整理看板',
          };
          commitState([...cardsRef.current, webCard], groupsRef.current);
          setTourHints({
            'tour-web-card': { label: '网页便签 (已解析)', bounce: false },
          });
          setPromptText('网页链接可自动解析标题与封面，形成独立网页卡片');
          setShortcutText('粘贴任何 URL 链接');

          // Auto-advance to image card demonstration after 1.8s
          setTimeout(() => {
            if (!isAdvancingRef.current) setupStep('STEP_4_IMG_OCR_CARD');
          }, 1800);
          break;
        }

        case 'STEP_4_IMG_OCR_CARD': {
          // Add image card
          const imgCard: Card = {
            id: 'tour-img-card',
            type: 'image',
            x: cx - 110,
            y: cy + 85,
            width: 210,
            height: 120,
            zIndex: 103,
            image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="210" height="120" viewBox="0 0 210 120"><rect width="210" height="120" fill="%23f0eee6"/><text x="105" y="55" font-family="sans-serif" font-size="13" font-weight="bold" fill="%231d1d1d" text-anchor="middle">✦ 样例截图便签</text><text x="105" y="80" font-family="sans-serif" font-size="10" fill="%23666666" text-anchor="middle">右键 10点识字 / 11点溯源</text></svg>`,
          };
          commitState([...cardsRef.current, imgCard], groupsRef.current);
          setTourHints({
            'tour-img-card': { label: '图片便签 (右键识字/溯源)', bounce: false },
          });
          setPromptText('图片便签右键可 OCR 识字提取正文，或反向识别原链接');
          setShortcutText('右键轮盘 10点识字 · 11点溯源');

          // Auto-advance to grouping step after 2.0s
          setTimeout(() => {
            if (!isAdvancingRef.current) setupStep('STEP_5_GROUP');
          }, 2000);
          break;
        }

        case 'STEP_5_GROUP': {
          // All created cards remain on canvas!
          // Pick two cards to bounce
          const activeCards = cardsRef.current;
          const cardA = activeCards[0]?.id || 'tour-text-1';
          const cardB = activeCards[1]?.id || 'tour-web-card';

          setTourHints({
            [cardA]: { label: '框选我', bounce: true },
            [cardB]: { label: '框选我', bounce: true },
          });
          setPromptText('框选左侧两张便签，按下 Ctrl+G 打包成组');
          setShortcutText('快捷键：Ctrl+G 打包成组');
          break;
        }

        case 'STEP_6_DRAG_INTO_GROUP': {
          // Identify unbundled card
          const unbundled = cardsRef.current.find((c) => !c.bundleId);
          if (unbundled) {
            setTourHints({
              [unbundled.id]: { label: '拖我入组', bounce: true },
            });
          }
          setPromptText('按住左键拖动未入组便签，放进虚线框内动态入组');
          setShortcutText('拖拽进入 Group 虚线多边形内部');
          break;
        }

        case 'STEP_7_CREATE_PARENT': {
          setTourHints({});
          setPromptText('按下 Ctrl+J (或 Ctrl+D) 新建一个圆形父物体');
          setShortcutText('快捷键：Ctrl+J 或 Ctrl+D');
          break;
        }

        case 'STEP_8_WIRE_PARENT': {
          const parentGroup = groupsRef.current.find((g) => g.kind === 'parent');
          const parentId = parentGroup?.id || 'tour-parent-node';
          trackedParentIdRef.current = parentId;

          // Make a lower card bounce to prompt wiring
          const firstCard = cardsRef.current[0];
          setTourHints({
            ...(firstCard ? { [firstCard.id]: { label: '按住 Ctrl+Shift 拖出引线', bounce: true } } : {}),
            [parentId]: { label: '松手连接至我', bounce: false },
          });
          setPromptText('按住 Ctrl+Shift 从便签边缘拖出引线，连接至圆形父物体');
          setShortcutText('快捷键：按住 Ctrl+Shift 拖拽建立引线');
          break;
        }

        case 'STEP_9_DRAG_PARENT': {
          setTourHints({});
          const parentGroup = groupsRef.current.find((g) => g.kind === 'parent');
          if (parentGroup) {
            parentStartPosRef.current = { x: parentGroup.x, y: parentGroup.y };
            setTourHints({
              [parentGroup.id]: { label: '拖动我', bounce: true },
            });
          }
          setPromptText('按住左键拖动圆形父物体，整条分支将同步位移');
          setShortcutText('拖拽圆形父物体');
          break;
        }

        case 'STEP_10_DRAG_CHILD': {
          setTourHints({});
          const childCard = cardsRef.current.find((c) => c.groupId || c.bundleId) || cardsRef.current[0];
          if (childCard) {
            childStartPosRef.current = { x: childCard.x, y: childCard.y };
            setTourHints({
              [childCard.id]: { label: '拖动我', bounce: true },
            });
          }
          setPromptText('拖动下方的子便签，它可在分支内自由调整相对位置');
          setShortcutText('拖拽子便签');
          break;
        }

        case 'STEP_11_MESSY_COPY_PASTE': {
          setTourHints({});
          setPromptText('框选便签，按 Ctrl+C 复制后按 Ctrl+V 大量粘贴');
          setShortcutText('快捷键：Ctrl+C 复制 ➔ Ctrl+V 粘贴');
          break;
        }

        case 'STEP_12_UNIFORM_WIDTH': {
          // Provide 6 cards of distinctly different sizes, NO headerTitle
          const messyCards: Card[] = [
            { id: 'tour-sort-1', type: 'text', x: cx - 290, y: cy + 120, width: 160, height: 90, zIndex: 110, content: '✦ 模块 A\n网络协议解析' },
            { id: 'tour-sort-2', type: 'text', x: cx - 100, y: cy + 110, width: 240, height: 125, zIndex: 111, content: '✦ 模块 B\n离线缓存与 IndexedDB 暂存' },
            { id: 'tour-sort-3', type: 'text', x: cx + 170, y: cy + 125, width: 180, height: 100, zIndex: 112, content: '✦ 模块 C\nSVG 连线与凸包轮廓计算' },
            { id: 'tour-sort-4', type: 'text', x: cx - 280, y: cy + 245, width: 260, height: 130, zIndex: 113, content: '✦ 模块 D\n本地完整 .note 格式打包归档' },
            { id: 'tour-sort-5', type: 'text', x: cx + 10,  y: cy + 260, width: 200, height: 110, zIndex: 114, content: '✦ 模块 E\n高精度 OCR 与原链接视觉识别' },
            { id: 'tour-sort-6', type: 'text', x: cx + 240, y: cy + 250, width: 220, height: 95, zIndex: 115, content: '✦ 模块 F\n自定义快捷键与多端配置持久化' },
          ];

          const existingCards = cardsRef.current.filter((c) => !c.id.startsWith('tour-sort-'));
          commitState([...existingCards, ...messyCards], groupsRef.current);

          setTourHints({
            'tour-sort-1': { label: '右键均宽', bounce: true },
            'tour-sort-2': { label: '右键均宽', bounce: true },
            'tour-sort-3': { label: '右键均宽', bounce: true },
            'tour-sort-4': { label: '右键均宽', bounce: true },
            'tour-sort-5': { label: '右键均宽', bounce: true },
            'tour-sort-6': { label: '右键均宽', bounce: true },
          });

          const posMap: Record<string, { x: number; y: number }> = {};
          messyCards.forEach((c) => {
            posMap[c.id] = { x: c.x, y: c.y };
          });
          sortCardPrevPositionsRef.current = posMap;

          setPromptText('框选这些大小不一的便签，右键轮盘选择“均宽”');
          setShortcutText('右键轮盘 ➔ 均宽');
          break;
        }

        case 'STEP_13_PACK_WATERFALL': {
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

          setPromptText('按下 Ctrl+P，一键规整排版为紧凑瀑布流');
          setShortcutText('快捷键：Ctrl+P 自动装箱排版');
          break;
        }

        case 'STEP_14_ALIGN_ARROWS': {
          // User rule: ONCE PACKED/ALIGNED, STOP BOUNCING!
          setTourHints({});

          const posMap: Record<string, { x: number; y: number }> = {};
          cardsRef.current
            .filter((c) => c.id.startsWith('tour-sort-'))
            .forEach((c) => {
              posMap[c.id] = { x: c.x, y: c.y };
            });
          sortCardPrevPositionsRef.current = posMap;

          setPromptText('按住 Alt + 键盘方向键（↑ ↓ ← →），体验 5px 边缘避障对齐');
          setShortcutText('快捷键：Alt + 方向键（↑ ↓ ← →）');
          break;
        }

        case 'STEP_15_COMPLETED': {
          setTourHints({});
          setIsCompleted(true);
          setPromptText('🎉 教学全部完成！已自动全览整体知识树结构');
          setShortcutText('');

          // Auto-trigger smooth fit overview
          setTimeout(() => {
            onFitCanvas?.();
          }, 150);
          break;
        }
      }
    },
    [cardsRef, groupsRef, commitState, canvasPins, onFitCanvas]
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
    setupStep('STEP_1_BLANK_NEW_CARD');
    showToast('已进入空白画布教学，请按提示操作');
  }, [cardsRef, groupsRef, canvasPins, viewportRef, setupStep, showToast]);

  // Exit Tour
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
        showToast('教学完成！当前知识树已保留，尽情开始创作吧');
      }
      preTourSnapshotRef.current = null;
    },
    [commitState, canvasPins, setViewport, showToast]
  );

  // Skip step manually
  const skipToNextStage = useCallback(() => {
    const steps: TourStepId[] = [
      'STEP_1_BLANK_NEW_CARD',
      'STEP_2_PASTE_CARD',
      'STEP_3_WEB_CARD',
      'STEP_4_IMG_OCR_CARD',
      'STEP_5_GROUP',
      'STEP_6_DRAG_INTO_GROUP',
      'STEP_7_CREATE_PARENT',
      'STEP_8_WIRE_PARENT',
      'STEP_9_DRAG_PARENT',
      'STEP_10_DRAG_CHILD',
      'STEP_11_MESSY_COPY_PASTE',
      'STEP_12_UNIFORM_WIDTH',
      'STEP_13_PACK_WATERFALL',
      'STEP_14_ALIGN_ARROWS',
      'STEP_15_COMPLETED',
    ];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex >= 0 && currentIndex < steps.length - 1) {
      setupStep(steps[currentIndex + 1]);
    }
  }, [currentStep, setupStep]);

  // Keydown listener for Sandbox shortcuts (e.g. Ctrl+V fallback, Ctrl+D / Ctrl+J parent)
  useEffect(() => {
    if (!isSandboxActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (currentStep === 'STEP_2_PASTE_CARD' && isCtrlOrMeta && (e.key === 'v' || e.key === 'V')) {
        // Fallback: spawn a pasted card if system clipboard doesn't populate
        setTimeout(() => {
          if (cardsRef.current.length <= prevCardsCountRef.current && !isAdvancingRef.current) {
            const cx = tourCenterRef.current.x;
            const cy = tourCenterRef.current.y;
            const pastedCard: Card = {
              id: 'tour-pasted-card',
              type: 'text',
              x: cx - 110,
              y: cy - 70,
              width: 200,
              height: 120,
              zIndex: 101,
              content: '✦ 粘贴便签\n系统剪贴板文本与链接可随时一键落入画布。',
            };
            commitState([...cardsRef.current, pastedCard], groupsRef.current);
          }
        }, 200);
      }

      if (currentStep === 'STEP_7_CREATE_PARENT' && isCtrlOrMeta && (e.key === 'd' || e.key === 'D' || e.key === 'j' || e.key === 'J')) {
        // Fallback: ensure parent circle is created even if Ctrl+D is pressed
        setTimeout(() => {
          const hasParent = groupsRef.current.some((g) => g.kind === 'parent');
          if (!hasParent) {
            const cx = tourCenterRef.current.x;
            const cy = tourCenterRef.current.y;
            const parentGroup: Group = {
              id: 'tour-parent-node',
              title: '核心父物体',
              x: cx - 60,
              y: cy - 200,
              width: 120,
              height: 120,
              color: '#FACB0E',
              kind: 'parent',
              zIndex: 90,
            };
            commitState(cardsRef.current, [...groupsRef.current, parentGroup]);
          }
        }, 150);
      }

      if (currentStep === 'STEP_11_MESSY_COPY_PASTE' && isCtrlOrMeta && (e.key === 'v' || e.key === 'V')) {
        // When user pastes in messy step, auto-advance to uniform width!
        setTimeout(() => {
          if (!isAdvancingRef.current) {
            isAdvancingRef.current = true;
            showToast('✓ 已产生大量错落便签！进入排版规整教学');
            setTimeout(() => setupStep('STEP_12_UNIFORM_WIDTH'), 700);
          }
        }, 250);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isSandboxActive, currentStep, cardsRef, groupsRef, commitState, setupStep, showToast]);

  // Reactive Auto-Detection Loop
  useEffect(() => {
    if (!isSandboxActive || isAdvancingRef.current) return;

    if (currentStep === 'STEP_1_BLANK_NEW_CARD') {
      // Advance when first card is created (Ctrl+N)
      if (cards.length > 0) {
        isAdvancingRef.current = true;
        showToast('✓ 已新建文本便签！');
        setTimeout(() => setupStep('STEP_2_PASTE_CARD'), 750);
      }
    } else if (currentStep === 'STEP_2_PASTE_CARD') {
      // Advance when second card is pasted (Ctrl+V)
      if (cards.length > prevCardsCountRef.current) {
        isAdvancingRef.current = true;
        showToast('✓ 已粘贴新建便签！');
        setTimeout(() => setupStep('STEP_3_WEB_CARD'), 750);
      }
    } else if (currentStep === 'STEP_5_GROUP') {
      // Advance when group is created (Ctrl+G)
      const hasBundle = groups.some((g) => g.kind === 'bundle');
      if (hasBundle) {
        isAdvancingRef.current = true;
        setTourHints({});
        showToast('✓ 已成功打包为 Group！');
        setTimeout(() => setupStep('STEP_6_DRAG_INTO_GROUP'), 750);
      }
    } else if (currentStep === 'STEP_6_DRAG_INTO_GROUP') {
      // Advance when all cards belong to bundle
      const allInBundle = cards.length > 0 && cards.every((c) => !!c.bundleId);
      if (allInBundle) {
        isAdvancingRef.current = true;
        setTourHints({});
        showToast('✓ 已动态吸收入组！');
        setTimeout(() => setupStep('STEP_7_CREATE_PARENT'), 750);
      }
    } else if (currentStep === 'STEP_7_CREATE_PARENT') {
      // Advance when parent group exists
      const hasParent = groups.some((g) => g.kind === 'parent');
      if (hasParent) {
        isAdvancingRef.current = true;
        showToast('✓ 已新建圆形父物体！');
        setTimeout(() => setupStep('STEP_8_WIRE_PARENT'), 750);
      }
    } else if (currentStep === 'STEP_8_WIRE_PARENT') {
      // Advance when wiring connects to parent
      const parent = groups.find((g) => g.kind === 'parent');
      const hasCardParent = cards.some((c) => c.groupId === parent?.id);
      const hasGroupParent = groups.some(
        (g) => g.kind === 'bundle' && Array.isArray(g.parentIds) && g.parentIds.includes(parent?.id || '')
      );
      if (hasCardParent || hasGroupParent) {
        isAdvancingRef.current = true;
        setTourHints({});
        showToast('✓ 引线已建立！');
        setTimeout(() => setupStep('STEP_9_DRAG_PARENT'), 800);
      }
    } else if (currentStep === 'STEP_9_DRAG_PARENT') {
      // Advance when parent moved
      const parent = groups.find((g) => g.kind === 'parent');
      const start = parentStartPosRef.current;
      if (parent && start) {
        const dist = Math.hypot(parent.x - start.x, parent.y - start.y);
        if (dist > 15) {
          isAdvancingRef.current = true;
          showToast('✓ 分支已联动同步位移！');
          setTimeout(() => setupStep('STEP_10_DRAG_CHILD'), 800);
        }
      }
    } else if (currentStep === 'STEP_10_DRAG_CHILD') {
      // Advance when child card moved
      const child = cards.find((c) => c.groupId || c.bundleId) || cards[0];
      const start = childStartPosRef.current;
      if (child && start) {
        const dist = Math.hypot(child.x - start.x, child.y - start.y);
        if (dist > 15) {
          isAdvancingRef.current = true;
          showToast('✓ 子物体相对位置已调整！');
          setTimeout(() => setupStep('STEP_11_MESSY_COPY_PASTE'), 800);
        }
      }
    } else if (currentStep === 'STEP_12_UNIFORM_WIDTH') {
      // Advance when sort cards have uniform width
      const sortCards = cards.filter((c) => c.id.startsWith('tour-sort-'));
      if (sortCards.length >= 4) {
        const widths = sortCards.map((c) => Math.round(c.width));
        const minW = Math.min(...widths);
        const maxW = Math.max(...widths);
        if (maxW - minW <= 2) {
          isAdvancingRef.current = true;
          showToast('✓ 已统一宽度！');
          setTimeout(() => setupStep('STEP_13_PACK_WATERFALL'), 700);
        }
      }
    } else if (currentStep === 'STEP_13_PACK_WATERFALL') {
      // Advance when packed (Ctrl+P)
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
        showToast('✓ 已完成紧凑瀑布流装箱！');
        setTimeout(() => setupStep('STEP_14_ALIGN_ARROWS'), 800);
      }
    } else if (currentStep === 'STEP_14_ALIGN_ARROWS') {
      // Advance when aligned via Alt+Arrows
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
        setTimeout(() => setupStep('STEP_15_COMPLETED'), 800);
      }
    }
  }, [cards, groups, isSandboxActive, currentStep, setupStep, showToast]);

  return {
    isHandbookOpen,
    setIsHandbookOpen,
    isSandboxActive,
    currentStep,
    tourHints,
    promptText,
    shortcutText,
    isCompleted,
    startTourSandbox,
    skipToNextStage,
    exitTour,
  };
}
