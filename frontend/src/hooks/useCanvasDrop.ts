import React, { useCallback, MutableRefObject } from 'react';
import { Card, Group, Viewport } from '../types';
import { screenToWorld } from '../utils/canvas';
import { ingestScreenshot } from '../utils/ingestScreenshot';

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
      const file = e.dataTransfer.files?.[0];
      if (file && (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(file.name))) {
        await ingestScreenshot(file, {
          createCard: createCardAtCursor,
          updateCard: handleCardUpdate,
          getCard: (id) => cardsRef.current.find((card) => card.id === id),
          showToast,
          position: dropWorld,
        });
        return;
      }
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
