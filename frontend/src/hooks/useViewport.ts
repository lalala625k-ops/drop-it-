import { useState, useRef, useEffect, useCallback } from 'react';
import { Viewport, Card, Group } from '../types';
import { clamp, computeFitViewport, computeCardFocusViewport, MIN_CANVAS_ZOOM } from '../utils/canvas';

const VIEWPORT_STORAGE_KEY = 'pinboard_viewport_v1';

export function getSavedViewport(): Viewport | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.zoom === 'number' &&
      parsed.zoom >= MIN_CANVAS_ZOOM &&
      parsed.zoom <= 3.0
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveViewportToStorage(vp: Viewport) {
  try {
    localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(vp));
  } catch {
    // ignore
  }
}

export function useViewport(options?: { invertWheelZoom?: boolean }) {
  const [viewport, setViewport] = useState<Viewport>(() => getSavedViewport() || { x: 0, y: 0, zoom: 1.0 });
  const viewportRef = useRef<Viewport>(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveViewportToStorage(viewport);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [viewport]);

  const previousViewportRef = useRef<Viewport | null>(null);
  const focusedCardIdRef = useRef<string | null>(null);

  const mouseScreenRef = useRef<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  });
  const mouseWorldRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseScreenRef.current = { x: e.clientX, y: e.clientY };
    const vp = viewportRef.current;
    mouseWorldRef.current = {
      x: (e.clientX - vp.x) / vp.zoom,
      y: (e.clientY - vp.y) / vp.zoom,
    };
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Wheel zoom centered at mouse pointer.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const target = e.target as HTMLElement;

    const isCanvasObject = !!target.closest('[data-card-id], [data-group-id], [data-bundle-id]');
    // Controls outside the canvas objects keep their own scroll behavior.
    if (!isCanvasObject && (
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'INPUT' ||
      target.closest('textarea') ||
      target.closest('.overflow-y-auto') ||
      target.closest('.overflow-auto')
    )) {
      return;
    }

    e.preventDefault();
    const isZoomIn = options?.invertWheelZoom ? e.deltaY > 0 : e.deltaY < 0;
    const zoomFactor = isZoomIn ? 1.12 : 0.88;
    const { clientX, clientY } = e;

    setViewport((prev) => {
      const nextZoom = clamp(prev.zoom * zoomFactor, MIN_CANVAS_ZOOM, 3.0);
      const nextX = clientX - (clientX - prev.x) * (nextZoom / prev.zoom);
      const nextY = clientY - (clientY - prev.y) * (nextZoom / prev.zoom);
      return { x: nextX, y: nextY, zoom: nextZoom };
    });
  }, [options?.invertWheelZoom]);

  // Double click card: smooth 80% focus toggle
  const handleCardDoubleClick = useCallback((card: Card) => {
    if (focusedCardIdRef.current === card.id && previousViewportRef.current) {
      setViewport(previousViewportRef.current);
      previousViewportRef.current = null;
      focusedCardIdRef.current = null;
    } else {
      previousViewportRef.current = viewportRef.current;
      focusedCardIdRef.current = card.id;
      setViewport(computeCardFocusViewport(card, window.innerWidth, window.innerHeight));
    }
  }, []);

  // Double click blank canvas: fit all cards & groups
  const handleCanvasDoubleClick = useCallback((cards: Card[], groups: Group[]) => {
    const fitted = computeFitViewport(cards, groups, window.innerWidth, window.innerHeight);
    if (fitted) {
      setViewport(fitted);
      previousViewportRef.current = null;
      focusedCardIdRef.current = null;
    }
  }, []);

  return {
    viewport,
    setViewport,
    viewportRef,
    mouseScreenRef,
    mouseWorldRef,
    handleWheel,
    handleCardDoubleClick,
    handleCanvasDoubleClick,
  };
}
