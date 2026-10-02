import React, { useMemo, useRef, useState } from 'react';
import { groupGradientColor } from '../utils/groupColors';

interface GradientColorArcProps {
  width: number;
  height: number;
  center: { x: number; y: number };
  onSelect: (color: string) => void;
}

const OUTER_RADIUS = 138;
const INNER_RADIUS = 88;
const SEGMENTS = 64;

const pointOnArc = (center: { x: number; y: number }, radius: number, progress: number) => {
  const angle = (-90 - progress * 180) * Math.PI / 180;
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
};

const sectorPath = (center: { x: number; y: number }, innerRadius: number, outerRadius: number, start: number, end: number) => {
  const outerStart = pointOnArc(center, outerRadius, start);
  const outerEnd = pointOnArc(center, outerRadius, end);
  const innerEnd = pointOnArc(center, innerRadius, end);
  const innerStart = pointOnArc(center, innerRadius, start);
  return `M ${outerStart.x} ${outerStart.y} L ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} L ${innerStart.x} ${innerStart.y} Z`;
};

export const GradientColorArc: React.FC<GradientColorArcProps> = ({ width, height, center, onSelect }) => {
  const draggingRef = useRef(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const indexAt = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * width / rect.width - center.x;
    const y = (event.clientY - rect.top) * height / rect.height - center.y;
    const radius = Math.hypot(x, y);
    if (radius < INNER_RADIUS - 3 || radius > OUTER_RADIUS + 18 || x > 0) return null;
    const angle = Math.atan2(y, x);
    const leftArcAngle = angle > 0 ? angle - Math.PI * 2 : angle;
    const progress = (-Math.PI / 2 - leftArcAngle) / Math.PI;
    if (progress < 0 || progress > 1) return null;
    return Math.min(SEGMENTS - 1, Math.floor(progress * SEGMENTS));
  };
  const segments = useMemo(() => Array.from({ length: SEGMENTS }, (_, index) => {
    const start = index / SEGMENTS;
    const end = (index + 1) / SEGMENTS;
    return {
      path: sectorPath(center, INNER_RADIUS, OUTER_RADIUS, start, end),
      raisedPath: sectorPath(center, INNER_RADIUS, OUTER_RADIUS + 16, start + 0.0002, end - 0.0002),
      color: groupGradientColor((start + end) / 2),
    };
  }), [center]);

  return <svg className="absolute inset-0 touch-none" width={width} height={height}
    aria-label="64 色渐变色环：悬停预览，点击或沿圆弧拖动选色"
    onPointerDown={(event) => {
      const index = indexAt(event);
      if (event.button !== 0 || index === null) return;
      event.stopPropagation();
      draggingRef.current = true;
      setPreviewIndex(index);
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const index = indexAt(event);
      if (index !== null || !draggingRef.current) setPreviewIndex(index);
    }}
    onPointerUp={(event) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const index = indexAt(event) ?? previewIndex;
      if (index === null) return;
      setPreviewIndex(index);
      onSelect(segments[index].color);
    }}
    onPointerLeave={() => { if (!draggingRef.current) setPreviewIndex(null); }}
    onPointerCancel={() => { draggingRef.current = false; setPreviewIndex(null); }}>
    {segments.map((segment, index) => <path key={index} d={segment.path} data-color-index={index}
      fill={previewIndex === null ? segment.color : '#ffffff'}
      stroke={previewIndex === null ? segment.color : '#ffffff'} strokeWidth="0.8" />)}
    {previewIndex !== null && <path d={segments[previewIndex].raisedPath}
      fill={segments[previewIndex].color} stroke="#1d1d1d" strokeWidth="1.5" pointerEvents="none" />}
  </svg>;
};
