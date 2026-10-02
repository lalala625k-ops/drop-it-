import React from 'react';
import { Card, Group } from '../types';
import { bundleCollapsedHeight, bundleCollapsedWidth, bundleOutlinePoints } from '../hooks/useBundleGroups';

type Point = { x: number; y: number };

function boundaryPoint(from: Point, to: Point, outline: Point[]): Point {
  const ray = { x: to.x - from.x, y: to.y - from.y };
  let nearest = Infinity;
  let result = to;
  for (let i = 0; i < outline.length; i++) {
    const edgeStart = outline[i];
    const edgeEnd = outline[(i + 1) % outline.length];
    const edge = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y };
    const denominator = ray.x * edge.y - ray.y * edge.x;
    if (Math.abs(denominator) < 1e-8) continue;
    const offset = { x: edgeStart.x - from.x, y: edgeStart.y - from.y };
    const t = (offset.x * edge.y - offset.y * edge.x) / denominator;
    const u = (offset.x * ray.y - offset.y * ray.x) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < nearest) {
      nearest = t;
      result = { x: from.x + t * ray.x, y: from.y + t * ray.y };
    }
  }
  return result;
}

function bundleLinkProgress(memberCount: number): number {
  return Math.min(Math.max(memberCount - 1, 0), 9) / 9;
}

function bundleLinkColor(progress: number): string {
  const start = [168, 167, 162]; // Ash, matching a single-card link.
  const end = [29, 29, 29]; // Ink; the link group applies 80% opacity.
  return `rgb(${start.map((channel, i) => Math.round(channel + (end[i] - channel) * progress)).join(', ')})`;
}

export interface InteractiveWire {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  sourceCardId: string;
  isSnapping?: boolean;
}

interface ParentLinkLinesProps {
  groups: Group[];
  cards: Card[];
  selectedGroupIds: Set<string>;
  selectedCardIds: Set<string>;
  dragOverGroupId: string | null;
  interactiveWire?: InteractiveWire | null;
  visibleCardIdSet?: Set<string>;
}

export const ParentLinkLines: React.FC<ParentLinkLinesProps> = ({
  groups,
  cards,
  selectedGroupIds,
  selectedCardIds,
  dragOverGroupId,
  interactiveWire,
  visibleCardIdSet,
}) => {
  const links: {
    groupId: string;
    groupTitle: string;
    gx: number;
    gy: number;
    cx: number;
    cy: number;
    isSelected: boolean;
    isHighlighted: boolean;
    bundleMemberCount?: number;
  }[] = [];

  groups.forEach((group) => {
    if (group.kind === 'bundle') return;
    const gSize = group.width || 120;
    const gx = group.x + gSize / 2;
    const gy = group.y + gSize / 2;
    const isGroupSelected = selectedGroupIds.has(group.id);
    const isGroupDragOver = dragOverGroupId === group.id;

    const bundleIds = new Set(cards.filter((card) => card.groupId === group.id && card.bundleId).map((card) => card.bundleId!));
    bundleIds.forEach((bundleId) => {
      const bundle = groups.find((item) => item.id === bundleId && item.kind === 'bundle');
      if (!bundle) return;
      const members = cards.filter((card) => card.bundleId === bundleId);
      const collapsedWidth = bundleCollapsedWidth(bundle.width);
      const cx = bundle.x + (bundle.collapsed ? collapsedWidth : bundle.width) / 2;
      const collapsedHeight = bundleCollapsedHeight(members.length);
      const cy = bundle.y + (bundle.collapsed ? collapsedHeight : bundle.height) / 2;
      const localOutline = bundle.collapsed
        ? [{ x: 0, y: 0 }, { x: collapsedWidth, y: 0 }, { x: collapsedWidth, y: collapsedHeight }, { x: 0, y: collapsedHeight }]
        : bundleOutlinePoints(members, bundle);
      const edge = boundaryPoint({ x: gx, y: gy }, { x: cx, y: cy },
        localOutline.map((point) => ({ x: point.x + bundle.x, y: point.y + bundle.y })));
      const highlighted = isGroupSelected || selectedGroupIds.has(bundleId);
      links.push({ groupId: group.id, groupTitle: group.title, gx, gy, cx: edge.x, cy: edge.y,
        isSelected: highlighted, isHighlighted: highlighted || isGroupDragOver,
        bundleMemberCount: members.length });
    });

    cards
      .filter((card) => {
        if (card.groupId !== group.id || card.bundleId) return false;
        // Optimization: if visibleCardIdSet provided, skip line if card is offscreen (unless highlighted)
        if (visibleCardIdSet && !visibleCardIdSet.has(card.id) && !isGroupSelected && !selectedCardIds.has(card.id)) {
          return false;
        }
        return true;
      })
      .forEach((card) => {
        const cx = card.x + card.width / 2;
        const cy = card.y + card.height / 2;
        const isCardSelected = selectedCardIds.has(card.id);

        links.push({
          groupId: group.id,
          groupTitle: group.title,
          gx,
          gy,
          cx,
          cy,
          isSelected: isGroupSelected || isCardSelected,
          isHighlighted: isGroupDragOver || isGroupSelected || isCardSelected,
        });
      });
  });

  if (links.length === 0 && !interactiveWire) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible w-full h-full z-0">
      {links.map((link, idx) => {
        const isBold = link.isSelected || link.isHighlighted;
        const progress = link.bundleMemberCount === undefined ? 0 : bundleLinkProgress(link.bundleMemberCount);
        const strokeColor = isBold ? '#1d1d1d' : link.bundleMemberCount === undefined
          ? '#a8a7a2' : bundleLinkColor(progress);
        const strokeWidth = isBold ? 5 : link.bundleMemberCount === undefined ? 1 : 1 + progress;
        const dotRadius = isBold ? 3.5 : 2.5;

        return (
          <g key={`${link.groupId}-${idx}`} opacity={0.8}>
            <line
              x1={link.gx}
              y1={link.gy}
              x2={link.cx}
              y2={link.cy}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <circle cx={link.gx} cy={link.gy} r={dotRadius} fill={strokeColor} />
            <circle cx={link.cx} cy={link.cy} r={dotRadius} fill={strokeColor} />
          </g>
        );
      })}

      {interactiveWire && (
        <g>
          <line
            x1={interactiveWire.startX}
            y1={interactiveWire.startY}
            x2={interactiveWire.targetX}
            y2={interactiveWire.targetY}
            stroke="#1d1d1d"
            strokeWidth={interactiveWire.isSnapping ? 3.5 : 2}
            strokeLinecap="round"
          />
          <circle
            cx={interactiveWire.startX}
            cy={interactiveWire.startY}
            r={3.5}
            fill="#1d1d1d"
          />
          <circle
            cx={interactiveWire.targetX}
            cy={interactiveWire.targetY}
            r={interactiveWire.isSnapping ? 5.5 : 3.5}
            fill="#1d1d1d"
            stroke="#ffffff"
            strokeWidth={interactiveWire.isSnapping ? 2 : 1}
          />
        </g>
      )}
    </svg>
  );
};
