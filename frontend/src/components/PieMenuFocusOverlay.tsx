import React, { useLayoutEffect, useRef } from 'react';
import { ActivePieMenuState } from '../hooks/usePieMenuState';
import { Card, Viewport } from '../types';

interface Props {
  activePieMenu: ActivePieMenuState;
  cards: Card[];
  viewport: Viewport;
}

export const PieMenuFocusOverlay: React.FC<Props> = ({ activePieMenu, cards, viewport }) => {
  const focusRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const holder = focusRef.current;
    const canvas = document.querySelector('[data-canvas-surface]');
    if (!holder || !canvas) return;
    const sources: HTMLElement[] = [];
    if (activePieMenu.target.kind === 'card') {
      const selectedIds = activePieMenu.selectedCardIds && activePieMenu.selectedCardIds.size > 1
        ? activePieMenu.selectedCardIds
        : new Set([activePieMenu.target.card.id]);
      selectedIds.forEach((cardId) => {
        const el = canvas.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`);
        if (el) sources.push(el);
      });
    } else {
      const id = activePieMenu.target.group.id;
      const bundle = activePieMenu.target.kind === 'bundle'
        ? canvas.querySelector<HTMLElement>(`[data-bundle-id="${CSS.escape(id)}"]`) : null;
      const source = bundle || canvas.querySelector<HTMLElement>(`[data-group-id="${CSS.escape(id)}"]`);
      if (source) {
        sources.push(source);
        if (bundle) {
          const memberIds = new Set(cards.filter((card) => card.bundleId === id).map((card) => card.id));
          canvas.querySelectorAll<HTMLElement>('[data-card-id]').forEach((element) => {
            if (memberIds.has(element.dataset.cardId || '')) sources.push(element);
          });
        }
      }
    }
    if (sources.length === 0) return;
    holder.replaceChildren(...sources.map((element) => {
      const rect = element.getBoundingClientRect();
      const wrapper = document.createElement('div');
      wrapper.style.position = 'absolute';
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.width = `${rect.width / viewport.zoom}px`;
      wrapper.style.height = `${rect.height / viewport.zoom}px`;
      wrapper.style.transform = `scale(${viewport.zoom})`;
      wrapper.style.transformOrigin = 'top left';
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.left = '0px';
      clone.style.top = '0px';
      clone.style.transform = 'none';
      wrapper.appendChild(clone);
      return wrapper;
    }));
    return () => holder.replaceChildren();
  }, [activePieMenu.target, activePieMenu.selectedCardIds, cards, viewport.x, viewport.y, viewport.zoom]);

  return <>
    <div className="fixed inset-0 z-[10001] bg-ink/30 backdrop-blur-sm animate-in fade-in duration-150 pointer-events-none" aria-hidden="true" />
    <div ref={focusRef} className="fixed inset-0 z-[10001] pointer-events-none [&_*]:!pointer-events-none"
      aria-hidden="true" />
  </>;
};
