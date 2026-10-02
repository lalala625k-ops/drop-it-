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
    const id = activePieMenu.target.kind === 'card'
      ? activePieMenu.target.card.id : activePieMenu.target.group.id;
    const bundle = activePieMenu.target.kind === 'bundle'
      ? canvas.querySelector<HTMLElement>(`[data-bundle-id="${CSS.escape(id)}"]`) : null;
    const source = bundle || (activePieMenu.target.kind !== 'card'
      ? canvas.querySelector<HTMLElement>(`[data-group-id="${CSS.escape(id)}"]`)
      : canvas.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`));
    if (!source) return;

    const sources: HTMLElement[] = [source];
    if (bundle) {
      const memberIds = new Set(cards.filter((card) => card.bundleId === id).map((card) => card.id));
      canvas.querySelectorAll<HTMLElement>('[data-card-id]').forEach((element) => {
        if (memberIds.has(element.dataset.cardId || '')) sources.push(element);
      });
    }
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
  }, [activePieMenu.target, cards, viewport.x, viewport.y, viewport.zoom]);

  return <>
    <div className="fixed inset-0 z-[10001] bg-ink/30 backdrop-blur-sm animate-in fade-in duration-150 pointer-events-none" aria-hidden="true" />
    <div ref={focusRef} className="fixed inset-0 z-[10001] pointer-events-none [&_*]:!pointer-events-none"
      aria-hidden="true" />
  </>;
};
