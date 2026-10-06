import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, WheelEvent } from 'react';
import type { TreeBounds } from './settingsTreeLayout';

const fitZoom = (width: number, height: number, bounds: TreeBounds) =>
  Math.max(0.15, Math.min(1, (width - 80) / bounds.width, (height - 140) / bounds.height));

export function useSettingsView(isOpen: boolean, bounds: TreeBounds) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 700 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const element = containerRef.current;
    const fit = () => {
      const { clientWidth: width, clientHeight: height } = element;
      setCanvasSize({ width, height });
      setView({ x: 0, y: 0, zoom: fitZoom(width, height, bounds) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen, bounds.width, bounds.height, bounds.centerX, bounds.centerY]);

  useEffect(() => {
    const stop = () => { panStart.current = null; setIsPanning(false); };
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
    if (!isOpen) stop();
    return () => { window.removeEventListener('mouseup', stop); window.removeEventListener('blur', stop); };
  }, [isOpen]);

  const handleMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button, select, a, [data-interactive="true"]')) return;
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    panStart.current = { x: e.clientX, y: e.clientY, panX: view.x, panY: view.y };
    setIsPanning(true);
  };
  const handleMouseMove = (e: MouseEvent) => {
    const start = panStart.current;
    if (start) setView((current) => ({ ...current, x: start.panX + e.clientX - start.x, y: start.panY + e.clientY - start.y }));
  };
  const handleMouseUp = () => { panStart.current = null; setIsPanning(false); };
  const handleWheel = (e: WheelEvent) => {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || e.deltaY === 0) return;
    const x = e.clientX - rect.left - canvasSize.width / 2;
    const y = e.clientY - rect.top - canvasSize.height / 2;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setView((current) => {
      const zoom = Math.max(0.15, Math.min(1.4, current.zoom * factor));
      const ratio = zoom / current.zoom;
      return { zoom, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio };
    });
  };
  return { containerRef, zoom: view.zoom, isPanning,
    resetView: () => setView({ x: 0, y: 0, zoom: fitZoom(canvasSize.width, canvasSize.height, bounds) }),
    transform: `translate(${view.x + canvasSize.width / 2 - bounds.centerX * view.zoom}px, ${view.y + canvasSize.height / 2 - bounds.centerY * view.zoom}px) scale(${view.zoom})`,
    handleMouseDown, handleMouseMove, handleMouseUp, handleWheel };
}
