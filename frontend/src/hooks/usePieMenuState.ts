import { useState, useRef, useCallback, MutableRefObject } from 'react';
import { Card, Group } from '../types';
import { saveStateDebounced } from '../utils/storage';
import { recognizeCardImage, ImageRecognitionMode } from '../utils/recognizeCardImage';
import { bundleBounds } from './useBundleGroups';
import { isFeishuUrl, FEISHU_LOGO_URLS } from '../utils/feishu';

export interface ActivePieMenuState {
  target: { kind: 'card'; card: Card } | { kind: 'bundle' | 'parent'; group: Group };
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
}

export function usePieMenuState({
  cardsRef,
  groupsRef,
  setCards,
  setGroups,
  pushHistory,
  showToast,
}: UsePieMenuStateProps) {
  const [activePieMenu, setActivePieMenu] = useState<ActivePieMenuState | null>(null);
  const reparsingIdsRef = useRef<Set<string>>(new Set());
  const recognizingIdsRef = useRef<Set<string>>(new Set());

  const openPieMenu = useCallback((card: Card, clientX: number, clientY: number) => {
    setActivePieMenu({
      target: { kind: 'card', card },
      center: { x: clientX, y: clientY },
      pointer: { x: clientX, y: clientY },
      isRightMouseDown: true,
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
      if (activePieMenu?.target.kind !== 'card' && activePieMenu?.target.group.id === cardId) {
        pushHistory(cardsRef.current, groupsRef.current);
        const next = groupsRef.current.map((g) => g.id === cardId ? { ...g, reminder: dateStr } : g);
        setGroups(next); saveStateDebounced(cardsRef.current, next);
        setActivePieMenu(null);
        return;
      }
      pushHistory(cardsRef.current, groupsRef.current);
      setCards((prev) => {
        const next = prev.map((c) => (c.id === cardId ? { ...c, reminder: dateStr } : c));
        saveStateDebounced(next, groupsRef.current);
        return next;
      });
      showToast(dateStr ? `已标记日期: ${dateStr}` : '已清除标记日期');
      setActivePieMenu(null);
    },
    [activePieMenu, cardsRef, groupsRef, pushHistory, setCards, setGroups, showToast]
  );

  const handleConfirmPieTitle = useCallback(
    (cardId: string, title: string | null) => {
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
          if (c.id === cardId) {
            const cleanTitle = title ? title.trim() : null;
            return { ...c, headerTitle: cleanTitle || undefined };
          }
          return c;
        });
        saveStateDebounced(next, groupsRef.current);
        return next;
      });
      showToast(title && title.trim() ? `已设置卡片顶部标题: ${title.trim()}` : '已清除卡片顶部标题');
      setActivePieMenu(null);
    },
    [activePieMenu, cardsRef, groupsRef, pushHistory, setCards, setGroups, showToast]
  );

  const handleTogglePieTag = useCallback(
    (cardId: string, tag: string) => {
      const cleanTag = tag.trim();
      if (!cleanTag) return;

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
      setCards((prev) => {
        const next = prev.map((c) => {
          if (c.id !== cardId) return c;
          const currentTags = Array.isArray(c.tags) ? [...c.tags] : [];
          const idx = currentTags.indexOf(cleanTag);
          if (idx >= 0) {
            currentTags.splice(idx, 1);
            showToast(`已移除标签「${cleanTag}」`);
          } else {
            currentTags.push(cleanTag);
            showToast(`已添加标签「${cleanTag}」`);
          }
          return { ...c, tags: currentTags };
        });
        saveStateDebounced(next, groupsRef.current);
        return next;
      });
    },
    [activePieMenu, cardsRef, groupsRef, pushHistory, setCards, setGroups, showToast]
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

  const handleReparseLink = useCallback(async (cardId: string) => {
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card || card.type !== 'web' || !card.url || reparsingIdsRef.current.has(cardId)) return;

    reparsingIdsRef.current.add(cardId);
    setActivePieMenu(null);
    setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, isParsing: true } : c));
    showToast('正在重新解析链接');

    try {
      const response = await fetch(`/api/fetch-metadata?url=${encodeURIComponent(card.url)}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const metadata = await response.json();
      const title = typeof metadata.title === 'string' && metadata.title.trim() !== card.url ? metadata.title.trim() : '';
      const feishu = isFeishuUrl(card.url);
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
          description: typeof metadata.description === 'string' ? metadata.description : c.description,
          favicon: feishu ? FEISHU_LOGO_URLS[0]
            : typeof metadata.favicon === 'string' ? metadata.favicon : c.favicon,
          height: feishu && !c.sizeLocked ? 90 : c.height,
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

  const handleRecognizeImage = useCallback(async (cardId: string, mode: ImageRecognitionMode) => {
    const card = cardsRef.current.find((item) => item.id === cardId);
    if (!card || card.type !== 'image' || recognizingIdsRef.current.has(cardId)) return;
    recognizingIdsRef.current.add(cardId);
    setActivePieMenu(null);
    setCards((prev) => prev.map((item) => item.id === cardId ? { ...item, isParsing: true } : item));
    try {
      const result = await recognizeCardImage(card, mode);
      const current = cardsRef.current.find((item) => item.id === cardId);
      if (!current || current.type !== 'image') return;
      if (!result) {
        setCards((prev) => prev.map((item) => item.id === cardId ? { ...item, isParsing: false } : item));
        showToast(mode === 'link' ? '未找到可信原链接，图片已保留' : '未识别到文字，图片已保留');
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
      showToast(error instanceof Error ? error.message : '图片识别失败，原图已保留');
    } finally {
      recognizingIdsRef.current.delete(cardId);
    }
  }, [cardsRef, groupsRef, pushHistory, setCards, setGroups, showToast]);

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
  };
}
