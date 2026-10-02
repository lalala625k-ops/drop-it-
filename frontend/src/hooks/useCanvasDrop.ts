import React, { useCallback, MutableRefObject } from 'react';
import { Card, Group, Viewport } from '../types';
import { screenToWorld, computeFitViewport } from '../utils/canvas';
import { importBackupFromFile } from '../utils/storage';
import { ingestScreenshot } from '../utils/ingestScreenshot';

interface UseCanvasDropProps {
  viewportRef: MutableRefObject<Viewport>;
  mouseWorldRef: MutableRefObject<{ x: number; y: number }>;
  cardsRef: MutableRefObject<Card[]>;
  groupsRef: MutableRefObject<Group[]>;
  setViewport: (vp: Viewport) => void;
  commitState: (cards: Card[], groups: Group[]) => void;
  pushHistory: (cards: Card[], groups: Group[]) => void;
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
  setViewport,
  commitState,
  pushHistory,
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
      if (file?.name.toLowerCase().endsWith('.json')) {
        try {
          const restored = await importBackupFromFile(file);
          pushHistory(cardsRef.current, groupsRef.current);
          commitState(restored.cards, restored.groups);
          const fit = computeFitViewport(restored.cards, restored.groups, window.innerWidth, window.innerHeight);
          if (fit) setViewport(fit);
          showToast('已恢复备份');
        } catch {
          showToast('导入失败');
        }
        return;
      }

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
      pushHistory,
      commitState,
      setViewport,
      showToast,
      createCardAtCursor,
      handleCardUpdate,
      handleDroppedData,
    ]
  );

  return { handleDrop };
}
