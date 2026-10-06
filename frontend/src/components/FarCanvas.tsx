import { useEffect, useRef } from 'react';
import { Card, Group, Viewport } from '../types';

interface Props { cards: Card[]; groups: Group[]; viewport: Viewport }

export function FarCanvas({ cards, groups, viewport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(window.innerWidth * ratio);
    const pixelHeight = Math.round(window.innerHeight * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.style.width !== `${window.innerWidth}px`) canvas.style.width = `${window.innerWidth}px`;
    if (canvas.style.height !== `${window.innerHeight}px`) canvas.style.height = `${window.innerHeight}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const rect = (x: number, y: number, width: number, height: number) => {
      const px = viewport.x + x * viewport.zoom;
      const py = viewport.y + y * viewport.zoom;
      return { px, py, width: width * viewport.zoom, height: height * viewport.zoom };
    };
    for (const group of groups) {
      const box = rect(group.x, group.y, group.width || 120, group.height || 120);
      context.fillStyle = group.color || '#e1dfd8';
      context.globalAlpha = 0.18;
      context.fillRect(box.px, box.py, box.width, box.height);
      context.globalAlpha = 1;
      context.strokeStyle = group.color || '#55514c';
      context.lineWidth = 1;
      context.strokeRect(box.px, box.py, box.width, box.height);
    }
    for (const card of cards) {
      const box = rect(card.x, card.y, card.width, card.height);
      context.fillStyle = card.type === 'image' ? '#d7d4cd' : card.type === 'web' ? '#e8e6df' : '#fffefa';
      context.fillRect(box.px, box.py, box.width, box.height);
      context.strokeStyle = '#373633';
      context.lineWidth = 1;
      context.strokeRect(box.px, box.py, box.width, box.height);
      if (box.width > 12 && box.height > 10) {
        context.fillStyle = '#77736c';
        context.fillRect(box.px + 3, box.py + 4, Math.max(3, box.width * 0.6), 1);
      }
    }
  }, [cards, groups, viewport]);
  return <canvas ref={canvasRef} aria-hidden="true" className="far-canvas absolute inset-0 pointer-events-none" />;
}
