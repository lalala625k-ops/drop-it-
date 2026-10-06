import React, { useMemo } from 'react';
import { CanvasClipboardSnapshot, clipboardBounds } from '../utils/canvasClipboard';
import { bundleCollapsedHeight, bundleCollapsedWidth, bundleOutline } from '../hooks/useBundleGroups';
import { getBundleParentIds } from '../utils/groupRelations';
import { treeNodeCenter } from '../utils/treeTargets';
import { PIN_PATH, PIN_SIZE } from '../utils/canvasPinGeometry';

interface Props {
  snapshot: CanvasClipboardSnapshot;
  screen: { x: number; y: number };
  zoom: number;
}

export const ClipboardPastePreview: React.FC<Props> = ({ snapshot, screen, zoom }) => {
  const bounds = useMemo(() => clipboardBounds(snapshot), [snapshot]);
  if (!bounds) return null;
  const groups = new Map(snapshot.groups.map((group) => [group.id, group]));
  const links: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
  const visibleNodes = [
    ...snapshot.cards.filter((card) => !card.bundleId || !groups.has(card.bundleId)),
    ...snapshot.groups.filter((group) => group.kind === 'bundle'),
  ];
  visibleNodes.forEach((node) => {
    const parentId = groups.has(node.id)
      ? getBundleParentIds(snapshot.cards, groups.get(node.id)!)[0] : (node as typeof snapshot.cards[number]).groupId;
    if (!parentId) return;
    const parent = treeNodeCenter(parentId, snapshot.cards, snapshot.groups);
    const child = treeNodeCenter(node.id, snapshot.cards, snapshot.groups);
    if (parent && child) links.push({ x1: parent.x, y1: parent.y,
      x2: child.x, y2: child.y, key: `${parentId}:${node.id}` });
  });

  return <svg className="fixed z-[10001] pointer-events-none overflow-visible drop-shadow-lg"
    aria-hidden="true" style={{ left: screen.x - bounds.width * zoom / 2,
      top: screen.y - bounds.height * zoom / 2, width: bounds.width * zoom,
      height: bounds.height * zoom, opacity: 0.78 }}
    viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}>
    {links.map((link) => <line key={link.key} x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2}
      stroke="#1d1d1d" strokeWidth="3" />)}
    {snapshot.groups.filter((group) => group.kind === 'bundle').map((group) => group.collapsed
      ? <rect key={group.id} x={group.x} y={group.y}
          width={bundleCollapsedWidth(group.width)}
          height={bundleCollapsedHeight(snapshot.cards.filter((card) => card.bundleId === group.id).length)}
          fill={group.color || '#ffffff'} fillOpacity="0.65" stroke="#1d1d1d" strokeWidth="3" />
      : <path key={group.id} d={bundleOutline(snapshot.cards.filter((card) => card.bundleId === group.id), group)}
          transform={`translate(${group.x} ${group.y})`} fill={group.color || '#ffffff'}
          fillOpacity="0.35" stroke="#1d1d1d" strokeWidth="3" strokeDasharray="7 5" />)}
    {snapshot.cards.filter((card) => !card.bundleId || !groups.get(card.bundleId)?.collapsed)
      .map((card) => <g key={card.id}>
      <rect x={card.x} y={card.y} width={card.width} height={card.height}
        fill="#ffffff" stroke="#1d1d1d" strokeWidth="2" />
      {card.image && card.type !== 'text'
        ? <image href={card.image} x={card.x + 3} y={card.y + 3}
          width={card.width - 6} height={card.height - 6} preserveAspectRatio="xMidYMid meet" />
        : <path d={`M ${card.x + 14} ${card.y + 20} h ${Math.max(0, card.width - 28)}
          M ${card.x + 14} ${card.y + 36} h ${Math.max(0, card.width * 0.65)}`}
          stroke="#1d1d1d" strokeWidth="3" opacity="0.5" />}
    </g>)}
    {snapshot.groups.filter((group) => group.kind !== 'bundle').map((group) =>
      <circle key={group.id} cx={group.x + group.width / 2} cy={group.y + group.height / 2}
        r={group.width / 2} fill={group.color || '#ffffff'} stroke="#1d1d1d" strokeWidth="3" />)}
    {(snapshot.pins || []).map((pin) => <g key={pin.id} transform={`translate(${pin.x - PIN_SIZE / 2} ${pin.y - PIN_SIZE / 2})`}>
      <path d={PIN_PATH} fill="#1d1d1d" />
      <circle cx="66.5" cy="66.5" r="9.5" fill="#1d1d1d" />
      <text x="66.5" y="66.5" textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="11">{pin.index}</text>
    </g>)}
  </svg>;
};
