import { useRef, useCallback } from 'react';
import { Card, Group } from '../types';
import { ResizeHandleDirection } from '../components/CardComponent';

export type GroupResizeHandle = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'se' | 'sw';

import { getImageRatio, getImageCardTextHeight, imageRatioCache } from '../utils/imageCardRatio';

export function useCardResize() {
  const scalingCardRef = useRef<{
    card: Card;
    startClientX: number;
    startW: number;
    startH: number;
    imageRatio?: number;
    textHeight: number;
  } | null>(null);
  const resizingCardRef = useRef<{
    cardId: string;
    cardType: string;
    handle: ResizeHandleDirection;
    startScreenX: number;
    startScreenY: number;
    startCardX: number;
    startCardY: number;
    startW: number;
    startH: number;
    imageRatio?: number;
    textHeight: number;
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
    const isImage = card.type === 'image' || !!card.image;
    const imageRatio = isImage ? getImageRatio(card) : undefined;
    const textHeight = isImage ? getImageCardTextHeight(card) : 0;
    scalingCardRef.current = { card, startClientX, startW: card.width, startH: card.height, imageRatio, textHeight };
  }, []);

  const startResize = useCallback((card: Card, handle: ResizeHandleDirection, screenX: number, screenY: number) => {
    const isImage = card.type === 'image' || !!card.image;
    const imageRatio = isImage ? getImageRatio(card) : undefined;
    const textHeight = isImage ? getImageCardTextHeight(card) : 0;
    resizingCardRef.current = {
      cardId: card.id,
      cardType: card.type,
      handle,
      startScreenX: screenX,
      startScreenY: screenY,
      startCardX: card.x,
      startCardY: card.y,
      startW: card.width,
      startH: card.height,
      imageRatio,
      textHeight,
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
    const { card, startClientX, startW, startH, imageRatio, textHeight } = scalingCardRef.current;
    const delta = (clientX - startClientX) / zoom;
    const newW = Math.max(startW + delta, 80);
    let newH: number;

    if (imageRatio && imageRatio > 0) {
      newH = Math.max(60, Math.round(newW / imageRatio + textHeight));
    } else {
      const aspectRatio = startW / startH;
      newH = newW / aspectRatio;
    }

    setCards((prev) => prev.map((c) => (c.id === card.id
      ? { ...c, width: newW, height: newH,
        defaultWidth: c.defaultWidth ?? c.width / (c.contentScale ?? 1),
        defaultHeight: c.defaultHeight ?? c.height / (c.contentScale ?? 1),
        sizeLocked: true } : c)));
  }, []);

  const updateResize = useCallback((screenX: number, screenY: number, zoom: number, setCards: React.Dispatch<React.SetStateAction<Card[]>>) => {
    if (!resizingCardRef.current) return;
    const { cardId, cardType, handle, startScreenX, startScreenY, startCardX, startCardY, startW, startH, imageRatio, textHeight } = resizingCardRef.current;
    const deltaX = (screenX - startScreenX) / zoom;
    const deltaY = (screenY - startScreenY) / zoom;

    let newX = startCardX;
    let newY = startCardY;
    let newW = startW;
    let newH = startH;
    const minW = 80;
    const minH = 60;

    // For cards with images (both pure image cards and web cards with preview covers), dynamically adapt height or width
    if (imageRatio && imageRatio > 0) {
      if (handle === 'e' || handle === 'w') {
        if (handle === 'e') newW = Math.max(minW, startW + deltaX);
        else {
          newW = Math.max(minW, startW - deltaX);
          newX = startCardX + (startW - newW);
        }
        newH = Math.max(minH, Math.round(newW / imageRatio + textHeight));
      } else if (handle === 's' || handle === 'n') {
        if (handle === 's') newH = Math.max(minH, startH + deltaY);
        else {
          newH = Math.max(minH, startH - deltaY);
          newY = startCardY + (startH - newH);
        }
        newW = Math.max(minW, Math.round((newH - textHeight) * imageRatio));
      } else {
        // Corner handles: 'se', 'sw', 'ne', 'nw'
        let rawW = startW;
        if (handle.includes('e')) rawW = Math.max(minW, startW + deltaX);
        else if (handle.includes('w')) rawW = Math.max(minW, startW - deltaX);

        let rawH = startH;
        if (handle.includes('s')) rawH = Math.max(minH, startH + deltaY);
        else if (handle.includes('n')) rawH = Math.max(minH, startH - deltaY);

        const wDelta = Math.abs(rawW - startW);
        const hDelta = Math.abs(rawH - startH);

        if (wDelta >= hDelta * imageRatio) {
          newW = rawW;
          newH = Math.max(minH, Math.round(newW / imageRatio + textHeight));
        } else {
          newH = rawH;
          newW = Math.max(minW, Math.round((newH - textHeight) * imageRatio));
        }

        if (handle.includes('w')) newX = startCardX + (startW - newW);
        if (handle.includes('n')) newY = startCardY + (startH - newH);
      }
    } else {
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
