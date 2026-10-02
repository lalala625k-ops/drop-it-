import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Card, Group, Viewport } from '../types';
import { bundleCollapsedHeight, bundleCollapsedWidth, bundleOutlinePoints } from '../hooks/useBundleGroups';
import { cardVisualBounds } from '../utils/cardBounds';
import { clamp, MIN_CANVAS_ZOOM } from '../utils/canvas';
import { GROUP_COLOR_FAMILIES, groupBaseColor } from '../utils/groupColors';

interface MinimapNavProps {
  expanded: boolean;
  cards: Card[];
  groups: Group[];
  viewport: Viewport;
  onNavigate: (viewport: Viewport) => void;
}

const PADDING = 12;

export const MinimapNav: React.FC<MinimapNavProps> = ({
  expanded,
  cards,
  groups,
  viewport,
  onNavigate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [windowSize, setWindowSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const groupColors = useMemo(() => {
    const parentColors = new Map(groups.filter((group) => group.kind !== 'bundle')
      .map((group, index) => [group.id, group.color || groupBaseColor(GROUP_COLOR_FAMILIES[index % 6].hue)]));
    const bundleColors = new Map(groups.filter((group) => group.kind === 'bundle').map((bundle, index) => {
      const linked = cards.find((card) => card.bundleId === bundle.id && card.groupId && parentColors.has(card.groupId));
      return [bundle.id, (linked?.groupId && parentColors.get(linked.groupId)) || bundle.color ||
        groupBaseColor(GROUP_COLOR_FAMILIES[index % 6].hue)] as const;
    }));
    return { parentColors, bundleColors };
  }, [cards, groups]);

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // World bounds enclosing all cards, groups, and current viewport
  const { minX, minY, scale, offsetX, offsetY, vpRect, mapWidth, mapHeight } = useMemo(() => {
    const vpLeft = -viewport.x / viewport.zoom;
    const vpTop = -viewport.y / viewport.zoom;
    const vpRight = (windowSize.width - viewport.x) / viewport.zoom;
    const vpBottom = (windowSize.height - viewport.y) / viewport.zoom;

    let bMinX = vpLeft;
    let bMaxX = vpRight;
    let bMinY = vpTop;
    let bMaxY = vpBottom;

    cards.forEach((c) => {
      const bounds = cardVisualBounds(c);
      bMinX = Math.min(bMinX, bounds.x);
      bMaxX = Math.max(bMaxX, bounds.x + bounds.width);
      bMinY = Math.min(bMinY, bounds.y);
      bMaxY = Math.max(bMaxY, bounds.y + bounds.height);
    });

    groups.forEach((g) => {
      const gw = g.kind === 'bundle' && g.collapsed ? bundleCollapsedWidth(g.width) : (g.width || 120);
      const gh = g.kind === 'bundle' && g.collapsed ? bundleCollapsedHeight(cards.filter((card) => card.bundleId === g.id).length) : (g.height || 120);
      bMinX = Math.min(bMinX, g.x);
      bMaxX = Math.max(bMaxX, g.x + gw);
      bMinY = Math.min(bMinY, g.y);
      bMaxY = Math.max(bMaxY, g.y + gh);
    });

    // Generous world padding
    const worldPad = 250;
    bMinX -= worldPad;
    bMaxX += worldPad;
    bMinY -= worldPad;
    bMaxY += worldPad;

    const worldW = Math.max(1200, bMaxX - bMinX);
    const worldH = Math.max(800, bMaxY - bMinY);
    const aspect = worldW / worldH;
    const mapWidth = expanded
      ? aspect >= 1 ? windowSize.width / 2 : Math.max(180, Math.min(windowSize.width / 2, windowSize.height * aspect / 2))
      : Math.min(280, windowSize.width - 32);
    const mapHeight = expanded
      ? aspect < 1 ? windowSize.height / 2 : Math.max(180, Math.min(windowSize.height / 2, windowSize.width / aspect / 2))
      : Math.min(190, windowSize.height - 32);

    const innerW = mapWidth - PADDING * 2;
    const innerH = mapHeight - PADDING * 2;

    const fitScale = Math.min(innerW / worldW, innerH / worldH);
    const renderedW = worldW * fitScale;
    const renderedH = worldH * fitScale;

    const offX = PADDING + (innerW - renderedW) / 2;
    const offY = PADDING + (innerH - renderedH) / 2;

    // Viewport box in minimap coordinates
    const vBoxX = offX + (vpLeft - bMinX) * fitScale;
    const vBoxY = offY + (vpTop - bMinY) * fitScale;
    const vBoxW = (vpRight - vpLeft) * fitScale;
    const vBoxH = (vpBottom - vpTop) * fitScale;

    return {
      minX: bMinX,
      minY: bMinY,
      scale: fitScale,
      offsetX: offX,
      offsetY: offY,
      vpRect: { x: vBoxX, y: vBoxY, w: vBoxW, h: vBoxH },
      mapWidth,
      mapHeight,
    };
  }, [cards, groups, viewport, expanded, windowSize]);

  const localPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clamp(clientX - rect.left, 0, mapWidth), y: clamp(clientY - rect.top, 0, mapHeight) };
  };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const start = dragStartRef.current;
      const point = localPoint(event.clientX, event.clientY);
      if (!start || !point) return;
      setDragRect({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y),
        width: Math.abs(start.x - point.x), height: Math.abs(start.y - point.y) });
    };
    const onUp = (event: MouseEvent) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      setDragRect(null);
      const point = localPoint(event.clientX, event.clientY);
      if (!start || !point || scale <= 0) return;
      const width = Math.abs(point.x - start.x);
      const height = Math.abs(point.y - start.y);
      if (width < 6 || height < 6) {
        const worldX = minX + (point.x - offsetX) / scale;
        const worldY = minY + (point.y - offsetY) / scale;
        const zoom = 1;
        onNavigate({ x: windowSize.width / 2 - worldX * zoom,
          y: windowSize.height / 2 - worldY * zoom, zoom });
        return;
      }
      const left = minX + (Math.min(start.x, point.x) - offsetX) / scale;
      const top = minY + (Math.min(start.y, point.y) - offsetY) / scale;
      const worldWidth = width / scale;
      const worldHeight = height / scale;
      const zoom = clamp(Math.min(windowSize.width / worldWidth, windowSize.height / worldHeight), MIN_CANVAS_ZOOM, 3);
      const centerX = left + worldWidth / 2;
      const centerY = top + worldHeight / 2;
      onNavigate({ x: windowSize.width / 2 - centerX * zoom,
        y: windowSize.height / 2 - centerY * zoom, zoom });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [mapWidth, mapHeight, minX, minY, offsetX, offsetY, scale, windowSize, onNavigate]);

  return (
    <div
      ref={containerRef}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        dragStartRef.current = localPoint(event.clientX, event.clientY);
      }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      className={`fixed ${expanded ? 'z-[30001]' : 'z-[30000]'} pointer-events-auto bg-paper border-2 border-ink overflow-hidden cursor-crosshair select-none rounded-none`}
      style={{
        left: expanded ? '50%' : '16px',
        top: expanded ? '50%' : undefined,
        bottom: expanded ? undefined : '16px',
        transform: expanded ? 'translate(-50%, -50%)' : undefined,
        width: `${mapWidth}px`,
        height: `${mapHeight}px`,
      }}
    >
      {/* Background Map Canvas / Paper Texture */}
      <div className="absolute inset-0 bg-[#f4f2ed]" />

      {/* SVG Layer for Network Links */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {cards.map((c) => {
          if (!c.groupId || c.bundleId) return null;
          const parentGroup = groups.find((g) => g.id === c.groupId);
          if (!parentGroup) return null;

          const gw = parentGroup.width || 120;
          const gh = parentGroup.height || 120;
          const gCenterX = offsetX + (parentGroup.x + gw / 2 - minX) * scale;
          const gCenterY = offsetY + (parentGroup.y + gh / 2 - minY) * scale;

          const cCenterX = offsetX + (c.x + c.width / 2 - minX) * scale;
          const cCenterY = offsetY + (c.y + c.height / 2 - minY) * scale;

          return (
            <line
              key={`link-${c.id}-${parentGroup.id}`}
              x1={gCenterX}
              y1={gCenterY}
              x2={cCenterX}
              y2={cCenterY}
              stroke="#a8a7a2"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          );
        })}
        {groups.filter((g) => g.kind === 'bundle').flatMap((bundle) => {
          const parentIds = [...new Set(cards.filter((card) => card.bundleId === bundle.id && card.groupId).map((card) => card.groupId!))];
          return parentIds.map((parentId) => {
            const parent = groups.find((group) => group.id === parentId);
            if (!parent) return null;
            const bw = bundle.collapsed ? bundleCollapsedWidth(bundle.width) : bundle.width;
            const bh = bundle.collapsed ? bundleCollapsedHeight(cards.filter((card) => card.bundleId === bundle.id).length) : bundle.height;
            return <line key={`bundle-link-${bundle.id}-${parentId}`}
              x1={offsetX + (parent.x + parent.width / 2 - minX) * scale}
              y1={offsetY + (parent.y + parent.height / 2 - minY) * scale}
              x2={offsetX + (bundle.x + bw / 2 - minX) * scale}
              y2={offsetY + (bundle.y + bh / 2 - minY) * scale}
              stroke="#a8a7a2" strokeWidth="1" strokeDasharray="2 2" />;
          });
        })}
      </svg>

      {/* Colored Group areas sit behind their member cards. */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {groups.filter((group) => group.kind === 'bundle').map((group) => {
          const color = groupColors.bundleColors.get(group.id) || '#a8a7a2';
          const members = cards.filter((card) => card.bundleId === group.id);
          const points = group.collapsed
            ? [{ x: 0, y: 0 }, { x: bundleCollapsedWidth(group.width), y: 0 },
              { x: bundleCollapsedWidth(group.width), y: bundleCollapsedHeight(members.length) },
              { x: 0, y: bundleCollapsedHeight(members.length) }]
            : bundleOutlinePoints(members, group);
          const path = points.map((point, index) => `${index ? 'L' : 'M'} ${offsetX + (group.x + point.x - minX) * scale} ${offsetY + (group.y + point.y - minY) * scale}`).join(' ') + ' Z';
          return <path key={group.id} d={path} fill={color} fillOpacity={groupColors.bundleColors.get(group.id) ? 0.55 : 0.12}
            stroke={color} strokeWidth="2" />;
        })}
      </svg>

      {/* Cards: Squares & Rectangles */}
      {cards.map((c) => {
        const cx = offsetX + (c.x - minX) * scale;
        const cy = offsetY + (c.y - minY) * scale;
        const cw = Math.max(4, c.width * scale);
        const ch = Math.max(3, c.height * scale);

        return (
          <div
            key={c.id}
            className="absolute border border-ink pointer-events-none transition-transform"
            style={{
              left: `${cx}px`,
              top: `${cy}px`,
              width: `${cw}px`,
              height: `${ch}px`,
              backgroundColor: (c.bundleId && groupColors.bundleColors.get(c.bundleId)) ||
                (c.groupId && groupColors.parentColors.get(c.groupId)) || c.color || '#ffffff',
              borderColor: (c.bundleId && groupColors.bundleColors.get(c.bundleId)) || c.borderColor || '#1d1d1d',
            }}
          />
        );
      })}

      {/* Circular parent objects */}
      {groups.filter((group) => group.kind !== 'bundle').map((g) => {
        const gw = g.width || 120;
        const width = Math.max(6, (g.kind === 'bundle' && g.collapsed ? bundleCollapsedWidth(gw) : gw) * scale);
        const height = Math.max(6, (g.kind === 'bundle' && g.collapsed ? bundleCollapsedHeight(cards.filter((card) => card.bundleId === g.id).length) : (g.height || 120)) * scale);
        const gx = offsetX + (g.x - minX) * scale;
        const gy = offsetY + (g.y - minY) * scale;

        return (
          <div
            key={g.id}
            className={`absolute border-2 border-ink pointer-events-none ${g.kind === 'bundle' ? '' : 'rounded-full'}`}
            style={{
              left: `${gx}px`,
              top: `${gy}px`,
              width: `${width}px`,
              height: `${g.kind === 'bundle' ? height : width}px`,
              backgroundColor: g.color || '#ffffff',
              borderColor: g.color || '#1d1d1d',
            }}
          />
        );
      })}

      {/* Current Viewport Field of View Indicator */}
      <div
        className="absolute border-2 border-ink pointer-events-none bg-ink/10 transition-all duration-75"
        style={{
          left: `${vpRect.x}px`,
          top: `${vpRect.y}px`,
          width: `${vpRect.w}px`,
          height: `${vpRect.h}px`,
        }}
      />

      {dragRect && dragRect.width + dragRect.height >= 6 && <div
        className="absolute border-2 border-ink bg-ink/10 pointer-events-none"
        style={{ left: dragRect.x, top: dragRect.y, width: dragRect.width, height: dragRect.height }} />}

      {/* Subtle outer indicator dot in corner */}
      <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-ink/30 pointer-events-none" />
    </div>
  );
};
