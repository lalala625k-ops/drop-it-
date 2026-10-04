import { useState, useCallback, useRef, useEffect, MutableRefObject } from 'react';
import { Viewport } from '../types';

export interface CanvasPin {
  id: string;
  index: number; // 1 to 8
  x: number;
  y: number;
  zoom?: number;
  createdAt: number;
}

const STORAGE_KEY = 'pinboard_canvas_pins_v1';

function loadSavedPins(): CanvasPin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((p) => typeof p.index === 'number' && p.index >= 1 && p.index <= 8 && typeof p.x === 'number' && typeof p.y === 'number');
    }
  } catch { /* ignore */ }
  return [];
}

function savePins(pins: CanvasPin[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch { /* ignore */ }
  try {
    fetch('/api/cards/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pins),
    }).catch(() => {});
  } catch { /* ignore */ }
}

interface UseCanvasPinsProps {
  viewportRef: MutableRefObject<Viewport>;
  setViewport: (vp: Viewport) => void;
  showToast?: (msg: string) => void;
}

export function useCanvasPins({ viewportRef, setViewport, showToast }: UseCanvasPinsProps) {
  const [pins, setPins] = useState<CanvasPin[]>(loadSavedPins);
  const [pinPrompt, setPinPrompt] = useState<{
    screen: { x: number; y: number };
    world: { x: number; y: number };
  } | null>(null);

  // Auto-sync pins with backend on mount across different browsers and desktop
  useEffect(() => {
    fetch('/api/cards/pins')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.pins)) {
          const serverPins: CanvasPin[] = data.pins;
          setPins((prev) => {
            if (prev.length > 0 && serverPins.length === 0) {
              // Local has pins but server is empty: sync local to server
              savePins(prev);
              return prev;
            }
            if (serverPins.length > 0 && prev.length === 0) {
              // Server has pins but local is empty (e.g. desktop app opened): load server pins
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serverPins)); } catch {}
              return serverPins;
            }
            if (serverPins.length > 0) {
              const pinMap = new Map<number, CanvasPin>();
              for (const p of prev) pinMap.set(p.index, p);
              for (const p of serverPins) pinMap.set(p.index, p);
              const merged = Array.from(pinMap.values()).sort((a, b) => a.index - b.index);
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
              return merged;
            }
            return prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  const animFrameRef = useRef<number | null>(null);

  const addOrUpdatePin = useCallback((index: number, world: { x: number; y: number }, zoom?: number) => {
    if (index < 1 || index > 8) return;
    const currentZoom = zoom || viewportRef.current.zoom || 1.0;
    const newPin: CanvasPin = {
      id: `pin-${index}`,
      index,
      x: Math.round(world.x),
      y: Math.round(world.y),
      zoom: Number(currentZoom.toFixed(2)),
      createdAt: Date.now(),
    };
    setPins((prev) => {
      const filtered = prev.filter((p) => p.index !== index);
      const next = [...filtered, newPin].sort((a, b) => a.index - b.index);
      savePins(next);
      return next;
    });
    setPinPrompt(null);
    showToast?.(`已设置图钉 ${index} (按 Ctrl+${index} 快速跳转)`);
  }, [viewportRef, showToast]);

  const removePin = useCallback((index: number) => {
    setPins((prev) => {
      const next = prev.filter((p) => p.index !== index);
      savePins(next);
      return next;
    });
    showToast?.(`已移除图钉 ${index}`);
  }, [showToast]);

  const updatePinPosition = useCallback((index: number, x: number, y: number) => {
    setPins((prev) => {
      const next = prev.map((p) =>
        p.index === index ? { ...p, x: Math.round(x), y: Math.round(y) } : p
      );
      savePins(next);
      return next;
    });
    showToast?.(`已更新图钉 ${index} 的位置`);
  }, [showToast]);

  const jumpToPin = useCallback((index: number): boolean => {
    const pin = pins.find((p) => p.index === index);
    if (!pin) return false;

    if (animFrameRef.current !== null) {
      window.cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const startVp = { ...viewportRef.current };
    const targetZoom = pin.zoom || startVp.zoom || 1.0;
    const targetX = window.innerWidth / 2 - pin.x * targetZoom;
    const targetY = window.innerHeight / 2 - pin.y * targetZoom;

    const start = performance.now();
    const duration = 280;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const factor = easeOutCubic(progress);

      setViewport({
        x: startVp.x + (targetX - startVp.x) * factor,
        y: startVp.y + (targetY - startVp.y) * factor,
        zoom: startVp.zoom + (targetZoom - startVp.zoom) * factor,
      });

      if (progress < 1) {
        animFrameRef.current = window.requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = window.requestAnimationFrame(step);
    showToast?.(`已跳转到图钉 ${index}`);
    return true;
  }, [pins, viewportRef, setViewport, showToast]);

  const openPinPrompt = useCallback((screen: { x: number; y: number }, world: { x: number; y: number }) => {
    setPinPrompt({ screen, world });
  }, []);

  const closePinPrompt = useCallback(() => {
    setPinPrompt(null);
  }, []);

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        window.cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const replacePins = useCallback((newPins: CanvasPin[]) => {
    setPins(newPins);
    savePins(newPins);
  }, []);

  return {
    pins,
    pinPrompt,
    openPinPrompt,
    closePinPrompt,
    addOrUpdatePin,
    updatePinPosition,
    removePin,
    jumpToPin,
    replacePins,
  };
}
