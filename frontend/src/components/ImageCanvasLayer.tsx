import React, { memo, useEffect, useRef, useState } from 'react';
import { Card, Viewport } from '../types';
import { getThumbnailUrl } from '../utils/thumbnail';

interface Props {
  cards: Card[];
  viewport: Viewport;
}

const imageCache = new Map<string, HTMLImageElement>();
const pendingImages = new Map<string, { image: HTMLImageElement; listeners: Set<() => void> }>();
const failedImages = new Set<string>();

function loadImage(src: string, onReady: () => void) {
  const cached = imageCache.get(src);
  if (cached?.complete && cached.naturalWidth > 0) return cached;
  if (failedImages.has(src)) return;
  const pending = pendingImages.get(src);
  if (pending) {
    pending.listeners.add(onReady);
    return pending.image;
  }
  const image = new Image();
  const listeners = new Set([onReady]);
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.onload = () => {
    imageCache.set(src, image);
    pendingImages.delete(src);
    listeners.forEach((listener) => listener());
  };
  image.onerror = () => {
    failedImages.add(src);
    pendingImages.delete(src);
    // Redraw using the original when an explicit thumbnail is unavailable.
    listeners.forEach((listener) => listener());
  };
  pendingImages.set(src, { image, listeners });
  image.src = src;
  return image;
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const boxRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  if (imageRatio > boxRatio) {
    sourceWidth = image.naturalHeight * boxRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / boxRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

const ImageCanvasLayerInner: React.FC<Props> = ({ cards, viewport }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawFrameRef = useRef<number | null>(null);
  const [windowSize, setWindowSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cards.length === 0) return;
    // Rasterize only the viewport plus a pan buffer, at screen resolution.
    // World-space bounds can otherwise allocate hundreds of MB at low zoom.
    const buffer = 300;
    const screenWidth = windowSize.width + buffer * 2;
    const screenHeight = windowSize.height + buffer * 2;
    const zoom = Math.max(0.01, viewport.zoom);
    const minX = (-viewport.x - buffer) / zoom;
    const minY = (-viewport.y - buffer) / zoom;
    const width = screenWidth / zoom;
    const height = screenHeight / zoom;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, 8192 / screenWidth, 8192 / screenHeight);
    const pixelWidth = Math.ceil(screenWidth * ratio);
    const pixelHeight = Math.ceil(screenHeight * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.left = `${minX}px`;
    canvas.style.top = `${minY}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;

    let active = true;
    const redraw = () => {
      if (!active || drawFrameRef.current !== null) return;
      drawFrameRef.current = window.requestAnimationFrame(() => {
        drawFrameRef.current = null;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, pixelWidth, pixelHeight);
        context.setTransform(ratio * zoom, 0, 0, ratio * zoom, 0, 0);
        for (const card of cards) {
          if (card.x + card.width < minX || card.y + card.height < minY ||
            card.x > minX + width || card.y > minY + height) continue;
          const preferred = getThumbnailUrl(card.image, card.thumbnail) || card.image!;
          const src = failedImages.has(preferred) ? card.image! : preferred;
          const image = imageCache.get(src);
          if (image?.complete && image.naturalWidth > 0) {
            drawCover(context, image, card.x - minX, card.y - minY, card.width, card.height);
          } else {
            loadImage(src, redraw);
          }
        }
      });
    };
    redraw();
    return () => {
      active = false;
      pendingImages.forEach((pending) => pending.listeners.delete(redraw));
      if (drawFrameRef.current !== null) window.cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = null;
    };
  }, [cards, viewport.x, viewport.y, viewport.zoom, windowSize]);

  if (cards.length === 0) return null;
  // Keep cached image pixels above the translucent Group fill. The Group
  // outline remains visible, while its decorative wash cannot tint images.
  return <canvas ref={canvasRef} aria-hidden="true" className="absolute pointer-events-none z-[1]" />;
};

export const ImageCanvasLayer = memo(ImageCanvasLayerInner, (previous, next) =>
  previous.viewport.x === next.viewport.x && previous.viewport.y === next.viewport.y &&
  previous.viewport.zoom === next.viewport.zoom && previous.cards.length === next.cards.length &&
  previous.cards.every((card, index) => {
    const other = next.cards[index];
    return card.id === other.id && card.x === other.x && card.y === other.y &&
      card.width === other.width && card.height === other.height &&
      card.image === other.image && card.thumbnail === other.thumbnail;
  }));
