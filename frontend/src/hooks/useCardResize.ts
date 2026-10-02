import { useRef, useCallback } from 'react';
import { Card, Group } from '../types';
import { ResizeHandleDirection } from '../components/CardComponent';

export type GroupResizeHandle = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'se' | 'sw';

export function useCardResize() {
  const scalingCardRef = useRef<{ card: Card; startClientX: number; startW: number; startH: number } | null>(null);
  const resizingCardRef = useRef<{
    cardId: string;
    handle: ResizeHandleDirection;
    startScreenX: number;
    startScreenY: number;
    startCardX: number;
    startCardY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const resizingGroupRef = useRef<{
    groupId: string;
    handle: GroupResizeHandle;
    startScreenX: number;
    startScreenY: number;
    startGroupX: number;
    startGroupY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const startScale = useCallback((card: Card, startClientX: number) => {
    scalingCardRef.current = { card, startClientX, startW: card.width, startH: card.height };
  }, []);

  const startResize = useCallback((card: Card, handle: ResizeHandleDirection, screenX: number, screenY: number) => {
    resizingCardRef.current = {
      cardId: card.id,
      handle,
      startScreenX: screenX,
      startScreenY: screenY,
      startCardX: card.x,
      startCardY: card.y,
      startW: card.width,
      startH: card.height,
    };
  }, []);

  const startGroupResize = useCallback((group: Group, handle: GroupResizeHandle, screenX: number, screenY: number) => {
    resizingGroupRef.current = {
      groupId: group.id,
      handle,
      startScreenX: screenX,
      startScreenY: screenY,
      startGroupX: group.x,
      startGroupY: group.y,
      startW: group.width,
      startH: group.height,
    };
  }, []);

  const updateScale = useCallback((clientX: number, zoom: number, setCards: React.Dispatch<React.SetStateAction<Card[]>>) => {
    if (!scalingCardRef.current) return;
    const { card, startClientX, startW, startH } = scalingCardRef.current;
    const delta = (clientX - startClientX) / zoom;
    const aspectRatio = startW / startH;
    const newW = Math.max(startW + delta, 80);
    const newH = newW / aspectRatio;

    setCards((prev) => prev.map((c) => (c.id === card.id
      ? { ...c, width: newW, height: newH,
        defaultWidth: c.defaultWidth ?? c.width / (c.contentScale ?? 1),
        defaultHeight: c.defaultHeight ?? c.height / (c.contentScale ?? 1),
        sizeLocked: true } : c)));
  }, []);

  const updateResize = useCallback((screenX: number, screenY: number, zoom: number, setCards: React.Dispatch<React.SetStateAction<Card[]>>) => {
    if (!resizingCardRef.current) return;
    const { cardId, handle, startScreenX, startScreenY, startCardX, startCardY, startW, startH } = resizingCardRef.current;
    const deltaX = (screenX - startScreenX) / zoom;
    const deltaY = (screenY - startScreenY) / zoom;

    let newX = startCardX;
    let newY = startCardY;
    let newW = startW;
    let newH = startH;
    const minW = 80;
    const minH = 60;

    if (handle.includes('e')) newW = Math.max(minW, startW + deltaX);
    if (handle.includes('s')) newH = Math.max(minH, startH + deltaY);
    if (handle.includes('w')) {
      newW = Math.max(minW, startW - deltaX);
      newX = startCardX + (startW - newW);
    }
    if (handle.includes('n')) {
      newH = Math.max(minH, startH - deltaY);
      newY = startCardY + (startH - newH);
    }

    setCards((prev) => prev.map((c) => (c.id === cardId
      ? { ...c, x: newX, y: newY, width: newW, height: newH,
        defaultWidth: c.defaultWidth ?? c.width / (c.contentScale ?? 1),
        defaultHeight: c.defaultHeight ?? c.height / (c.contentScale ?? 1),
        sizeLocked: true } : c)));
  }, []);

  const updateGroupResize = useCallback((screenX: number, screenY: number, zoom: number, setGroups: React.Dispatch<React.SetStateAction<Group[]>>) => {
    if (!resizingGroupRef.current) return;
    const { groupId, handle, startScreenX, startScreenY, startGroupX, startGroupY, startW, startH } = resizingGroupRef.current;
    const deltaX = (screenX - startScreenX) / zoom;
    const deltaY = (screenY - startScreenY) / zoom;

    let newX = startGroupX;
    let newY = startGroupY;
    let newW = startW;
    let newH = startH;
    const minW = 160;
    const minH = 120;

    if (handle.includes('e')) newW = Math.max(minW, startW + deltaX);
    if (handle.includes('s')) newH = Math.max(minH, startH + deltaY);
    if (handle.includes('w')) {
      newW = Math.max(minW, startW - deltaX);
      newX = startGroupX + (startW - newW);
    }
    if (handle.includes('n')) {
      newH = Math.max(minH, startH - deltaY);
      newY = startGroupY + (startH - newH);
    }

    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, x: newX, y: newY, width: newW, height: newH } : g)));
  }, []);

  const resetResize = useCallback(() => {
    scalingCardRef.current = null;
    resizingCardRef.current = null;
    resizingGroupRef.current = null;
  }, []);

  return {
    scalingCardRef,
    resizingCardRef,
    resizingGroupRef,
    startScale,
    startResize,
    startGroupResize,
    updateScale,
    updateResize,
    updateGroupResize,
    resetResize,
  };
}
