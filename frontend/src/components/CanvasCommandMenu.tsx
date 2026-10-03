import React, { useEffect, useRef, useState } from 'react';
import { MenuShortcutHint, useMenuShortcutHint } from './MenuShortcutHint';
import { PieMenuSlot, pieGestureMoved, pieSectorAt, pieSlotPoint, placePieMenu } from '../utils/pieMenuGeometry';

export type CanvasCommand = 'note' | 'parent' | 'group' | 'search' | 'copy' | 'paste' | 'fit' | 'uniform-width';

interface Props {
  position: { x: number; y: number };
  canCopy: boolean;
  canPaste: boolean;
  canUniformWidth: boolean;
  onCommand: (command: CanvasCommand) => void;
  onClose: () => void;
}

const SIZE = 72;
const RADIUS = 144;
const EXTENT = 190;
const items: { id: CanvasCommand; label: string; description: string }[] = [
  { id: 'note', label: '便签', description: '新建便签' },
  { id: 'parent', label: '父级', description: '新建父物体' },
  { id: 'group', label: '成组', description: '将选中卡片组成 Group' },
  { id: 'search', label: '搜索', description: '搜索便签' },
  { id: 'copy', label: '复制', description: '复制选中对象' },
  { id: 'paste', label: '粘贴', description: '粘贴复制的对象' },
  { id: 'fit', label: '全览', description: '全览画布' },
  { id: 'uniform-width', label: '均宽', description: '统一所有卡片宽度' },
];
const shortcuts: Partial<Record<CanvasCommand, string>> = {
  note: 'Ctrl+N', parent: 'Ctrl+P', group: 'Ctrl+G', search: 'Ctrl+F / Ctrl+K',
  copy: 'Ctrl+C', paste: 'Ctrl+V', fit: 'Shift+1', 'uniform-width': 'Ctrl+Shift+R',
};

export const CanvasCommandMenu: React.FC<Props> = ({ position, canCopy, canPaste, canUniformWidth, onCommand, onClose }) => {
  const [activeId, setActiveId] = useState<CanvasCommand | null>(null);
  const { hint, showHint, hideHint } = useMenuShortcutHint();
  const rightHeldRef = useRef(true);
  const { center, scale } = placePieMenu(position, EXTENT);
  const slots: PieMenuSlot<CanvasCommand>[] = items.map((item, index) => ({
    id: item.id, angle: -90 + index * 360 / items.length,
    disabled: item.id === 'copy' && !canCopy || item.id === 'paste' && !canPaste
      || item.id === 'uniform-width' && !canUniformWidth,
  }));
  const optionAt = (clientX: number, clientY: number) =>
    pieSectorAt({ x: clientX, y: clientY }, center, scale, RADIUS, slots, 22.5);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!rightHeldRef.current) return;
      const moved = pieGestureMoved(position, { x: event.clientX, y: event.clientY });
      const current = moved ? optionAt(event.clientX, event.clientY) : null;
      setActiveId(current);
      if (current && shortcuts[current]) {
        const idx = items.findIndex((i) => i.id === current);
        if (idx >= 0) {
          const p = pieSlotPoint({ x: EXTENT, y: EXTENT }, RADIUS, slots[idx].angle);
          const screenX = center.x + (p.x - EXTENT) * scale;
          const screenY = center.y + (p.y - EXTENT) * scale;
          showHint({
            getBoundingClientRect: () => ({
              left: screenX - (SIZE * scale) / 2,
              top: screenY - (SIZE * scale) / 2,
              width: SIZE * scale,
              height: SIZE * scale,
              bottom: screenY + (SIZE * scale) / 2,
              right: screenX + (SIZE * scale) / 2,
            } as DOMRect),
          } as HTMLElement, shortcuts[current] || null);
        }
      } else {
        hideHint();
      }
    };
    const release = (event: MouseEvent) => {
      if (event.button !== 2) return;
      rightHeldRef.current = false;
      const target = pieGestureMoved(position, { x: event.clientX, y: event.clientY })
        ? optionAt(event.clientX, event.clientY) : null;
      setActiveId(null);
      hideHint();
      if (target) onCommand(target);
      else onClose();
    };
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mouseup', release);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', release); };
  }, [center.x, center.y, scale, canCopy, canPaste, canUniformWidth, onCommand, onClose]);

  return <div className="fixed inset-0 z-[10002] bg-ink/30 backdrop-blur-sm animate-in fade-in duration-150 pointer-events-auto select-none" onMouseDown={onClose}
    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <div className="absolute" style={{ left: center.x, top: center.y, width: EXTENT * 2,
      height: EXTENT * 2, transform: `translate(-50%, -50%) scale(${scale})` }}
      onMouseDown={(event) => event.stopPropagation()}>
      {items.map(({ id, label, description }, index) => {
        const point = pieSlotPoint({ x: EXTENT, y: EXTENT }, RADIUS, slots[index].angle);
        const disabled = id === 'copy' && !canCopy || id === 'paste' && !canPaste
          || id === 'uniform-width' && !canUniformWidth;
        return <button key={id} type="button" disabled={disabled} aria-label={description} title={description}
          className={`absolute flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-ink px-1.5 text-center disabled:cursor-not-allowed disabled:opacity-40 ${activeId === id
            ? 'bg-paper text-ink' : 'bg-ink text-paper hover:bg-paper hover:text-ink'}`}
          style={{ left: point.x - SIZE / 2, top: point.y - SIZE / 2 }}
          onMouseEnter={(event) => showHint(event.currentTarget, shortcuts[id] || null)}
          onMouseLeave={hideHint}
          onClick={() => onCommand(id)}>
          <span className="max-w-[58px] text-[11px] font-bold leading-[1.2] tracking-[0.02em]">{label}</span>
        </button>;
      })}
      <div className="absolute h-8 w-8 rounded-full border-2 border-ink bg-ink"
        style={{ left: EXTENT - 16, top: EXTENT - 16 }} aria-hidden="true" />
    </div>
    <MenuShortcutHint hint={hint} />
  </div>;
};
