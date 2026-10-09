import React, { useCallback, MutableRefObject } from 'react';
import { Card, Group, Viewport } from '../types';
import { screenToWorld } from '../utils/canvas';

interface UseCanvasDropProps {
  viewportRef: MutableRefObject<Viewport>;
  mouseWorldRef: MutableRefObject<{ x: number; y: number }>;
  cardsRef: MutableRefObject<Card[]>;
  groupsRef: MutableRefObject<Group[]>;
  createCardAtCursor: (cardData: Partial<Card>) => Card;
  handleCardUpdate: (id: string, updates: Partial<Card>) => void;
  handleDroppedData: (data: DataTransfer) => Promise<void>;
  showToast: (msg: string) => void;
}

export function useCanvasDrop({
  viewportRef,
  mouseWorldRef,
  cardsRef,
  groupsRef,
  createCardAtCursor,
  handleCardUpdate,
  handleDroppedData,
  showToast,
}: UseCanvasDropProps) {
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const dropWorld = screenToWorld(e.clientX, e.clientY, viewportRef.current);
      mouseWorldRef.current = dropWorld;
      // The shared intake checks site drag metadata before an accompanying
      // image file, preserving the Pin link when a browser supplies both.
      await handleDroppedData(e.dataTransfer);
    },
    [
      viewportRef,
      mouseWorldRef,
      cardsRef,
      groupsRef,
      showToast,
      createCardAtCursor,
      handleCardUpdate,
      handleDroppedData,
    ]
  );

  return { handleDrop };
}
