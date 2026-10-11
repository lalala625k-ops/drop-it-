import { useState, useRef, useCallback, MutableRefObject } from 'react';
import { Card, Group } from '../types';
import { saveStateDebounced } from '../utils/storage';
import { buildLinkCardUpdates, recognizeCardImage, ImageRecognitionMode,
  ReverseResolution, RecognitionReport } from '../utils/recognizeCardImage';
import { bundleBounds } from './useBundleGroups';
import { isFeishuUrl, FEISHU_LOGO_URLS } from '../utils/feishu';
import { manualSearchFallback } from '../utils/manualSearch';

export interface ActivePieMenuState {
  target: { kind: 'card'; card: Card } | { kind: 'bundle' | 'parent'; group: Group };
  selectedCardIds?: Set<string>;
  center: { x: number; y: number };
  pointer: { x: number; y: number };
  isRightMouseDown: boolean;
}

interface UsePieMenuStateProps {
  cardsRef: MutableRefObject<Card[]>;
  groupsRef: MutableRefObject<Group[]>;
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  pushHistory: (cards: Card[], groups: Group[]) => void;
  showToast: (msg: string) => void;
  onRecognitionReport?: (report: RecognitionReport) => void;
}

export function usePieMenuState({
  cardsRef,
  groupsRef,
  setCards,
  setGroups,
  pushHistory,
  showToast,
  onRecognitionReport,
}: UsePieMenuStateProps) {
  const [activePieMenu, setActivePieMenu] = useState<ActivePieMenuState | null>(null);
  const reparsingIdsRef = useRef<Set<string>>(new Set());
  const recognizingIdsRef = useRef<Set<string>>(new Set());
  const [resolutionPanel, setResolutionPanel] = useState<{
    cardId: string; resolution: ReverseResolution; text: string;
  } | null>(null);

  const openPieMenu = useCallback((card: Card, clientX: number, clientY: number,
    multiSelectedCardIds?: Set<string>, isRightMouseDown = false) => {
    setActivePieMenu({
      target: { kind: 'card', card },
      selectedCardIds: multiSelectedCardIds && multiSelectedCardIds.has(card.id) && multiSelectedCardIds.size > 1
        ? new Set(multiSelectedCardIds) : new Set([card.id]),
      center: { x: clientX, y: clientY },
      pointer: { x: clientX, y: clientY },
      isRightMouseDown,
    });
  }, []);

  const openGroupPieMenu = useCallback((group: Group, clientX: number, clientY: number,
    isRightMouseDown = false) => {
    setActivePieMenu({ target: { kind: group.kind === 'bundle' ? 'bundle' : 'parent', group },
      center: { x: clientX, y: clientY }, pointer: { x: clientX, y: clientY }, isRightMouseDown });
  }, []);

  const updatePieMenuPointer = useCallback((clientX: number, clientY: number) => {
    setActivePieMenu((prev) => (prev ? { ...prev, pointer: { x: clientX, y: clientY } } : null));
  }, []);

  const releasePieMenuMouseDown = useCallback((clientX: number, clientY: number) => {
    setActivePieMenu((prev) =>
      prev ? { ...prev, pointer: { x: clientX, y: clientY }, isRightMouseDown: false } : null
    );
  }, []);

  const closePieMenu = useCallback(() => {
    setActivePieMenu(null);
  }, []);

  const handleConfirmPieDate = useCallback(
    (cardId: string, dateStr: string | null) => {
      const selectedIds = activePieMenu?.selectedCardIds && activePieMenu.selectedCardIds.has(cardId) && activePieMenu.selectedCardIds.size > 1
        ? [...activePieMenu.selectedCardIds]
        : [cardId];

      if (activePieMenu?.target.kind !== 'card' && activePieMenu?.target.group.id === cardId) {
        pushHistory(cardsRef.current, groupsRef.current);
        const next = groupsRef.current.map((g) => g.id === cardId ? { ...g, reminder: dateStr } : g);
        setGroups(next); saveStateDebounced(cardsRef.current, next);
        setActivePieMenu(null);
        return;
      }
      pushHistory(cardsRef.current, groupsRef.current);
      setCards((prev) => {
        const next = prev.map((c) => (selectedIds.includes(c.id) ? { ...c, reminder: dateStr } : c));
        saveStateDebounced(next, groupsRef.current);
        return next;
      });
      setActivePieMenu(null);
    },
    [activePieMenu, cardsRef, groupsRef, pushHistory, setCards, setGroups]
  );

  const handleConfirmPieTitle = useCallback(
    (cardId: string, title: string | null) => {
      const selectedIds = activePieMenu?.selectedCardIds && activePieMenu.selectedCardIds.has(cardId) && activePieMenu.selectedCardIds.size > 1
        ? [...activePieMenu.selectedCardIds]
        : [cardId];

      if (activePieMenu?.target.kind !== 'card' && activePieMenu?.target.group.id === cardId) {
        pushHistory(cardsRef.current, groupsRef.current);
        const next = groupsRef.current.map((g) => g.id === cardId ? { ...g, title: title?.trim() || '' } : g);
        setGroups(next); saveStateDebounced(cardsRef.current, next);
        setActivePieMenu(null);
        return;
      }
      pushHistory(cardsRef.current, groupsRef.current);
      setCards((prev) => {
        const next = prev.map((c) => {
          if (selectedIds.includes(c.id)) {
            const cleanTitle = title ? title.trim() : null;
            return { ...c, headerTitle: cleanTitle || undefined };
          }
          return c;
        });
        saveStateDebounced(next, groupsRef.current);
        return next;
      });
      setActivePieMenu(null);
    },
    [activePieMenu, cardsRef, groupsRef, pushHistory, setCards, setGroups]
  );

  const handleTogglePieTag = useCallback(
    (cardId: string, tag: string) => {
      const cleanTag = tag.trim();
      if (!cleanTag) return;
      const selectedIds = activePieMenu?.selectedCardIds && activePieMenu.selectedCardIds.has(cardId) && activePieMenu.selectedCardIds.size > 1
        ? [...activePieMenu.selectedCardIds]
        : [cardId];

      if (activePieMenu?.target.kind !== 'card' && activePieMenu?.target.group.id === cardId) {
        pushHistory(cardsRef.current, groupsRef.current);
        const next = groupsRef.current.map((g) => {
          if (g.id !== cardId) return g;
          const tags = g.tags || [];
          return { ...g, tags: tags.includes(cleanTag) ? tags.filter((t) => t !== cleanTag) : [...tags, cleanTag] };
        });
        setGroups(next); saveStateDebounced(cardsRef.current, next);
        setActivePieMenu((menu) => menu?.target.kind === 'bundle'
          ? { ...menu, target: { ...menu.target, group: { ...menu.target.group,
            tags: next.find((g) => g.id === cardId)?.tags } } } : menu);
        return;
      }

      pushHistory(cardsRef.current, groupsRef.current);
      const targetCards = cardsRef.current.filter((c) => selectedIds.includes(c.id));
      const allHave = targetCards.every((c) => c.tags?.includes(cleanTag));

      setCards((prev) => {
        const next = prev.map((c) => {
          if (!selectedIds.includes(c.id)) return c;
          const currentTags = Array.isArray(c.tags) ? [...c.tags] : [];
          if (allHave) {
            const idx = currentTags.indexOf(cleanTag);
            if (idx >= 0) currentTags.splice(idx, 1);
          } else {
            if (!currentTags.includes(cleanTag)) currentTags.push(cleanTag);
          }
          return { ...c, tags: currentTags };
        });
        saveStateDebounced(next, groupsRef.current);
        return next;
      });
    },
    [activePieMenu, cardsRef, groupsRef, pushHistory, setCards, setGroups]
  );

  const handleGroupColor = useCallback((groupId: string, color: string) => {
    const group = groupsRef.current.find((item) => item.id === groupId);
    if (!group || group.kind === 'bundle' || group.color === color) { setActivePieMenu(null); return; }
    pushHistory(cardsRef.current, groupsRef.current);
    const next = groupsRef.current.map((item) => item.id === groupId ? { ...item, color } : item);
    setGroups(next);
    saveStateDebounced(cardsRef.current, next);
    setActivePieMenu(null);
  }, [cardsRef, groupsRef, pushHistory, setGroups]);

  const reparseSingleLink = useCallback(async (cardId: string) => {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card || card.type !== 'web' || !card.url) return;

    reparsingIdsRef.current.add(cardId);
    setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, isParsing: true } : c));

    try {
      const response = await fetch(`/api/fetch-metadata?url=${encodeURIComponent(card.url)}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const metadata = await response.json();
      const title = typeof metadata.title === 'string' && metadata.title.trim() !== card.url ? metadata.title.trim() : '';
      const feishu = isFeishuUrl(card.url);
      const hostname = new URL(card.url).hostname.toLowerCase();
      const medium = hostname === 'medium.com' || hostname.endsWith('.medium.com');
      const imageUrl = !feishu && typeof metadata.image === 'string' ? metadata.image.trim() : '';
      if (!title && !imageUrl) throw new Error('未取得标题或头图');

      let image = imageUrl;
      if (image) {
        image = await new Promise<string>((resolve) => {
          const preview = new Image();
          const timer = window.setTimeout(() => resolve(''), 8000);
          preview.referrerPolicy = 'no-referrer';
          preview.onload = () => { clearTimeout(timer); resolve(imageUrl); };
          preview.onerror = () => { clearTimeout(timer); resolve(''); };
          preview.src = imageUrl;
        });
      }
      if (imageUrl && !image && !title) throw new Error('头图无法加载');

      const current = cardsRef.current.find((c) => c.id === cardId);
      if (!current || current.url !== card.url) {
        setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, isParsing: false } : c));
        return;
      }
      pushHistory(cardsRef.current.map((c) => c.id === cardId ? { ...c, isParsing: false } : c), groupsRef.current);
      setCards((prev) => {
        const next = prev.map((c) => c.id === cardId && c.url === card.url ? {
          ...c,
          title: title || c.title,
          image,
          thumbnail: undefined,
          description: typeof metadata.description === 'string' ? metadata.description : c.description,
          favicon: feishu ? FEISHU_LOGO_URLS[0]
            : typeof metadata.favicon === 'string' ? metadata.favicon : c.favicon,
          height: (feishu || (medium && !image)) && !c.sizeLocked ? 90 : c.height,
          isParsing: false,
        } : c);
        saveStateDebounced(next, groupsRef.current);
        return next;
      });
      showToast(image && title
        ? '链接标题和头图已更新'
        : image
          ? '链接头图已更新'
          : imageUrl
            ? '标题已更新，头图加载失败'
            : '标题已更新，未取得头图');
    } catch (error) {
      console.warn('Link reparse failed:', error);
      setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, isParsing: false } : c));
      showToast('重新解析失败，原卡片已保留');
    } finally {
      reparsingIdsRef.current.delete(cardId);
    }
  }, [cardsRef, groupsRef, pushHistory, setCards, showToast]);

  const handleReparseLink = useCallback(async (cardId: string) => {
    const selectedIds = activePieMenu?.selectedCardIds && activePieMenu.selectedCardIds.has(cardId) && activePieMenu.selectedCardIds.size > 1
      ? [...activePieMenu.selectedCardIds]
      : [cardId];

    const targetCards = cardsRef.current.filter((c) => selectedIds.includes(c.id) && c.type === 'web' && c.url && !reparsingIdsRef.current.has(c.id));
    if (targetCards.length === 0) return;

    setActivePieMenu(null);
    showToast(targetCards.length > 1 ? `正在重新解析 ${targetCards.length} 个链接` : '正在重新解析链接');
    await Promise.all(targetCards.map((c) => reparseSingleLink(c.id)));
  }, [activePieMenu, cardsRef, reparseSingleLink, showToast]);

  const recognizeSingleImage = useCallback(async (cardId: string, mode: ImageRecognitionMode) => {
    const card = cardsRef.current.find((item) => item.id === cardId);
    if (!card || card.type !== 'image') return;
    recognizingIdsRef.current.add(cardId);
    setCards((prev) => prev.map((item) => item.id === cardId ? { ...item, isParsing: true } : item));
    let reported = false;
    try {
      const result = await recognizeCardImage(card, mode, (report) => {
        reported = true;
        onRecognitionReport?.(report);
      });
      const current = cardsRef.current.find((item) => item.id === cardId);
      if (!current || current.type !== 'image') return;
      if (!result) {
        setCards((prev) => prev.map((item) => item.id === cardId ? { ...item, isParsing: false } : item));
        showToast(mode === 'link' ? '未找到可信原链接，图片已保留' : '未识别到文字，图片已保留');
        return;
      }
      if (result.kind === 'review') {
        setCards((prev) => prev.map((item) => item.id === cardId ? { ...item, isParsing: false } : item));
        setResolutionPanel({ cardId, resolution: result.resolution, text: result.text });
        showToast(result.resolution.reason);
        return;
      }
      pushHistory(cardsRef.current.map((item) => item.id === cardId ? { ...item, isParsing: false } : item), groupsRef.current);
      const nextCards = cardsRef.current.map((item) => item.id === cardId ? {
        ...item, ...result.updates,
        defaultWidth: result.updates.width ?? item.width,
        defaultHeight: result.updates.height ?? item.height,
        sizeLocked: false,
      } : item);
      const nextGroups = groupsRef.current.map((group) => group.kind === 'bundle'
        ? bundleBounds(nextCards, group.id, group) : group);
      setCards(nextCards);
      setGroups(nextGroups);
      saveStateDebounced(nextCards, nextGroups);
      showToast(result.outcome === 'link' ? '已恢复原链接' : '已创建 OCR 文本卡片');
    } catch (error) {
      setCards((prev) => prev.map((item) => item.id === cardId ? { ...item, isParsing: false } : item));
      const message = error instanceof Error ? error.message : '图片识别失败，原图已保留';
      if (!reported) onRecognitionReport?.({ id: `${Date.now()}-${Math.random()}`,
        at: new Date().toLocaleTimeString(), cardId, mode, status: 'error', reason: message,
        events: [{ name: 'client', status: 'failed', detail: message }] });
      if (mode === 'link') setResolutionPanel({ cardId, text: '', resolution: {
        status: 'error', reason: message, stages: [], candidates: [],
        manual_search: manualSearchFallback(undefined, ''),
      } });
      showToast(message);
    } finally {
      recognizingIdsRef.current.delete(cardId);
    }
  }, [cardsRef, groupsRef, pushHistory, setCards, setGroups, showToast, onRecognitionReport]);

  const handleRecognizeImage = useCallback(async (cardId: string, mode: ImageRecognitionMode) => {
    const selectedIds = activePieMenu?.selectedCardIds && activePieMenu.selectedCardIds.has(cardId) && activePieMenu.selectedCardIds.size > 1
      ? [...activePieMenu.selectedCardIds]
      : [cardId];

    const targetCards = cardsRef.current.filter((c) => selectedIds.includes(c.id) && c.type === 'image' && !recognizingIdsRef.current.has(c.id));
    if (targetCards.length === 0) return;

    setActivePieMenu(null);
    setResolutionPanel(null);
    showToast(targetCards.length > 1 ? `正在识别 ${targetCards.length} 张图片...` : (mode === 'link' ? '正在识别图片原链接...' : '正在识别图片文字...'));
    await Promise.all(targetCards.map((c) => recognizeSingleImage(c.id, mode)));
  }, [activePieMenu, cardsRef, recognizeSingleImage, showToast]);

  const handleConfirmCandidate = useCallback(async (url: string) => {
    const panel = resolutionPanel;
    if (!panel) return;
    const listedCandidate = panel.resolution.candidates.find((candidate) => candidate.url === url);
    if (!listedCandidate && panel.resolution.search_page) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
            !['xiaohongshu.com', 'www.xiaohongshu.com'].includes(parsed.hostname) ||
            !/^\/(?:explore|discovery\/item)\/[A-Za-z0-9]+\/?$/.test(parsed.pathname)) {
          showToast('请粘贴小红书具体笔记的 HTTPS 链接');
          return;
        }
      } catch { showToast('笔记链接格式不正确'); return; }
    } else if (!listedCandidate) return;
    const card = cardsRef.current.find((item) => item.id === panel.cardId);
    if (!card || card.type !== 'image' || recognizingIdsRef.current.has(card.id)) return;
    const candidate = listedCandidate || { url, title: panel.resolution.clues?.title || url,
      author: panel.resolution.clues?.author || '', source: 'site' as const, score: 0 };
    recognizingIdsRef.current.add(card.id);
    setCards((prev) => prev.map((item) => item.id === card.id ? { ...item, isParsing: true } : item));
    try {
      const events: RecognitionReport['events'] = [];
      const updates = await buildLinkCardUpdates(card, url, candidate.title, panel.text,
        (event) => events.push(event));
      const current = cardsRef.current.find((item) => item.id === card.id);
      if (!current || current.type !== 'image') return;
      pushHistory(cardsRef.current.map((item) => item.id === card.id ? { ...item, isParsing: false } : item), groupsRef.current);
      const nextCards = cardsRef.current.map((item) => item.id === card.id ? {
        ...item, ...updates,
        defaultWidth: updates.width ?? item.width,
        defaultHeight: updates.height ?? item.height,
        sizeLocked: false,
      } : item);
      const nextGroups = groupsRef.current.map((group) => group.kind === 'bundle'
        ? bundleBounds(nextCards, group.id, group) : group);
      setCards(nextCards);
      setGroups(nextGroups);
      saveStateDebounced(nextCards, nextGroups);
      onRecognitionReport?.({ id: `${Date.now()}-${Math.random()}`, at: new Date().toLocaleTimeString(),
        cardId: card.id, mode: 'link', status: 'matched', reason: '手动确认候选并转换为网页卡',
        events: [{ name: 'manual_confirmation', status: 'completed', detail: candidate.title, url }, ...events],
        finalUrl: url });
      setResolutionPanel(null);
      showToast('已按确认的候选恢复原链接');
    } catch (error) {
      setCards((prev) => prev.map((item) => item.id === card.id ? { ...item, isParsing: false } : item));
      showToast(error instanceof Error ? error.message : '候选链接转换失败，原图已保留');
    } finally {
      recognizingIdsRef.current.delete(card.id);
    }
  }, [cardsRef, groupsRef, pushHistory, resolutionPanel, setCards, setGroups, showToast, onRecognitionReport]);

  return {
    activePieMenu,
    setActivePieMenu,
    openPieMenu,
    openGroupPieMenu,
    updatePieMenuPointer,
    releasePieMenuMouseDown,
    closePieMenu,
    handleConfirmPieDate,
    handleConfirmPieTitle,
    handleTogglePieTag,
    handleGroupColor,
    handleReparseLink,
    handleRecognizeImage,
    resolutionPanel,
    closeResolutionPanel: () => setResolutionPanel(null),
    handleConfirmCandidate,
  };
}
