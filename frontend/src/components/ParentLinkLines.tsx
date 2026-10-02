import React from 'react';
import { Card, Group } from '../types';
import { getBundleParentIds, treeParentId } from '../utils/groupRelations';
import { linkEndpoints } from '../utils/linkEndpoints';

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

  const bundleIds = new Set(groups.filter((group) => group.kind === 'bundle').map((group) => group.id));
  const selectedBranch = (id: string) => {
    const seen = new Set<string>();
    let current: string | null = id;
    while (current && !seen.has(current)) {
      if (selectedCardIds.has(current) || selectedGroupIds.has(current)) return true;
      seen.add(current);
      current = treeParentId(current, cards, groups);
    }
    return false;
  };
  const addLink = (childId: string, parentId: string, bundle?: Group) => {
    const endpoints = linkEndpoints(parentId, childId, cards, groups);
    if (!endpoints) return;
    if (!bundle && visibleCardIdSet && !visibleCardIdSet.has(childId)
      && !selectedCardIds.has(childId) && !selectedCardIds.has(parentId)
      && !selectedGroupIds.has(parentId)) return;
    const members = bundle ? cards.filter((card) => card.bundleId === bundle.id) : [];
    const selected = selectedBranch(childId);
    links.push({ groupId: parentId, groupTitle: '', gx: endpoints.start.x, gy: endpoints.start.y,
      cx: endpoints.end.x, cy: endpoints.end.y, isSelected: selected,
      isHighlighted: selected || dragOverGroupId === parentId || dragOverGroupId === childId,
      bundleMemberCount: bundle ? members.length : undefined });
  };
  for (const bundle of groups.filter((group) => group.kind === 'bundle')) {
    const parentId = getBundleParentIds(cards, bundle)[0];
    if (parentId) addLink(bundle.id, parentId, bundle);
  }
  for (const card of cards) {
    if (card.bundleId && bundleIds.has(card.bundleId)) continue;
    if (card.groupId) addLink(card.id, card.groupId);
  }

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
